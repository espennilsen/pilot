/**
 * @file ThemeEditor — Full theme creation/editing panel with color pickers and live preview.
 */

import { useState, useCallback, useMemo } from 'react';
import { useThemeStore } from '../../stores/theme-store';
import { useAppSettingsStore } from '../../stores/app-settings-store';
import { Save, RotateCcw, Copy, Trash2, X } from 'lucide-react';
import type { CustomTheme } from '../../../shared/types';
import { ThemePreview } from './ThemePreview';

// ─── Default theme template ─────────────────────────────────────────────

function createEmptyTheme(base: 'dark' | 'light'): CustomTheme {
  if (base === 'light') {
    return {
      name: 'New Light Theme',
      slug: 'new-light-theme',
      author: '',
      base: 'light',
      version: 1,
      colors: {
        'bg-base': '#ffffff',
        'bg-surface': '#f4f5f7',
        'bg-elevated': '#e8eaed',
        'text-primary': '#1a1b1e',
        'text-secondary': '#5f6368',
        'accent': '#0b7dda',
        'success': '#1a8d3e',
        'error': '#d93025',
        'warning': '#c47a0a',
        'border': '#d1d5db',
      },
    };
  }
  return {
    name: 'New Dark Theme',
    slug: 'new-dark-theme',
    author: '',
    base: 'dark',
    version: 1,
    colors: {
      'bg-base': '#1a1b1e',
      'bg-surface': '#24262a',
      'bg-elevated': '#2c2e33',
      'text-primary': '#e0e0e0',
      'text-secondary': '#8b8d91',
      'accent': '#4fc3f7',
      'success': '#66bb6a',
      'error': '#ef5350',
      'warning': '#ffa726',
      'border': '#333539',
    },
  };
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
}

// ─── Color Picker Row ────────────────────────────────────────────────────

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <label className="text-xs text-text-secondary w-24 truncate" title={label}>
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-6 h-6 rounded border border-border cursor-pointer p-0 bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-none"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9a-fA-F]{0,8}$/.test(v)) onChange(v);
          }}
          onBlur={(e) => {
            // Pad incomplete hex values
            const v = e.target.value;
            if (/^#[0-9a-fA-F]{6}$/.test(v)) return;
            if (/^#[0-9a-fA-F]{3}$/.test(v)) {
              onChange(`#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`);
            }
          }}
          className="text-xs bg-bg-base border border-border rounded px-1.5 py-0.5 text-text-primary w-20 font-mono focus:outline-none focus:border-accent"
          placeholder="#000000"
        />
      </div>
    </div>
  );
}

// ─── Color labels ────────────────────────────────────────────────────────

const APP_COLOR_LABELS: Record<string, string> = {
  'bg-base': 'Background',
  'bg-surface': 'Surface',
  'bg-elevated': 'Elevated',
  'text-primary': 'Text',
  'text-secondary': 'Text Secondary',
  'accent': 'Accent',
  'success': 'Success',
  'error': 'Error',
  'warning': 'Warning',
  'border': 'Border',
};

const TERMINAL_COLOR_LABELS: Record<string, string> = {
  background: 'Background',
  foreground: 'Foreground',
  cursor: 'Cursor',
  black: 'Black',
  red: 'Red',
  green: 'Green',
  yellow: 'Yellow',
  blue: 'Blue',
  magenta: 'Magenta',
  cyan: 'Cyan',
  white: 'White',
  brightBlack: 'Bright Black',
  brightRed: 'Bright Red',
  brightGreen: 'Bright Green',
  brightYellow: 'Bright Yellow',
  brightBlue: 'Bright Blue',
  brightMagenta: 'Bright Magenta',
  brightCyan: 'Bright Cyan',
  brightWhite: 'Bright White',
};

const SYNTAX_COLOR_LABELS: Record<string, string> = {
  comment: 'Comments',
  keyword: 'Keywords',
  string: 'Strings',
  number: 'Numbers',
  function: 'Functions',
  variable: 'Variables',
  type: 'Types',
  operator: 'Operators',
};

// ─── Main Component ──────────────────────────────────────────────────────

interface ThemeEditorProps {
  /** Theme to edit (null = create new) */
  initialTheme: CustomTheme | null;
  /** Called when done editing (save or cancel) */
  onClose: () => void;
}

export function ThemeEditor({ initialTheme, onClose }: ThemeEditorProps) {
  const { saveTheme, deleteTheme, customThemes } = useThemeStore();
  const { setTheme, setCustomThemeSlug } = useAppSettingsStore();
  const { setActiveCustomTheme } = useThemeStore();

  const original = useMemo(() => initialTheme ?? createEmptyTheme('dark'), [initialTheme]);
  const [draft, setDraft] = useState<CustomTheme>(() => structuredClone(original));
  const [showTerminal, setShowTerminal] = useState(!!draft.terminal);
  const [showSyntax, setShowSyntax] = useState(!!draft.syntax);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isNew = !initialTheme;
  const isDirty = JSON.stringify(draft) !== JSON.stringify(original);

  const updateDraft = useCallback((updates: Partial<CustomTheme>) => {
    setDraft(prev => ({ ...prev, ...updates }));
  }, []);

  const updateColor = useCallback((key: string, value: string) => {
    setDraft(prev => ({
      ...prev,
      colors: { ...prev.colors, [key]: value },
    }));
  }, []);

  const updateTerminalColor = useCallback((key: string, value: string) => {
    setDraft(prev => ({
      ...prev,
      terminal: { ...(prev.terminal ?? {}), [key]: value },
    }));
  }, []);

  const updateSyntaxColor = useCallback((key: string, value: string) => {
    setDraft(prev => ({
      ...prev,
      syntax: { ...(prev.syntax ?? {}), [key]: value },
    }));
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      // Auto-generate slug from name if creating new or name changed
      const theme = { ...draft };
      if (isNew || theme.name !== original.name) {
        theme.slug = slugify(theme.name);
      }

      // Detect slug collision with a different existing user theme
      const collision = customThemes.find(
        (t) => t.slug === theme.slug && t.slug !== initialTheme?.slug && !t.builtIn
      );
      if (collision) {
        setError(`A theme with the slug "${theme.slug}" already exists ("${collision.name}"). Please choose a different name.`);
        setIsSaving(false);
        return;
      }

      // Ensure terminal and syntax are included only when enabled
      if (!showTerminal) delete theme.terminal;
      if (!showSyntax) delete theme.syntax;

      // If renaming an existing theme changed its slug, delete the old file first
      if (!isNew && initialTheme && theme.slug !== initialTheme.slug) {
        await deleteTheme(initialTheme.slug);
      }

      await saveTheme(theme);
      // Activate the saved theme
      setActiveCustomTheme(theme);
      await setCustomThemeSlug(theme.slug);
      await setTheme('custom');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDuplicate = () => {
    const dupe = structuredClone(draft);
    dupe.name = `${dupe.name} Copy`;
    dupe.slug = slugify(dupe.name);
    dupe.builtIn = false;
    setDraft(dupe);
  };

  const handleReset = () => {
    setDraft(structuredClone(original));
  };

  const handleDelete = async () => {
    if (!initialTheme) return;
    try {
      await deleteTheme(initialTheme.slug);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const isReadOnly = !!draft.builtIn;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-text-primary flex-1">
          {isNew ? 'New Theme' : `Edit: ${draft.name}`}
          {isReadOnly && <span className="text-xs text-text-secondary ml-2">(built-in — duplicate to edit)</span>}
        </h3>
        <div className="flex items-center gap-1.5">
          {!isReadOnly && (
            <>
              <button
                onClick={handleReset}
                disabled={!isDirty}
                className="flex items-center gap-1 text-xs px-2 py-1 bg-bg-surface border border-border rounded hover:bg-bg-elevated transition-colors text-text-secondary disabled:opacity-40"
                title="Reset changes"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !draft.name.trim()}
                className="flex items-center gap-1 text-xs px-3 py-1 bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-40"
              >
                <Save className="w-3 h-3" />
                Save
              </button>
            </>
          )}
          <button
            onClick={handleDuplicate}
            className="flex items-center gap-1 text-xs px-2 py-1 bg-bg-surface border border-border rounded hover:bg-bg-elevated transition-colors text-text-secondary"
            title="Duplicate"
          >
            <Copy className="w-3 h-3" />
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-bg-surface rounded transition-colors"
            title="Close editor"
          >
            <X className="w-3.5 h-3.5 text-text-secondary" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-2 p-2 bg-error/10 border border-error/30 rounded text-xs text-error">
          {error}
        </div>
      )}

      {/* Body — editor + preview side by side */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left: Color editors */}
        <div className="w-[280px] overflow-y-auto border-r border-border p-4 space-y-4">
          {/* Name & Base */}
          <div className="space-y-2">
            <div>
              <label className="text-xs text-text-secondary block mb-1">Name</label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => updateDraft({ name: e.target.value })}
                disabled={isReadOnly}
                className="text-xs bg-bg-base border border-border rounded px-2 py-1 text-text-primary w-full focus:outline-none focus:border-accent disabled:opacity-60"
                placeholder="My Theme"
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary block mb-1">Base</label>
              <select
                value={draft.base}
                onChange={(e) => updateDraft({ base: e.target.value as 'dark' | 'light' })}
                disabled={isReadOnly}
                className="text-xs bg-bg-base border border-border rounded px-2 py-1 text-text-primary w-full focus:outline-none focus:border-accent disabled:opacity-60"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>
          </div>

          {/* App Colors */}
          <div>
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">App Colors</h4>
            {Object.entries(APP_COLOR_LABELS).map(([key, label]) => (
              <ColorRow
                key={key}
                label={label}
                value={draft.colors[key] ?? '#000000'}
                onChange={(v) => !isReadOnly && updateColor(key, v)}
              />
            ))}
          </div>

          {/* Terminal Colors (collapsible) */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showTerminal}
                onChange={(e) => {
                  setShowTerminal(e.target.checked);
                  if (!e.target.checked) {
                    updateDraft({ terminal: undefined });
                  }
                }}
                disabled={isReadOnly}
                className="accent-accent"
              />
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Terminal Colors</span>
            </label>
            {showTerminal && (
              <div className="mt-2">
                {Object.entries(TERMINAL_COLOR_LABELS).map(([key, label]) => (
                  <ColorRow
                    key={key}
                    label={label}
                    value={draft.terminal?.[key] ?? '#000000'}
                    onChange={(v) => !isReadOnly && updateTerminalColor(key, v)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Syntax Colors (collapsible) */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showSyntax}
                onChange={(e) => {
                  setShowSyntax(e.target.checked);
                  if (!e.target.checked) {
                    updateDraft({ syntax: undefined });
                  }
                }}
                disabled={isReadOnly}
                className="accent-accent"
              />
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Syntax Colors</span>
            </label>
            {showSyntax && (
              <div className="mt-2">
                {Object.entries(SYNTAX_COLOR_LABELS).map(([key, label]) => (
                  <ColorRow
                    key={key}
                    label={label}
                    value={draft.syntax?.[key] ?? '#808080'}
                    onChange={(v) => !isReadOnly && updateSyntaxColor(key, v)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Delete */}
          {initialTheme && !initialTheme.builtIn && (
            <div className="pt-2 border-t border-border">
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 text-error hover:bg-error/10 rounded transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Theme
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-error">Confirm delete?</span>
                  <button
                    onClick={handleDelete}
                    className="text-xs px-2 py-1 bg-error text-white rounded hover:bg-error/80"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs px-2 py-1 bg-bg-surface border border-border rounded"
                  >
                    No
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Live Preview */}
        <div className="flex-1 overflow-y-auto p-4">
          <ThemePreview theme={draft} />
        </div>
      </div>
    </div>
  );
}
