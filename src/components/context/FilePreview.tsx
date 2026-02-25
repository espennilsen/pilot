import { useEffect, useRef, useCallback, useState } from 'react';
import { X, ArrowLeft, Save, Undo2, Eye, Pencil } from 'lucide-react';
import { useProjectStore } from '../../stores/project-store';
import { useHighlight } from '../../hooks/useHighlight';
import { renderMarkdown } from '../../lib/markdown';
import { shortcutLabel } from '../../lib/keybindings';
import 'highlight.js/styles/tokyo-night-dark.css';

/** Check if a file path is a markdown file */
function isMarkdownFile(filePath: string | null): boolean {
  if (!filePath) return false;
  const lower = filePath.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.mdx');
}

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
    cancelEditing,
    setEditContent,
    saveFile,
  } = useProjectStore();

  const [isPreview, setIsPreview] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumberRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  /** Scroll ratio (0–1) captured before toggling preview, restored after render */
  const scrollRatioRef = useRef(0);

  const isMarkdown = isMarkdownFile(selectedFilePath);
  const displayContent = isEditing ? editContent : previewContent;
  const highlightedLines = useHighlight(
    isPreview ? null : displayContent,
    selectedFilePath,
  );

  const isDirty = isEditing && editContent !== previewContent;

  // Reset preview mode when file changes
  useEffect(() => {
    setIsPreview(false);
  }, [selectedFilePath]);

  // Revert to last saved content
  const revertChanges = useCallback(() => {
    if (previewContent != null) {
      setEditContent(previewContent);
    }
  }, [previewContent, setEditContent]);

  // Toggle markdown preview — capture scroll ratio before switching
  const togglePreview = useCallback(() => {
    if (isPreview) {
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
    setIsPreview(p => !p);
  }, [isPreview]);

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
    if (displayContent == null) return;

    requestAnimationFrame(() => {
      const ratio = scrollRatioRef.current;
      if (isPreview) {
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
  }, [isPreview, displayContent, handleScroll]);

  // Focus textarea when entering edit mode (not preview)
  useEffect(() => {
    if (isEditing && !isPreview && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing, isPreview]);

  // Cmd+S to save, Escape to revert
  useEffect(() => {
    if (!isEditing) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        saveFile();
      }
      if (e.key === 'Escape' && isDirty && !isPreview) {
        e.preventDefault();
        revertChanges();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isEditing, saveFile, revertChanges, isDirty, isPreview]);

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
              {isPreview && (
                <span className="text-xs text-accent font-normal">preview</span>
              )}
            </div>
            <div className="text-xs text-text-secondary truncate">
              {selectedFilePath}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {isEditing && (
            <>
              {isDirty && !isPreview && (
                <button
                  onClick={revertChanges}
                  className="p-1 hover:bg-bg-base rounded transition-colors"
                  title="Revert changes (Esc)"
                >
                  <Undo2 className="w-4 h-4 text-text-secondary" />
                </button>
              )}
              {/* Markdown preview toggle */}
              {isMarkdown && (
                <button
                  onClick={togglePreview}
                  className={`p-1 hover:bg-bg-base rounded transition-colors ${isPreview ? 'text-accent' : ''}`}
                  title={isPreview ? 'Edit markdown' : 'Preview markdown'}
                >
                  {isPreview
                    ? <Pencil className="w-4 h-4 text-accent" />
                    : <Eye className="w-4 h-4 text-text-secondary" />
                  }
                </button>
              )}
              <button
                onClick={saveFile}
                disabled={isSaving || !isDirty}
                className="p-1 hover:bg-bg-base rounded transition-colors disabled:opacity-40"
                title={`Save (${shortcutLabel('S')})`}
              >
                <Save className={`w-4 h-4 ${isDirty ? 'text-accent' : 'text-text-secondary'}`} />
              </button>
            </>
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
      <div className="flex-1 overflow-hidden">
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
          isPreview ? (
            /* Rendered markdown preview */
            <div ref={previewRef} className="h-full overflow-auto px-4 py-3">
              <div className="text-text-primary prose prose-invert max-w-none text-sm leading-relaxed">
                {renderMarkdown(displayContent)}
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
                  value={isEditing ? editContent : (previewContent ?? '')}
                  onChange={(e) => setEditContent(e.target.value)}
                  onScroll={handleScroll}
                  spellCheck={false}
                  readOnly={!isEditing}
                  wrap="off"
                  className="relative w-full h-full px-3 py-3 bg-transparent resize-none outline-none leading-6 overflow-auto z-10"
                  style={{
                    tabSize: 2,
                    color: 'transparent',
                    caretColor: isEditing ? 'var(--text-primary, #e0e0e0)' : 'transparent',
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
