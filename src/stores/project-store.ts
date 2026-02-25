/**
 * @file Project store — manages project directory, file tree, file preview/editing, and .gitignore prompts.
 */
import { create } from 'zustand';
import type { FileNode } from '../../shared/types';
import { IPC } from '../../shared/ipc';
import { invoke } from '../lib/ipc-client';

interface ProjectStore {
  projectPath: string | null;
  fileTree: FileNode[];
  selectedFilePath: string | null;
  previewContent: string | null;
  previewError: string | null;
  isLoadingTree: boolean;
  isLoadingPreview: boolean;

  // Editing state
  isEditing: boolean;
  editContent: string;
  isSaving: boolean;
  saveError: string | null;

  // Gitignore prompt state
  showGitignorePrompt: boolean;
  gitignoreProjectPath: string | null;

  setProjectPath: (path: string) => void;
  loadFileTree: () => Promise<void>;
  selectFile: (path: string) => Promise<void>;
  clearPreview: () => void;
  openProjectDialog: () => Promise<void>;

  // Editing actions
  startEditing: () => void;
  cancelEditing: () => void;
  setEditContent: (content: string) => void;
  saveFile: () => Promise<void>;

  // Gitignore actions
  confirmGitignore: () => Promise<void>;
  dismissGitignore: () => void;
}

/**
 * Project store — manages project directory, file tree, file preview/editing, and .gitignore prompts.
 */
export const useProjectStore = create<ProjectStore>((set, get) => ({
  projectPath: null,
  fileTree: [],
  selectedFilePath: null,
  previewContent: null,
  previewError: null,
  isLoadingTree: false,
  isLoadingPreview: false,

  isEditing: false,
  editContent: '',
  isSaving: false,
  saveError: null,

  showGitignorePrompt: false,
  gitignoreProjectPath: null,

  setProjectPath: (path) => {
    set({ projectPath: path });
    invoke(IPC.PROJECT_SET_DIRECTORY, path);
    get().loadFileTree();
  },

  loadFileTree: async () => {
    set({ isLoadingTree: true });
    try {
      const tree = await invoke(IPC.PROJECT_FILE_TREE) as FileNode[];
      set({ fileTree: tree, isLoadingTree: false });
    } catch { /* Expected: project directory may not be accessible */
      set({ fileTree: [], isLoadingTree: false });
    }
  },

  selectFile: async (path) => {
    set({
      selectedFilePath: path,
      isLoadingPreview: true,
      previewContent: null,
      previewError: null,
      isEditing: false,
      editContent: '',
      saveError: null,
    });
    try {
      const result = await invoke(IPC.PROJECT_READ_FILE, path) as { content?: string; error?: string };
      if (result.error) {
        set({ previewError: result.error, isLoadingPreview: false });
      } else {
        // Auto-enter edit mode so the file is immediately editable
        set({
          previewContent: result.content ?? null,
          previewError: null,
          isLoadingPreview: false,
          isEditing: true,
          editContent: result.content ?? '',
        });
      }
    } catch (err) {
      set({ previewError: String(err), isLoadingPreview: false });
    }
  },

  clearPreview: () => set({
    selectedFilePath: null,
    previewContent: null,
    previewError: null,
    isEditing: false,
    editContent: '',
    saveError: null,
  }),

  openProjectDialog: async () => {
    const path = await invoke(IPC.PROJECT_OPEN_DIALOG) as string | null;
    if (path) {
      get().setProjectPath(path);
      try {
        const { useTabStore } = await import('./tab-store');
        const { tabs, switchTab, addTab } = useTabStore.getState();

        // If a tab for this project already exists, switch to it
        const existingTab = tabs.find(t => t.projectPath === path);
        if (existingTab) {
          switchTab(existingTab.id);
          return;
        }

        // Create a new tab for this project
        addTab(path);
      } catch { /* Expected: tab store may not be available during initialization */
        // Ignore if tab store not available
      }

      // Check if .pilot should be added to .gitignore
      try {
        const result = await invoke(IPC.PROJECT_CHECK_GITIGNORE, path) as { needsUpdate: boolean };
        if (result.needsUpdate) {
          set({ showGitignorePrompt: true, gitignoreProjectPath: path });
        }
      } catch { /* Expected: .gitignore check may fail if .git directory doesn't exist */
        // Non-critical — don't block project opening
      }
    }
  },

  startEditing: () => {
    const content = get().previewContent;
    if (content != null) {
      set({ isEditing: true, editContent: content, saveError: null });
    }
  },

  cancelEditing: () => {
    set({ isEditing: false, editContent: '', saveError: null });
  },

  setEditContent: (content: string) => {
    set({ editContent: content });
  },

  saveFile: async () => {
    const { selectedFilePath, editContent } = get();
    if (!selectedFilePath) return;

    set({ isSaving: true, saveError: null });
    try {
      const result = await invoke(IPC.PROJECT_WRITE_FILE, selectedFilePath, editContent) as { ok?: boolean; error?: string };
      if (result.error) {
        set({ isSaving: false, saveError: result.error });
      } else {
        // Commit edit content as the new preview content and exit edit mode
        set({
          previewContent: editContent,
          isEditing: false,
          editContent: '',
          isSaving: false,
          saveError: null,
        });
      }
    } catch (err) {
      set({ isSaving: false, saveError: String(err) });
    }
  },

  confirmGitignore: async () => {
    const { gitignoreProjectPath } = get();
    if (!gitignoreProjectPath) return;

    try {
      await invoke(IPC.PROJECT_ADD_GITIGNORE, gitignoreProjectPath);
    } catch (err) {
      console.error('Failed to add .pilot to .gitignore:', err);
    } finally {
      set({ showGitignorePrompt: false, gitignoreProjectPath: null });
    }
  },

  dismissGitignore: () => {
    set({ showGitignorePrompt: false, gitignoreProjectPath: null });
  },
}));
