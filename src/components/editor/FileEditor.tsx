import { useEffect, useRef, useCallback, useState } from 'react';
import { Save, Undo2, AlertTriangle, Eye, Pencil } from 'lucide-react';
import { useHighlight } from '../../hooks/useHighlight';
import { useTabStore } from '../../stores/tab-store';
import { renderMarkdown } from '../../lib/markdown';
import { IPC } from '../../../shared/ipc';
import { invoke, on } from '../../lib/ipc-client';
import { shortcutLabel } from '../../lib/keybindings';
import 'highlight.js/styles/tokyo-night-dark.css';

interface FileEditorState {
  content: string | null;
  editContent: string;
  isLoading: boolean;
  error: string | null;
  saveError: string | null;
  isSaving: boolean;
  /** Disk content at the time editing started — used for conflict detection */
  baseContent: string | null;
  /** True when a conflict has been detected (file changed on disk while editing) */
  hasConflict: boolean;
  /** Markdown preview mode (only for .md/.mdx files) */
  isPreview: boolean;
}

/** Check if a file path is a markdown file */
function isMarkdownFile(filePath: string | null): boolean {
  if (!filePath) return false;
  const lower = filePath.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.mdx');
}

export default function FileEditor() {
  const activeTabId = useTabStore(s => s.activeTabId);
  const tab = useTabStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const filePath = tab?.filePath ?? null;

  const [state, setState] = useState<FileEditorState>({
    content: null,
    editContent: '',
    isLoading: true,
    error: null,
    saveError: null,
    isSaving: false,
    baseContent: null,
    hasConflict: false,
    isPreview: false,
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumberRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  /** Scroll ratio (0–1) captured before toggling preview, restored after render */
  const scrollRatioRef = useRef(0);

  const isMarkdown = isMarkdownFile(filePath);
  const highlightedLines = useHighlight(
    state.isPreview ? null : (state.editContent || state.content),
    filePath,
  );
  const isDirty = state.editContent !== (state.content ?? '');

  // Load file content — immediately ready for editing
  useEffect(() => {
    if (!filePath) return;

    let cancelled = false;
    setState(s => ({ ...s, isLoading: true, error: null, saveError: null, hasConflict: false, isPreview: false }));

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
            baseContent: result.content ?? null,
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
    if (!filePath || state.baseContent == null) return;

    const unsub = on(IPC.PROJECT_FS_CHANGED, async () => {
      try {
        const result = await invoke(IPC.PROJECT_READ_FILE, filePath) as { content?: string; error?: string };
        if (result.content != null && state.baseContent != null && result.content !== state.baseContent) {
          setState(s => ({ ...s, hasConflict: true, content: result.content! }));
        }
      } catch { /* Expected: file may have been deleted or moved */ }
    });
    return unsub;
  }, [filePath, state.baseContent]);

  // Revert to last saved content
  const revertChanges = useCallback(() => {
    setState(s => ({ ...s, editContent: s.content ?? '', saveError: null }));
  }, []);

  // Toggle markdown preview — capture scroll ratio before switching
  const togglePreview = useCallback(() => {
    if (state.isPreview) {
      // Preview → Edit: capture preview scroll ratio
      if (previewRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = previewRef.current;
        scrollRatioRef.current = scrollHeight > clientHeight ? scrollTop / (scrollHeight - clientHeight) : 0;
      }
    } else {
      // Edit → Preview: capture textarea scroll ratio
      if (textareaRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = textareaRef.current;
        scrollRatioRef.current = scrollHeight > clientHeight ? scrollTop / (scrollHeight - clientHeight) : 0;
      }
    }
    setState(s => ({ ...s, isPreview: !s.isPreview }));
  }, [state.isPreview]);

  // Save file
  const saveFile = useCallback(async () => {
    if (!filePath || state.isSaving || state.hasConflict) return;

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
          isSaving: false,
          saveError: null,
          baseContent: s.editContent,
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
          isSaving: false,
          saveError: null,
          baseContent: s.editContent,
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
          isLoading: false,
          baseContent: result.content ?? null,
          hasConflict: false,
          saveError: null,
        }));
      }
    } catch (err) {
      setState(s => ({ ...s, error: String(err), isLoading: false }));
    }
  }, [filePath]);

  // Sync textarea scroll with line numbers and highlight overlay
  const handleScroll = useCallback(() => {
    if (textareaRef.current) {
      const { scrollTop, scrollLeft } = textareaRef.current;
      if (lineNumberRef.current) lineNumberRef.current.scrollTop = scrollTop;
      if (highlightRef.current) {
        highlightRef.current.scrollTop = scrollTop;
        highlightRef.current.scrollLeft = scrollLeft;
      }
    }
  }, []);

  // Restore scroll position after preview toggle
  useEffect(() => {
    // Skip on initial load (content hasn't been set yet)
    if (state.content == null) return;

    requestAnimationFrame(() => {
      const ratio = scrollRatioRef.current;
      if (state.isPreview) {
        if (previewRef.current) {
          const { scrollHeight, clientHeight } = previewRef.current;
          previewRef.current.scrollTop = ratio * (scrollHeight - clientHeight);
        }
      } else {
        if (textareaRef.current) {
          const { scrollHeight, clientHeight } = textareaRef.current;
          textareaRef.current.scrollTop = ratio * (scrollHeight - clientHeight);
          handleScroll(); // sync line numbers + highlight overlay
        }
      }
    });
  }, [state.isPreview, state.content, handleScroll]);

  // Focus textarea when content loads (and not in preview)
  useEffect(() => {
    if (!state.isLoading && !state.error && state.content != null && !state.isPreview && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [state.isLoading, state.error, state.content, state.isPreview]);

  // Keyboard shortcuts: Cmd+S to save, Escape to revert
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        saveFile();
      }
      if (e.key === 'Escape' && isDirty && !state.isPreview) {
        e.preventDefault();
        revertChanges();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [saveFile, revertChanges, isDirty, state.isPreview]);

  // Update tab dirty indicator
  useEffect(() => {
    if (activeTabId) {
      useTabStore.getState().updateTab(activeTabId, { hasUnread: isDirty });
    }
  }, [isDirty, activeTabId]);

  if (!filePath) return null;

  const fileName = filePath.split('/').pop() || '';
  const lines = (state.editContent || state.content || '').split('\n');
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
              {state.isPreview && (
                <span className="text-xs text-accent font-normal">preview</span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-text-secondary truncate max-w-[300px]">{filePath}</span>
          {isDirty && !state.isPreview && (
            <button
              onClick={revertChanges}
              className="p-1.5 hover:bg-bg-base rounded transition-colors"
              title="Revert changes (Esc)"
            >
              <Undo2 className="w-4 h-4 text-text-secondary" />
            </button>
          )}
          {/* Markdown preview toggle */}
          {isMarkdown && (
            <button
              onClick={togglePreview}
              className={`p-1.5 hover:bg-bg-base rounded transition-colors ${state.isPreview ? 'text-accent' : ''}`}
              title={state.isPreview ? 'Edit markdown' : 'Preview markdown'}
            >
              {state.isPreview
                ? <Pencil className="w-4 h-4 text-accent" />
                : <Eye className="w-4 h-4 text-text-secondary" />
              }
            </button>
          )}
          <button
            onClick={saveFile}
            disabled={state.isSaving || !isDirty || state.hasConflict}
            className="p-1.5 hover:bg-bg-base rounded transition-colors disabled:opacity-40"
            title={`Save (${shortcutLabel('S')})`}
          >
            <Save className={`w-4 h-4 ${isDirty ? 'text-accent' : 'text-text-secondary'}`} />
          </button>
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
      <div className="flex-1 overflow-hidden">
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
        ) : state.content != null ? (
          state.isPreview ? (
            /* Rendered markdown preview */
            <div ref={previewRef} className="h-full overflow-auto px-6 py-4">
              <div className="text-text-primary prose prose-invert max-w-none text-sm leading-relaxed">
                {renderMarkdown(state.editContent || '')}
              </div>
            </div>
          ) : (
            /* Code editor with syntax highlighting */
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

              {/* Editor with syntax-highlighted overlay */}
              <div className="relative flex-1 min-w-0">
                {/* Highlighted underlay — scrolled in sync with textarea */}
                <pre
                  ref={highlightRef}
                  className="absolute inset-0 px-3 py-3 m-0 overflow-hidden pointer-events-none"
                  aria-hidden="true"
                  style={{ whiteSpace: 'pre' }}
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

                {/* Transparent textarea on top — captures input, shows caret */}
                <textarea
                  ref={textareaRef}
                  value={state.editContent}
                  onChange={(e) => setState(s => ({ ...s, editContent: e.target.value }))}
                  onScroll={handleScroll}
                  spellCheck={false}
                  wrap="off"
                  className="relative w-full h-full px-3 py-3 bg-transparent resize-none outline-none leading-6 overflow-auto z-10"
                  style={{
                    tabSize: 2,
                    color: 'transparent',
                    caretColor: 'var(--text-primary, #e0e0e0)',
                    WebkitTextFillColor: 'transparent',
                    whiteSpace: 'pre',
                  }}
                />
              </div>
            </div>
          )
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-text-secondary">No content</p>
          </div>
        )}
      </div>
    </div>
  );
}
