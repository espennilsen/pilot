import { useEffect, useRef, useCallback, useState } from 'react';
import { Save, Undo2, AlertTriangle } from 'lucide-react';
import { useHighlight } from '../../hooks/useHighlight';
import { useTabStore } from '../../stores/tab-store';
import { IPC } from '../../../shared/ipc';
import { invoke, on } from '../../lib/ipc-client';
import { shortcutLabel } from '../../lib/keybindings';
import 'highlight.js/styles/tokyo-night-dark.css';

interface FileEditorState {
  content: string | null;
  editContent: string;
  isEditing: boolean;
  isLoading: boolean;
  error: string | null;
  saveError: string | null;
  isSaving: boolean;
  /** Disk content at the time editing started — used for conflict detection */
  baseContent: string | null;
  /** True when a conflict has been detected (file changed on disk while editing) */
  hasConflict: boolean;
}

export default function FileEditor() {
  const activeTabId = useTabStore(s => s.activeTabId);
  const tab = useTabStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const filePath = tab?.filePath ?? null;

  const [state, setState] = useState<FileEditorState>({
    content: null,
    editContent: '',
    isEditing: false,
    isLoading: true,
    error: null,
    saveError: null,
    isSaving: false,
    baseContent: null,
    hasConflict: false,
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumberRef = useRef<HTMLDivElement>(null);

  const displayContent = state.isEditing ? state.editContent : state.content;
  const highlightedLines = useHighlight(
    state.isEditing ? null : state.content,
    filePath,
  );
  const isDirty = state.isEditing && state.editContent !== state.content;

  // Load file content
  useEffect(() => {
    if (!filePath) return;

    let cancelled = false;
    setState(s => ({ ...s, isLoading: true, error: null, saveError: null, hasConflict: false }));

    (async () => {
      try {
        const result = await invoke(IPC.PROJECT_READ_FILE, filePath) as { content?: string; error?: string };
        if (cancelled) return;
        if (result.error) {
          setState(s => ({ ...s, error: result.error!, isLoading: false }));
        } else {
          setState(s => ({
            ...s,
            content: result.content ?? null,
            editContent: result.content ?? '',
            isLoading: false,
            isEditing: false,
            baseContent: null,
            hasConflict: false,
          }));
        }
      } catch (err) {
        if (!cancelled) {
          setState(s => ({ ...s, error: String(err), isLoading: false }));
        }
      }
    })();

    return () => { cancelled = true; };
  }, [filePath]);

  // Listen for filesystem changes to detect conflicts
  useEffect(() => {
    if (!filePath || !state.isEditing) return;

    const unsub = on(IPC.PROJECT_FS_CHANGED, async () => {
      try {
        const result = await invoke(IPC.PROJECT_READ_FILE, filePath) as { content?: string; error?: string };
        if (result.content != null && state.baseContent != null && result.content !== state.baseContent) {
          setState(s => ({ ...s, hasConflict: true, content: result.content! }));
        }
      } catch { /* Expected: file may have been deleted or moved */
        // ignore
      }
    });
    return unsub;
  }, [filePath, state.isEditing, state.baseContent]);

  // Start editing
  const startEditing = useCallback(() => {
    setState(s => ({
      ...s,
      isEditing: true,
      editContent: s.content ?? '',
      baseContent: s.content,
      hasConflict: false,
      saveError: null,
    }));
  }, []);

  // Cancel editing
  const cancelEditing = useCallback(() => {
    setState(s => ({
      ...s,
      isEditing: false,
      editContent: '',
      baseContent: null,
      hasConflict: false,
      saveError: null,
    }));
  }, []);

  // Save file
  const saveFile = useCallback(async () => {
    if (!filePath || state.isSaving) return;

    // Check for conflict before saving
    if (state.hasConflict) {
      // Don't save — user needs to resolve first
      return;
    }

    setState(s => ({ ...s, isSaving: true, saveError: null }));
    try {
      // Re-read the file to check for changes since we started editing
      const current = await invoke(IPC.PROJECT_READ_FILE, filePath) as { content?: string; error?: string };
      if (current.content != null && state.baseContent != null && current.content !== state.baseContent) {
        setState(s => ({ ...s, isSaving: false, hasConflict: true, content: current.content! }));
        return;
      }

      const result = await invoke(IPC.PROJECT_WRITE_FILE, filePath, state.editContent) as { ok?: boolean; error?: string };
      if (result.error) {
        setState(s => ({ ...s, isSaving: false, saveError: result.error! }));
      } else {
        setState(s => ({
          ...s,
          content: s.editContent,
          isEditing: false,
          editContent: '',
          isSaving: false,
          saveError: null,
          baseContent: null,
          hasConflict: false,
        }));
      }
    } catch (err) {
      setState(s => ({ ...s, isSaving: false, saveError: String(err) }));
    }
  }, [filePath, state.editContent, state.isSaving, state.hasConflict, state.baseContent]);

  // Force overwrite (resolve conflict)
  const forceOverwrite = useCallback(async () => {
    if (!filePath || state.isSaving) return;
    setState(s => ({ ...s, isSaving: true, saveError: null }));
    try {
      const result = await invoke(IPC.PROJECT_WRITE_FILE, filePath, state.editContent) as { ok?: boolean; error?: string };
      if (result.error) {
        setState(s => ({ ...s, isSaving: false, saveError: result.error! }));
      } else {
        setState(s => ({
          ...s,
          content: s.editContent,
          isEditing: false,
          editContent: '',
          isSaving: false,
          saveError: null,
          baseContent: null,
          hasConflict: false,
        }));
      }
    } catch (err) {
      setState(s => ({ ...s, isSaving: false, saveError: String(err) }));
    }
  }, [filePath, state.editContent, state.isSaving]);

  // Reload from disk (discard edits, resolve conflict)
  const reloadFromDisk = useCallback(async () => {
    if (!filePath) return;
    setState(s => ({ ...s, isLoading: true }));
    try {
      const result = await invoke(IPC.PROJECT_READ_FILE, filePath) as { content?: string; error?: string };
      if (result.error) {
        setState(s => ({ ...s, error: result.error!, isLoading: false }));
      } else {
        setState(s => ({
          ...s,
          content: result.content ?? null,
          editContent: result.content ?? '',
          isEditing: false,
          isLoading: false,
          baseContent: null,
          hasConflict: false,
          saveError: null,
        }));
      }
    } catch (err) {
      setState(s => ({ ...s, error: String(err), isLoading: false }));
    }
  }, [filePath]);

  // Sync textarea scroll with line numbers
  const handleScroll = useCallback(() => {
    if (textareaRef.current && lineNumberRef.current) {
      lineNumberRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (state.isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [state.isEditing]);

  // Keyboard shortcuts: Cmd+S to save, Cmd+E to toggle edit, Escape to cancel
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (state.isEditing) {
          saveFile();
        }
      }
      if (e.key === 'e' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (!state.isEditing && state.content != null) {
          startEditing();
        }
      }
      if (e.key === 'Escape' && state.isEditing) {
        e.preventDefault();
        cancelEditing();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [state.isEditing, state.content, saveFile, startEditing, cancelEditing]);

  // Update tab dirty indicator
  useEffect(() => {
    if (activeTabId) {
      useTabStore.getState().updateTab(activeTabId, { hasUnread: isDirty });
    }
  }, [isDirty, activeTabId]);

  if (!filePath) return null;

  const fileName = filePath.split('/').pop() || '';
  const lines = displayContent?.split('\n') || [];
  const lineCount = lines.length;
  const maxLineNumberWidth = String(lineCount).length;

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-bg-base">
      {/* Header */}
      <div className="h-9 bg-bg-elevated border-b border-border flex items-center justify-between px-4 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-text-primary truncate flex items-center gap-1.5">
              {fileName}
              {isDirty && (
                <span className="inline-block w-2 h-2 rounded-full bg-warning flex-shrink-0" title="Unsaved changes" />
              )}
              {state.isEditing && (
                <span className="text-xs text-accent font-normal">editing</span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-text-secondary truncate max-w-[300px]">{filePath}</span>
          {state.isEditing ? (
            <>
              <button
                onClick={cancelEditing}
                className="p-1.5 hover:bg-bg-base rounded transition-colors"
                title="Cancel (Esc)"
              >
                <Undo2 className="w-4 h-4 text-text-secondary" />
              </button>
              <button
                onClick={saveFile}
                disabled={state.isSaving || !isDirty || state.hasConflict}
                className="p-1.5 hover:bg-bg-base rounded transition-colors disabled:opacity-40"
                title={`Save (${shortcutLabel('S')})`}
              >
                <Save className={`w-4 h-4 ${isDirty ? 'text-accent' : 'text-text-secondary'}`} />
              </button>
            </>
          ) : (
            state.content != null && (
              <button
                onClick={startEditing}
                className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-base rounded transition-colors"
                title={`Edit file (${shortcutLabel('E')})`}
              >
                Edit
              </button>
            )
          )}
        </div>
      </div>

      {/* Conflict banner */}
      {state.hasConflict && (
        <div className="px-4 py-2 bg-warning/15 border-b border-warning/30 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-warning font-medium">File changed on disk</p>
            <p className="text-[11px] text-text-secondary">This file has been modified externally (possibly by the agent). Your edits may conflict.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={reloadFromDisk}
              className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary bg-bg-surface border border-border rounded transition-colors"
            >
              Reload
            </button>
            <button
              onClick={forceOverwrite}
              className="px-2 py-1 text-xs text-warning hover:text-warning/80 bg-warning/10 border border-warning/30 rounded transition-colors"
            >
              Overwrite
            </button>
          </div>
        </div>
      )}

      {/* Save error banner */}
      {state.saveError && (
        <div className="px-3 py-1.5 bg-error/15 border-b border-error/30 text-xs text-error truncate">
          Save failed: {state.saveError}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-auto">
        {state.isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent" />
          </div>
        ) : state.error ? (
          <div className="flex items-center justify-center h-full p-4">
            <div className="text-center">
              <p className="text-sm text-red-400 mb-2">Failed to load file</p>
              <p className="text-xs text-text-secondary">{state.error}</p>
            </div>
          </div>
        ) : displayContent != null ? (
          <div className="flex font-mono text-sm h-full">
            {/* Line numbers */}
            <div
              ref={lineNumberRef}
              className="bg-bg-surface border-r border-border px-2 py-3 text-text-secondary select-none flex-shrink-0 overflow-hidden"
            >
              {Array.from({ length: lineCount }, (_, i) => (
                <div
                  key={i}
                  className="text-right leading-6"
                  style={{ minWidth: `${maxLineNumberWidth}ch` }}
                >
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Editor or read-only view */}
            {state.isEditing ? (
              <textarea
                ref={textareaRef}
                value={state.editContent}
                onChange={(e) => setState(s => ({ ...s, editContent: e.target.value }))}
                onScroll={handleScroll}
                spellCheck={false}
                className="flex-1 px-3 py-3 bg-transparent text-text-primary resize-none outline-none leading-6 overflow-auto"
                style={{ tabSize: 2 }}
              />
            ) : (
              <pre
                className="flex-1 px-3 py-3 overflow-x-auto cursor-text"
                onClick={startEditing}
              >
                <code className="hljs">
                  {highlightedLines
                    ? highlightedLines.map((html, i) => (
                        <div
                          key={i}
                          className="leading-6"
                          dangerouslySetInnerHTML={{ __html: html || ' ' }}
                        />
                      ))
                    : lines.map((line, i) => (
                        <div key={i} className="leading-6 text-text-primary">
                          {line || ' '}
                        </div>
                      ))}
                </code>
              </pre>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-text-secondary">No content</p>
          </div>
        )}
      </div>
    </div>
  );
}
