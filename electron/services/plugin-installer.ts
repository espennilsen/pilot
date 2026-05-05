/**
 * PluginInstaller — Installs, lists, and removes Pilot plugins from npm / git / local.
 *
 * Plugins live under <PILOT_DIR>/plugins/node_modules/<name>/
 * Installed plugin metadata is stored in <PILOT_DIR>/plugins/plugin-registry.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'fs';
import { join, resolve, basename } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { PILOT_PLUGINS_DIR, PILOT_PLUGIN_REGISTRY_FILE } from './pilot-paths';
import { expandHome, normalizePath } from '../utils/paths';
import type { InstalledPlugin, PluginManifest, PluginInstallResult } from '../../shared/types';

const execFileAsync = promisify(execFile);

// ─── Registry ─────────────────────────────────────────────────────────

interface PluginRegistry {
  plugins: InstalledPlugin[];
  lastUpdated: number;
}

function loadRegistry(): PluginRegistry {
  try {
    if (!existsSync(PILOT_PLUGIN_REGISTRY_FILE)) {
      return { plugins: [], lastUpdated: Date.now() };
    }
    const raw = readFileSync(PILOT_PLUGIN_REGISTRY_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { plugins: [], lastUpdated: Date.now() };
  }
}

function saveRegistry(registry: PluginRegistry): void {
  registry.lastUpdated = Date.now();
  mkdirSync(PILOT_PLUGINS_DIR, { recursive: true });
  writeFileSync(PILOT_PLUGIN_REGISTRY_FILE, JSON.stringify(registry, null, 2));
}

// ─── Installer ────────────────────────────────────────────────────────

export class PluginInstaller {
  listPlugins(): InstalledPlugin[] {
    const registry = loadRegistry();

    // Filter out plugins whose directories no longer exist
    return registry.plugins.filter(p => {
      if (!existsSync(p.path)) return false;
      // Re-read the manifest from disk in case it changed
      try {
        const pkgPath = join(p.path, 'package.json');
        if (existsSync(pkgPath)) {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
          if (pkg.pilot) {
            p.manifest = pkg.pilot;
            p.name = pkg.name || p.name;
            p.version = pkg.version || p.version;
            p.description = pkg.description || p.description;
          }
        }
        return true;
      } catch {
        p.hasErrors = true;
        return true; // Still show it but with error flag
      }
    });
  }

  async install(source: string): Promise<PluginInstallResult> {
    mkdirSync(PILOT_PLUGINS_DIR, { recursive: true });

    if (source.startsWith('npm:')) {
      return this.installFromNpm(source.slice(4));
    } else if (source.startsWith('git:')) {
      return this.installFromGit(source.slice(4));
    } else {
      // Try local path or default to npm
      const normalizedSource = normalizePath(expandHome(source));
      try {
        if (existsSync(normalizedSource)) {
          return this.installFromLocal(normalizedSource);
        }
      } catch {
        // Fall through to npm
      }
      // Default: treat as npm package
      return this.installFromNpm(source);
    }
  }

  private async installFromNpm(packageSpec: string): Promise<PluginInstallResult> {
    const pluginDir = join(PILOT_PLUGINS_DIR, 'node_modules');

    try {
      // npm install into the plugins directory
      await execFileAsync('npm', ['install', '--prefix', PILOT_PLUGINS_DIR, '--omit=dev', '--no-save', '--ignore-scripts', packageSpec], {
        timeout: 120_000,
        env: { ...process.env },
      });

      // npm creates the package under node_modules/<name>/
      // Resolve package name from spec (strip @scope/ and @version)
      const pkgName = packageSpec.split('@')[0] || packageSpec;
      const scopedParts = packageSpec.startsWith('@')
        ? packageSpec.split('/').slice(0, 2).join('/')
        : pkgName;

      return this.registerInstalledPlugin(join(pluginDir, scopedParts), packageSpec, 'npm');
    } catch (err) {
      return {
        success: false,
        error: `npm install failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  private async installFromGit(repoUrl: string): Promise<PluginInstallResult> {
    // Format: github.com/user/repo  or  github.com/user/repo@v1.0.0
    const [repo, ref] = repoUrl.includes('@')
      ? [repoUrl.substring(0, repoUrl.lastIndexOf('@')), repoUrl.substring(repoUrl.lastIndexOf('@') + 1)]
      : [repoUrl, 'HEAD'];

    const repoName = basename(repo, '.git');
    const pluginDir = join(PILOT_PLUGINS_DIR, 'node_modules', repoName);

    try {
      if (existsSync(pluginDir)) {
        rmSync(pluginDir, { recursive: true, force: true });
      }

      const gitUrl = `https://${repo}`;
      await execFileAsync('git', ['clone', '--branch', ref, '--depth', '1', gitUrl, pluginDir], {
        timeout: 60_000,
      });

      // Run npm install in the cloned repo if it has dependencies
      if (existsSync(join(pluginDir, 'package.json'))) {
        await execFileAsync('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit'], {
          cwd: pluginDir,
          timeout: 60_000,
        });
      }

      return this.registerInstalledPlugin(pluginDir, repoUrl, 'git');
    } catch (err) {
      return {
        success: false,
        error: `git install failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  private async installFromLocal(localPath: string): Promise<PluginInstallResult> {
    const pluginName = basename(localPath);
    const pluginDir = join(PILOT_PLUGINS_DIR, 'node_modules', pluginName);

    try {
      if (existsSync(pluginDir)) {
        rmSync(pluginDir, { recursive: true, force: true });
      }

      // Symlink or copy the local directory
      // For development, we symlink so changes are immediate
      await execFileAsync('ln', ['-s', localPath, pluginDir], { timeout: 5_000 }).catch(async () => {
        // If symlink fails (Windows), copy instead
        await execFileAsync('cp', ['-r', localPath, pluginDir], { timeout: 10_000 });
      });

      return this.registerInstalledPlugin(pluginDir, localPath, 'local');
    } catch (err) {
      return {
        success: false,
        error: `local install failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  private registerInstalledPlugin(
    pluginDir: string,
    sourceUrl: string,
    source: 'npm' | 'git' | 'local',
  ): PluginInstallResult {
    const pkgPath = join(pluginDir, 'package.json');

    if (!existsSync(pkgPath)) {
      return { success: false, error: 'No package.json found — not a valid plugin' };
    }

    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const manifest: PluginManifest = pkg.pilot;

      if (!manifest || !manifest.plugins || manifest.plugins.length === 0) {
        return {
          success: false,
          error: 'package.json missing "pilot.plugins" field — not a valid plugin',
        };
      }

      // Verify the entry file exists
      const entryPath = join(pluginDir, manifest.plugins[0]);
      if (!existsSync(entryPath)) {
        return {
          success: false,
          error: `Plugin entry file not found: ${manifest.plugins[0]}`,
        };
      }

      const registry = loadRegistry();
      const existingIdx = registry.plugins.findIndex(p => p.id === pkg.name);

      const installed: InstalledPlugin = {
        id: pkg.name,
        name: pkg.name,
        version: pkg.version || '0.0.0',
        description: pkg.description || 'No description',
        source,
        sourceUrl,
        installedAt: Date.now(),
        enabled: true,
        manifest,
        path: pluginDir,
        hasErrors: false,
      };

      if (existingIdx >= 0) {
        registry.plugins[existingIdx] = { ...registry.plugins[existingIdx], ...installed };
      } else {
        registry.plugins.push(installed);
      }

      saveRegistry(registry);

      return {
        success: true,
        id: installed.id,
        name: installed.name,
        version: installed.version,
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to register plugin: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  remove(pluginId: string): boolean {
    const registry = loadRegistry();
    const idx = registry.plugins.findIndex(p => p.id === pluginId);
    if (idx < 0) return false;

    const plugin = registry.plugins[idx];

    try {
      if (existsSync(plugin.path)) {
        rmSync(plugin.path, { recursive: true, force: true });
      }
    } catch (err) {
      // Continue — remove from registry even if disk cleanup fails
    }

    registry.plugins.splice(idx, 1);
    saveRegistry(registry);
    return true;
  }

  toggle(pluginId: string): boolean {
    const registry = loadRegistry();
    const plugin = registry.plugins.find(p => p.id === pluginId);
    if (!plugin) return false;

    plugin.enabled = !plugin.enabled;
    saveRegistry(registry);
    return true;
  }
}
