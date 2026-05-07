/**
 * @file Theme service — CRUD operations for custom themes.
 *
 * Manages user-created themes stored as JSON files in <PILOT_DIR>/themes/.
 * Built-in themes are bundled in the app resources and copied on first launch.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { app, dialog, BrowserWindow } from 'electron';
import { PILOT_THEMES_DIR, ensurePilotAppDirs } from './pilot-paths';
import type { CustomTheme } from '../../shared/types';

// ─── Validation ──────────────────────────────────────────────────────────

/** Only allow valid hex color values (3, 4, 6, or 8 hex digits). */
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Required keys in the colors object. */
const REQUIRED_COLOR_KEYS = [
  'bg-base', 'bg-surface', 'bg-elevated',
  'text-primary', 'text-secondary',
  'accent', 'success', 'error', 'warning', 'border',
];

function isValidColorValue(v: unknown): v is string {
  return typeof v === 'string' && HEX_COLOR_RE.test(v);
}

function validateColorMap(map: unknown): map is Record<string, string> {
  if (typeof map !== 'object' || map === null) return false;
  for (const [, v] of Object.entries(map)) {
    if (!isValidColorValue(v)) return false;
  }
  return true;
}

function validateTheme(theme: unknown): theme is CustomTheme {
  if (typeof theme !== 'object' || theme === null) return false;
  const t = theme as Record<string, unknown>;

  if (typeof t.name !== 'string' || !t.name.trim()) return false;
  if (typeof t.slug !== 'string' || !t.slug.trim()) return false;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(t.slug)) return false;
  if (typeof t.author !== 'string') return false;
  if (t.base !== 'dark' && t.base !== 'light') return false;
  if (typeof t.version !== 'number') return false;

  // colors must exist and contain valid hex values
  if (!validateColorMap(t.colors)) return false;
  // All required keys must be present
  const colorKeys = Object.keys(t.colors as Record<string, string>);
  for (const key of REQUIRED_COLOR_KEYS) {
    if (!colorKeys.includes(key)) return false;
  }

  // terminal and syntax are optional but must be valid if present
  if (t.terminal !== undefined && !validateColorMap(t.terminal)) return false;
  if (t.syntax !== undefined && !validateColorMap(t.syntax)) return false;

  return true;
}

/** Generate a URL-safe slug from a theme name. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── Built-in Themes ─────────────────────────────────────────────────────

function getBuiltInThemesDir(): string {
  // In development: resources are relative to the project root
  // In production: resources are in app.getAppPath()/resources/
  const devPath = join(app.getAppPath(), 'resources', 'themes');
  if (existsSync(devPath)) return devPath;

  // Fallback for packaged apps
  const prodPath = join(process.resourcesPath, 'themes');
  if (existsSync(prodPath)) return prodPath;

  return devPath; // will just be empty
}

// ─── Theme Service ───────────────────────────────────────────────────────

export class ThemeService {
  private themesDir: string;

  constructor() {
    ensurePilotAppDirs();
    this.themesDir = PILOT_THEMES_DIR;
    this.copyBuiltInThemes();
  }

  /** Copy built-in themes to user themes dir on first launch (won't overwrite existing). */
  private copyBuiltInThemes(): void {
    const builtInDir = getBuiltInThemesDir();
    if (!existsSync(builtInDir)) return;

    try {
      const files = readdirSync(builtInDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const destPath = join(this.themesDir, file);
        if (existsSync(destPath)) continue; // don't overwrite user modifications
        try {
          const content = readFileSync(join(builtInDir, file), 'utf-8');
          const theme = JSON.parse(content);
          if (validateTheme(theme)) {
            writeFileSync(destPath, JSON.stringify(theme, null, 2), 'utf-8');
          }
        } catch {
          // Skip invalid built-in themes
        }
      }
    } catch {
      // Built-in themes dir may not exist — that's fine
    }
  }

  /** List all available custom themes. */
  list(): CustomTheme[] {
    if (!existsSync(this.themesDir)) return [];

    const themes: CustomTheme[] = [];
    try {
      const files = readdirSync(this.themesDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const content = readFileSync(join(this.themesDir, file), 'utf-8');
          const theme = JSON.parse(content);
          if (validateTheme(theme)) {
            themes.push(theme);
          }
        } catch {
          // Skip malformed files
        }
      }
    } catch {
      // Directory read failed
    }

    return themes.sort((a, b) => {
      // Built-in themes first, then alphabetical
      if (a.builtIn && !b.builtIn) return -1;
      if (!a.builtIn && b.builtIn) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  /** Get a single theme by slug. */
  get(slug: string): CustomTheme | null {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null;
    const filePath = join(this.themesDir, `${slug}.json`);
    if (!existsSync(filePath)) return null;

    try {
      const content = readFileSync(filePath, 'utf-8');
      const theme = JSON.parse(content);
      if (validateTheme(theme)) return theme;
    } catch {
      // Invalid theme file
    }
    return null;
  }

  /** Save (create or update) a custom theme. */
  save(theme: CustomTheme): void {
    if (!validateTheme(theme)) {
      throw new Error('Invalid theme: missing required fields or invalid color values');
    }

    // Don't allow overwriting built-in themes
    const existing = this.get(theme.slug);
    if (existing?.builtIn) {
      throw new Error(`Cannot overwrite built-in theme "${theme.name}"`);
    }

    const filePath = join(this.themesDir, `${theme.slug}.json`);
    writeFileSync(filePath, JSON.stringify(theme, null, 2), 'utf-8');
  }

  /** Delete a custom theme by slug. */
  delete(slug: string): void {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      throw new Error(`Invalid theme slug: ${slug}`);
    }

    const existing = this.get(slug);
    if (existing?.builtIn) {
      throw new Error(`Cannot delete built-in theme "${existing.name}"`);
    }

    const filePath = join(this.themesDir, `${slug}.json`);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }

  /** Import a theme from a file dialog. Returns the imported theme or null if cancelled. */
  async import(): Promise<CustomTheme | null> {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
      title: 'Import Theme',
      filters: [{ name: 'Theme JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });

    if (result.canceled || !result.filePaths.length) return null;

    const filePath = result.filePaths[0];
    try {
      const content = readFileSync(filePath, 'utf-8');
      const theme = JSON.parse(content);

      if (!validateTheme(theme)) {
        throw new Error('Invalid theme file: missing required fields or invalid color values');
      }

      // Ensure it's not marked as built-in
      theme.builtIn = false;

      // Deduplicate slug if needed
      let slug = theme.slug;
      let counter = 1;
      while (existsSync(join(this.themesDir, `${slug}.json`))) {
        if (counter > 1000) throw new Error('Too many slug collisions during import');
        const existing = this.get(slug);
        if (existing?.builtIn) {
          slug = `${theme.slug}-${counter++}`;
        } else {
          break; // Overwrite existing non-built-in theme with same slug
        }
      }
      theme.slug = slug;

      this.save(theme);
      return theme;
    } catch (err) {
      throw new Error(`Failed to import theme: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Export a theme to a file dialog. */
  async export(slug: string): Promise<void> {
    const theme = this.get(slug);
    if (!theme) throw new Error(`Theme not found: ${slug}`);

    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showSaveDialog(win ?? BrowserWindow.getAllWindows()[0], {
      title: 'Export Theme',
      defaultPath: `${theme.slug}.json`,
      filters: [{ name: 'Theme JSON', extensions: ['json'] }],
    });

    if (result.canceled || !result.filePath) return;

    // Strip builtIn flag from export
    const exportTheme = { ...theme };
    delete exportTheme.builtIn;

    writeFileSync(result.filePath, JSON.stringify(exportTheme, null, 2), 'utf-8');
  }
}
