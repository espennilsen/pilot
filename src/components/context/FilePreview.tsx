import { useEffect, useRef, useCallback } from 'react';
import { X, ArrowLeft, Pencil, Save, Undo2 } from 'lucide-react';
import { useProjectStore } from '../../stores/project-store';
import { useHighlight } from '../../hooks/useHighlight';
import { shortcutLabel } from '../../lib/keybindings';
import 'highlight.js/styles/tokyo-night-dark.css';

export default function FilePreview() {
  const {
    selectedFilePath,
    previewContent,
    previewError,
    isLoadingPreview,
    clearPreview,
    isEditing,
    editContent,
    isSaving,
    saveError,
    startEditing,
    cancelEditing,
    setEditContent,
    saveFile,
  } = useProjectStore();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumberRef = useRef<HTMLDivElement>(null);

  // Display content: edit buffer when editing, file content otherwise
  const displayContent = isEditing ? editContent : previewContent;
  const highlightedLines = useHighlight(
    isEditing ? null : previewContent,
    selectedFilePath,
  );

  const isDirty = isEditing && editContent !== previewContent;

  // Sync textarea scroll with line numbers
  const handleScroll = useCallback(() => {
    if (textareaRef.current && lineNumberRef.current) {
      lineNumberRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  // Cmd+S to save, Escape to cancel
  useEffect(() => {
    if (!isEditing) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        saveFile();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelEditing();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isEditing, saveFile, cancelEditing]);

  if (!selectedFilePath) return null;

  const fileName = selectedFilePath.split('/').pop() || '';
  const lines = displayContent?.split('\n') || [];
  const lineCount = lines.length;
  const maxLineNumberWidth = String(lineCount).length;

  return (
    <div className="h-full flex flex-col bg-bg-base">
      {/* Header */}
      <div className="h-9 bg-bg-elevated border-b border-border flex items-center justify-between px-3 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={() => { if (isEditing) cancelEditing(); clearPreview(); }}
            className="p-1 hover:bg-bg-base rounded transition-colors flex-shrink-0"
            title="Back to file tree"
          >
            <ArrowLeft className="w-4 h-4 text-text-secondary" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-text-primary truncate flex items-center gap-1.5">
              {fileName}
              {isDirty && (
                <span className="inline-block w-2 h-2 rounded-full bg-warning flex-shrink-0" title="Unsaved changes" />
              )}
              {isEditing && (
                <span className="text-xs text-accent font-normal">editing</span>
              )}
            </div>
            <div className="text-xs text-text-secondary truncate">
              {selectedFilePath}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {isEditing ? (
            <>
              <button
                onClick={cancelEditing}
                className="p-1 hover:bg-bg-base rounded transition-colors"
                title="Cancel (Esc)"
              >
                <Undo2 className="w-4 h-4 text-text-secondary" />
              </button>
              <button
                onClick={saveFile}
                disabled={isSaving || !isDirty}
                className="p-1 hover:bg-bg-base rounded transition-colors disabled:opacity-40"
                title={`Save (${shortcutLabel('S')})`}
              >
                <Save className={`w-4 h-4 ${isDirty ? 'text-accent' : 'text-text-secondary'}`} />
              </button>
            </>
          ) : (
            previewContent != null && (
              <button
                onClick={startEditing}
                className="p-1 hover:bg-bg-base rounded transition-colors"
                title="Edit file"
              >
                <Pencil className="w-4 h-4 text-text-secondary" />
              </button>
            )
          )}
          <button
            onClick={() => { if (isEditing) cancelEditing(); clearPreview(); }}
            className="p-1 hover:bg-bg-base rounded transition-colors"
            title="Close preview"
          >
            <X className="w-4 h-4 text-text-secondary" />
          </button>
        </div>
      </div>

      {/* Save error banner */}
      {saveError && (
        <div className="px-3 py-1.5 bg-error/15 border-b border-error/30 text-xs text-error truncate">
          Save failed: {saveError}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-auto">
        {isLoadingPreview ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent" />
          </div>
        ) : previewError ? (
          <div className="flex items-center justify-center h-full p-4">
            <div className="text-center">
              <p className="text-sm text-red-400 mb-2">Failed to load file</p>
              <p className="text-xs text-text-secondary">{previewError}</p>
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
            {isEditing ? (
              <textarea
                ref={textareaRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onScroll={handleScroll}
                spellCheck={false}
                className="flex-1 px-3 py-3 bg-transparent text-text-primary resize-none outline-none leading-6 overflow-auto"
                style={{ tabSize: 2 }}
              />
            ) : (
              <pre className="flex-1 px-3 py-3 overflow-x-auto">
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
