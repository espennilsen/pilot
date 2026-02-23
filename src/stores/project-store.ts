import { create } from 'zustand';
import type { FileNode } from '../../shared/types';
import { IPC } from '../../shared/ipc';
import { invoke } from '../lib/ipc-client';

/** Prompt user to add .pilot to .gitignore if this is a git repo without it. */
async function checkGitignore(projectPath: string) {
  try {
    const result = await invoke(IPC.PROJECT_CHECK_GITIGNORE, projectPath) as { needsUpdate: boolean };
    if (result.needsUpdate) {
      if (confirm('This project is a git repo. Add .pilot to .gitignore to keep Pilot config out of version control?')) {
        await invoke(IPC.PROJECT_ADD_GITIGNORE, projectPath);
      }
    }
  } catch {
    // Non-critical — don't block project opening
  }
}

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
}

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
    } catch {
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
        set({ previewContent: result.content ?? null, isLoadingPreview: false });
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
      } catch {
        // Ignore if tab store not available
      }

      // Check if .pilot should be added to .gitignore
      checkGitignore(path);
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
}));
