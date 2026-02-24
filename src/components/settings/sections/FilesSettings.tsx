import { useAppSettingsStore } from '../../../stores/app-settings-store';
import { useProjectStore } from '../../../stores/project-store';
import { useEffect, useState } from 'react';
import { EyeOff, Trash2, RotateCw } from 'lucide-react';
import { SettingRow } from '../settings-helpers';

const DEFAULT_HIDDEN_PATHS = [
  'node_modules', '.git', '.DS_Store', 'dist', 'out', 'build',
  '.next', '.nuxt', '.cache', 'coverage',
  '__pycache__', '.tox', '.mypy_cache', 'target', '.gradle', '*.pyc',
];

export function FilesSettings() {
  const { hiddenPaths, setHiddenPaths, load: loadSettings } = useAppSettingsStore();
  const { loadFileTree } = useProjectStore();
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleAdd = () => {
    const pattern = inputValue.trim();
    if (pattern && !hiddenPaths.includes(pattern)) {
      const updated = [...hiddenPaths, pattern];
      setHiddenPaths(updated).then(() => loadFileTree());
      setInputValue('');
    }
  };

  const handleRemove = (pattern: string) => {
    const updated = hiddenPaths.filter(p => p !== pattern);
    setHiddenPaths(updated).then(() => loadFileTree());
  };

  const handleReset = () => {
    setHiddenPaths(DEFAULT_HIDDEN_PATHS).then(() => loadFileTree());
  };

  return (
    <div className="p-5 space-y-6">
      <SettingRow
        icon={<EyeOff className="w-4 h-4 text-text-secondary" />}
        label="Hidden Files"
        description="Glob patterns to hide in the file tree, using .gitignore syntax. One pattern per entry."
      >
        <button
          onClick={handleReset}
          className="flex items-center gap-1 text-xs text-warning hover:text-warning/80 transition-colors"
          title="Reset to defaults"
        >
          <RotateCw className="w-3 h-3" />
          Reset
        </button>
      </SettingRow>

      {/* Add pattern input */}
      <div className="ml-7 flex items-center gap-1.5">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="e.g. *.log, .env.local, tmp/"
          className="flex-1 text-xs font-mono bg-bg-surface border border-border rounded px-2 py-1.5 text-text-primary focus:outline-none focus:border-accent"
        />
        <button
          onClick={handleAdd}
          disabled={!inputValue.trim()}
          className="text-xs px-2.5 py-1.5 bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {/* Pattern list */}
      <div className="ml-7 space-y-1">
        {hiddenPaths.length === 0 ? (
          <p className="text-xs text-text-secondary italic py-2">
            No hidden patterns — all files are visible.
          </p>
        ) : (
          hiddenPaths.map((pattern) => (
            <div
              key={pattern}
              className="flex items-center justify-between px-3 py-1.5 bg-bg-surface border border-border rounded-md group"
            >
              <span className="text-xs font-mono text-text-primary">{pattern}</span>
              <button
                onClick={() => handleRemove(pattern)}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-error/20 transition-all"
                title="Remove pattern"
              >
                <Trash2 className="w-3 h-3 text-error" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
