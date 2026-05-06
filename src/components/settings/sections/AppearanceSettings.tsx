/**
 * @file AppearanceSettings — Theme picker with preview cards and custom theme management.
 */

import { useEffect, useState } from 'react';
import { useAppSettingsStore } from '../../../stores/app-settings-store';
import { useThemeStore } from '../../../stores/theme-store';
import { Palette, Sun, Moon, Monitor, Download, Upload, Trash2, Check, Plus, Pencil } from 'lucide-react';
import type { CustomTheme, ThemeMode } from '../../../../shared/types';
import { ThemeEditor } from '../ThemeEditor';

// ─── Built-in mode cards ─────────────────────────────────────────────────

interface BuiltInTheme {
  mode: ThemeMode;
  label: string;
  icon: typeof Sun;
  colors: { bg: string; surface: string; text: string; accent: string; border: string };
}

const BUILT_IN_MODES: BuiltInTheme[] = [
  {
    mode: 'dark',
    label: 'Dark',
    icon: Moon,
    colors: { bg: '#1a1b1e', surface: '#24262a', text: '#e0e0e0', accent: '#4fc3f7', border: '#333539' },
  },
  {
    mode: 'light',
    label: 'Light',
    icon: Sun,
    colors: { bg: '#ffffff', surface: '#f4f5f7', text: '#1a1b1e', accent: '#0b7dda', border: '#d1d5db' },
  },
  {
    mode: 'system',
    label: 'System',
    icon: Monitor,
    colors: { bg: '#1a1b1e', surface: '#24262a', text: '#e0e0e0', accent: '#4fc3f7', border: '#333539' },
  },
];

// ─── Theme preview card ──────────────────────────────────────────────────

function ThemeCard({
  label,
  colors,
  isActive,
  icon: Icon,
  onClick,
}: {
  label: string;
  colors: { bg: string; surface: string; text: string; accent: string; border: string };
  isActive: boolean;
  icon?: typeof Sun;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col rounded-lg border-2 transition-all overflow-hidden cursor-pointer ${
        isActive
          ? 'border-accent ring-1 ring-accent/30'
          : 'border-border hover:border-text-secondary/40'
      }`}
      style={{ width: 130 }}
    >
      {/* Mini preview */}
      <div
        className="w-full h-16 p-2 flex flex-col gap-1"
        style={{ backgroundColor: colors.bg }}
      >
        {/* Fake titlebar */}
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors.accent }} />
          <div className="h-1.5 flex-1 rounded-sm opacity-30" style={{ backgroundColor: colors.text }} />
        </div>
        {/* Fake content */}
        <div className="flex gap-1 flex-1">
          <div className="w-6 rounded-sm" style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}` }} />
          <div className="flex-1 flex flex-col gap-0.5">
            <div className="h-1.5 w-3/4 rounded-sm opacity-40" style={{ backgroundColor: colors.text }} />
            <div className="h-1.5 w-1/2 rounded-sm opacity-25" style={{ backgroundColor: colors.text }} />
            <div className="h-1.5 w-2/3 rounded-sm" style={{ backgroundColor: colors.accent, opacity: 0.6 }} />
          </div>
        </div>
      </div>
      {/* Label */}
      <div className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-bg-surface">
        {Icon && <Icon className="w-3 h-3 text-text-secondary" />}
        <span className="text-xs font-medium text-text-primary truncate">{label}</span>
        {isActive && <Check className="w-3 h-3 text-accent" />}
      </div>
    </button>
  );
}

// ─── Custom theme card ───────────────────────────────────────────────────

function CustomThemeCard({
  theme,
  isActive,
  onSelect,
  onDelete,
}: {
  theme: CustomTheme;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const colors = {
    bg: theme.colors['bg-base'] ?? '#1a1b1e',
    surface: theme.colors['bg-surface'] ?? '#24262a',
    text: theme.colors['text-primary'] ?? '#e0e0e0',
    accent: theme.colors['accent'] ?? '#4fc3f7',
    border: theme.colors['border'] ?? '#333539',
  };

  return (
    <div className="relative group">
      <ThemeCard
        label={theme.name}
        colors={colors}
        isActive={isActive}
        onClick={onSelect}
      />
      {/* Delete button (not for built-in themes) */}
      {!theme.builtIn && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-error text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-error/80"
          title="Delete theme"
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────

export function AppearanceSettings() {
  const { theme, setTheme, customThemeSlug, setCustomThemeSlug } = useAppSettingsStore();
  const { customThemes, activeCustomTheme, loadThemes, setActiveCustomTheme, importTheme, exportTheme, deleteTheme } = useThemeStore();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editingTheme, setEditingTheme] = useState<CustomTheme | null | 'new'>(null);

  useEffect(() => {
    loadThemes();
  }, [loadThemes]);

  const handleSelectBuiltIn = (mode: ThemeMode) => {
    setTheme(mode);
    setActiveCustomTheme(null);
  };

  const handleSelectCustom = async (ct: CustomTheme) => {
    setActiveCustomTheme(ct);
    await setCustomThemeSlug(ct.slug);
    await setTheme('custom');
  };

  const handleDeleteTheme = async (slug: string) => {
    try {
      // If deleting the active custom theme, switch to dark
      if (theme === 'custom' && customThemeSlug === slug) {
        await setTheme('dark');
        await setCustomThemeSlug(undefined);
        setActiveCustomTheme(null);
      }
      await deleteTheme(slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete theme');
    } finally {
      setConfirmDelete(null);
    }
  };

  const handleImport = async () => {
    try {
      const imported = await importTheme();
      if (imported) {
        await handleSelectCustom(imported);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import theme');
    }
  };

  const handleExport = async (slug: string) => {
    try {
      await exportTheme(slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export theme');
    }
  };

  // If editing a theme, show the full editor
  if (editingTheme !== null) {
    return (
      <ThemeEditor
        initialTheme={editingTheme === 'new' ? null : editingTheme}
        onClose={() => {
          setEditingTheme(null);
          loadThemes(); // refresh list
        }}
      />
    );
  }

  return (
    <div className="p-5 space-y-6">
      {error && (
        <div className="px-3 py-2 text-sm text-error bg-error/10 border border-error/30 rounded-md flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-error hover:text-error/80 ml-2 text-xs">✕</button>
        </div>
      )}
      {/* Standard Themes */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Palette className="w-4 h-4 text-accent" />
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Theme</h3>
        </div>

        <div className="flex flex-wrap gap-3">
          {BUILT_IN_MODES.map((bt) => (
            <ThemeCard
              key={bt.mode}
              label={bt.label}
              colors={bt.colors}
              isActive={theme === bt.mode}
              icon={bt.icon}
              onClick={() => handleSelectBuiltIn(bt.mode)}
            />
          ))}
        </div>
      </div>

      {/* Custom Themes */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Palette className="w-4 h-4 text-accent" />
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide flex-1">Custom Themes</h3>
          <button
            onClick={() => setEditingTheme('new')}
            className="flex items-center gap-1 text-xs px-2 py-1 bg-accent/15 text-accent rounded hover:bg-accent/25 transition-colors"
          >
            <Plus className="w-3 h-3" />
            New
          </button>
        </div>

        {customThemes.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {customThemes.map((ct) => (
              <div key={ct.slug} className="relative group">
                <CustomThemeCard
                  theme={ct}
                  isActive={theme === 'custom' && customThemeSlug === ct.slug}
                  onSelect={() => handleSelectCustom(ct)}
                  onDelete={() => setConfirmDelete(ct.slug)}
                />
                {/* Edit button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingTheme(ct);
                  }}
                  className="absolute bottom-7 right-1 w-5 h-5 bg-bg-elevated border border-border rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-bg-surface"
                  title="Edit theme"
                >
                  <Pencil className="w-2.5 h-2.5 text-text-secondary" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-secondary">No custom themes yet. Click &quot;New&quot; or &quot;Import&quot; to get started.</p>
        )}
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="flex items-center gap-2 p-3 bg-error/10 border border-error/30 rounded-md">
          <span className="text-xs text-text-primary flex-1">
            Delete theme "{customThemes.find(t => t.slug === confirmDelete)?.name}"? This cannot be undone.
          </span>
          <button
            onClick={() => handleDeleteTheme(confirmDelete)}
            className="text-xs px-2 py-1 bg-error text-white rounded hover:bg-error/80 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={() => setConfirmDelete(null)}
            className="text-xs px-2 py-1 bg-bg-surface border border-border rounded hover:bg-bg-elevated transition-colors text-text-primary"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Import / Export */}
      <div className="border-t border-border pt-4">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Theme Management</h3>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleImport}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-bg-surface border border-border rounded-md hover:bg-bg-elevated transition-colors text-text-primary"
          >
            <Download className="w-3.5 h-3.5" />
            Import Theme
          </button>
          {theme === 'custom' && customThemeSlug && (
            <button
              onClick={() => handleExport(customThemeSlug)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-bg-surface border border-border rounded-md hover:bg-bg-elevated transition-colors text-text-primary"
            >
              <Upload className="w-3.5 h-3.5" />
              Export Current
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
