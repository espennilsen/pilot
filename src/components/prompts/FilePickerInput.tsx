/**
 * FilePickerInput — File search input with autocomplete dropdown.
 *
 * Extracted from PromptFillDialog.tsx. Supports picking multiple files/folders,
 * displayed as removable pills, with debounced IPC search and keyboard navigation.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { IPC } from '../../../shared/ipc';
import { invoke } from '../../lib/ipc-client';
import FileMentionMenu, { type FileMention } from '../chat/FileMentionMenu';

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

export default FilePickerInput;
