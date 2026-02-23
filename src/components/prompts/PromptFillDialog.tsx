import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X, ChevronDown } from 'lucide-react';
import type { PromptTemplate } from '../../../shared/types';
import { IPC } from '../../../shared/ipc';
import { invoke } from '../../lib/ipc-client';
import FileMentionMenu, { type FileMention } from '../chat/FileMentionMenu';

interface PromptFillDialogProps {
  prompt: PromptTemplate;
  /** Pre-filled value for the first variable (from slash command inline text) */
  initialFirstValue?: string;
  onInsert: (filledContent: string) => void;
  onCancel: () => void;
}

export function PromptFillDialog({ 
  prompt, 
  initialFirstValue, 
  onInsert, 
  onCancel 
}: PromptFillDialogProps) {
  // Initialize variable values
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    prompt.variables?.forEach((variable, index) => {
      if (index === 0 && initialFirstValue) {
        initial[variable.name] = initialFirstValue;
      } else if (variable.defaultValue) {
        initial[variable.name] = variable.defaultValue;
      } else {
        initial[variable.name] = '';
      }
    });
    return initial;
  });

  const firstInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Auto-focus first unfilled variable on mount
  useEffect(() => {
    const firstUnfilled = prompt.variables?.find(v => !values[v.name]);
    if (firstUnfilled && firstInputRef.current) {
      firstInputRef.current.focus();
    } else if (firstInputRef.current) {
      firstInputRef.current.focus();
    }
  }, []);

  // Fill the template with current values
  const filledContent = useMemo(() => {
    let content = prompt.content;
    
    prompt.variables?.forEach((variable) => {
      const value = values[variable.name];
      const placeholder = `{{${variable.name}}}`;
      
      if (value) {
        // Replace all instances of this variable
        content = content.split(placeholder).join(value);
      } else if (!variable.required) {
        // For optional unfilled variables, remove them
        content = content.split(placeholder).join('');
      }
      // For required unfilled variables, leave the {{name}} placeholder for preview
    });
    
    return content;
  }, [prompt.content, prompt.variables, values]);

  // Check if all required fields are filled
  const canInsert = useMemo(() => {
    return prompt.variables?.every(v => !v.required || values[v.name]) ?? true;
  }, [prompt.variables, values]);

  // Handle value change
  const handleChange = useCallback((name: string, value: string) => {
    setValues(prev => ({ ...prev, [name]: value }));
  }, []);

  // Handle insert
  const handleInsert = useCallback(() => {
    if (canInsert) {
      onInsert(filledContent);
    }
  }, [canInsert, filledContent, onInsert]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: globalThis.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleInsert();
    }
  }, [onCancel, handleInsert]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  }, [onCancel]);

  // Detect macOS for keyboard hint
  const isMac = useMemo(() => {
    return typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="w-[560px] max-w-[90vw] max-h-[80vh] bg-bg-elevated border border-border rounded-lg shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-border">
          <div className="flex items-start gap-3 flex-1">
            {prompt.icon && (
              <div className="text-2xl mt-0.5">{prompt.icon}</div>
            )}
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-text-primary">
                {prompt.title}
              </h2>
              {prompt.description && (
                <p className="text-sm text-text-secondary mt-1">
                  {prompt.description}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-text-secondary hover:text-text-primary p-1 -mt-1 -mr-1"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {prompt.variables?.map((variable, index) => (
            <div key={variable.name}>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                {variable.name}
                {variable.required && <span className="text-error ml-1">*</span>}
              </label>
              
              {variable.type === 'file' ? (
                <FilePickerInput
                  ref={index === 0 ? (firstInputRef as any) : undefined}
                  value={values[variable.name]}
                  onChange={(val) => handleChange(variable.name, val)}
                  placeholder={variable.placeholder || 'Type @ to search files…'}
                />
              ) : variable.type === 'select' && variable.options ? (
                <div className="relative">
                  <select
                    ref={index === 0 ? (firstInputRef as any) : undefined}
                    value={values[variable.name]}
                    onChange={(e) => handleChange(variable.name, e.target.value)}
                    className="w-full bg-bg-surface border border-border rounded px-3 py-2 pr-10 text-text-primary appearance-none focus:outline-none focus:border-accent/50"
                  >
                    <option value="">Select...</option>
                    {variable.options.map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <ChevronDown 
                    size={16} 
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
                  />
                </div>
              ) : variable.type === 'multiline' ? (
                <AutoGrowTextarea
                  ref={index === 0 ? (firstInputRef as any) : undefined}
                  value={values[variable.name]}
                  onChange={(e) => handleChange(variable.name, e.target.value)}
                  placeholder={variable.placeholder}
                  minRows={3}
                  maxHeight={200}
                />
              ) : (
                <input
                  ref={index === 0 ? (firstInputRef as any) : undefined}
                  type="text"
                  value={values[variable.name]}
                  onChange={(e) => handleChange(variable.name, e.target.value)}
                  placeholder={variable.placeholder}
                  className="w-full bg-bg-surface border border-border rounded px-3 py-2 text-text-primary focus:outline-none focus:border-accent/50"
                />
              )}
            </div>
          ))}

          {/* Preview */}
          {prompt.variables && prompt.variables.length > 0 && (
            <div className="pt-2">
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                Preview
              </label>
              <div className="bg-bg-surface border border-border rounded-lg p-3 text-xs text-text-secondary font-mono whitespace-pre-wrap max-h-[150px] overflow-y-auto">
                {filledContent}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border">
          <div className="text-xs text-text-secondary">
            {isMac ? '⌘' : 'Ctrl'}+Enter to insert
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleInsert}
              disabled={!canInsert}
              className="px-4 py-2 bg-accent text-white rounded hover:bg-accent/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Insert into Chat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Auto-growing textarea component
interface AutoGrowTextareaProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  minRows?: number;
  maxHeight?: number;
}

const AutoGrowTextarea = React.forwardRef<HTMLTextAreaElement, AutoGrowTextareaProps>(
  ({ value, onChange, placeholder, minRows = 3, maxHeight = 200 }, ref) => {
    const [height, setHeight] = useState<number | undefined>(undefined);

    useEffect(() => {
      // Create a temporary element to measure height
      const temp = document.createElement('textarea');
      temp.style.position = 'absolute';
      temp.style.visibility = 'hidden';
      temp.style.width = '100%';
      temp.style.padding = '0.5rem 0.75rem';
      temp.style.fontSize = '14px';
      temp.style.lineHeight = '1.5';
      temp.style.fontFamily = 'inherit';
      temp.rows = minRows;
      temp.value = value;
      
      document.body.appendChild(temp);
      const scrollHeight = temp.scrollHeight;
      document.body.removeChild(temp);
      
      const newHeight = Math.min(scrollHeight, maxHeight);
      setHeight(newHeight);
    }, [value, minRows, maxHeight]);

    return (
      <textarea
        ref={ref}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={minRows}
        style={{ height: height ? `${height}px` : undefined }}
        className="w-full bg-bg-surface border border-border rounded px-3 py-2 text-text-primary focus:outline-none focus:border-accent/50 resize-none overflow-y-auto"
      />
    );
  }
);

AutoGrowTextarea.displayName = 'AutoGrowTextarea';

// ─── File Picker Input ─────────────────────────────────────────────────
// An input field with integrated @ file search for 'file' type variables.
// Supports picking multiple files/folders, displayed as removable pills.

interface FilePickerInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const FilePickerInput = React.forwardRef<HTMLInputElement, FilePickerInputProps>(
  ({ value, onChange, placeholder }, ref) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<FileMention[]>([]);
    const [menuVisible, setMenuVisible] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Parse current value into array of paths
    const paths = useMemo(() =>
      value ? value.split(',').map(p => p.trim()).filter(Boolean) : [],
    [value]);

    // Merge forwarded ref with local ref
    useEffect(() => {
      if (typeof ref === 'function') {
        ref(inputRef.current);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLInputElement | null>).current = inputRef.current;
      }
    }, [ref]);

    const doSearch = useCallback((q: string) => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      if (!q) {
        setResults([]);
        setMenuVisible(true);
        setLoading(false);
        return;
      }
      setLoading(true);
      setMenuVisible(true);
      searchTimer.current = setTimeout(() => {
        invoke(IPC.PROJECT_FILE_SEARCH, q, true).then((res: any) => {
          if (Array.isArray(res)) setResults(res as FileMention[]);
          setLoading(false);
        }).catch(() => {
          setResults([]);
          setLoading(false);
        });
      }, 80);
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setQuery(val);
      if (val.length > 0) {
        doSearch(val);
        setSelectedIndex(0);
      } else {
        setMenuVisible(false);
        setResults([]);
      }
    };

    const handleSelect = useCallback((file: FileMention) => {
      // Add the selected path if not already included
      const newPaths = paths.includes(file.relativePath)
        ? paths
        : [...paths, file.relativePath];
      onChange(newPaths.join(', '));
      setQuery('');
      setMenuVisible(false);
      setResults([]);
      setSelectedIndex(0);
      inputRef.current?.focus();
    }, [paths, onChange]);

    const removePath = useCallback((pathToRemove: string) => {
      const newPaths = paths.filter(p => p !== pathToRemove);
      onChange(newPaths.join(', '));
    }, [paths, onChange]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (menuVisible && results.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex(i => Math.min(i + 1, results.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex(i => Math.max(i - 1, 0));
          return;
        }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          e.preventDefault();
          const file = results[selectedIndex];
          if (file) handleSelect(file);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setMenuVisible(false);
          return;
        }
      }
      // Backspace on empty input removes last pill
      if (e.key === 'Backspace' && !query && paths.length > 0) {
        e.preventDefault();
        removePath(paths[paths.length - 1]);
      }
    };

    return (
      <div className="space-y-1.5">
        {/* Selected file pills */}
        {paths.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {paths.map((p) => (
              <span
                key={p}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-accent/10 border border-accent/20 text-xs text-accent font-mono max-w-full"
              >
                <span className="truncate">{p}</span>
                <button
                  type="button"
                  onClick={() => removePath(p)}
                  className="flex-shrink-0 hover:text-error transition-colors"
                  tabIndex={-1}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Search input */}
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={() => { setTimeout(() => setMenuVisible(false), 200); }}
            placeholder={paths.length > 0 ? 'Add more files…' : placeholder}
            className="w-full bg-bg-surface border border-border rounded px-3 py-2 text-text-primary focus:outline-none focus:border-accent/50"
          />

          {/* Dropdown */}
          {menuVisible && (
            <div className="absolute left-0 right-0 bottom-full mb-1 z-50">
              <FileMentionMenu
                files={results}
                selectedIndex={selectedIndex}
                onSelect={handleSelect}
                onHover={setSelectedIndex}
                visible={true}
                loading={loading}
                hasQuery={query.length > 0}
              />
            </div>
          )}
        </div>
      </div>
    );
  }
);

FilePickerInput.displayName = 'FilePickerInput';
