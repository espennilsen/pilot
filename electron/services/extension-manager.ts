import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, renameSync, cpSync } from 'fs';
import { join, basename } from 'path';
import AdmZip from 'adm-zip';
import {
  PILOT_EXTENSIONS_DIR,
  PILOT_SKILLS_DIR,
  PILOT_EXTENSION_REGISTRY_FILE,
} from './pilot-paths';
import type { InstalledExtension, InstalledSkill, ImportResult } from '../../shared/types';

interface ExtensionRegistryEntry {
  id: string;
  name: string;
  version: string;
  path: string;
  enabled: boolean;
  installedAt: number;
}

interface SkillRegistryEntry {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
}

interface ExtensionRegistry {
  extensions: ExtensionRegistryEntry[];
  skills?: SkillRegistryEntry[];
  lastUpdated: number;
}

export class ExtensionManager {
  private projectPath: string | null = null;

  constructor() {
    // Ensure Pilot directories exist
    mkdirSync(PILOT_EXTENSIONS_DIR, { recursive: true });
    mkdirSync(PILOT_SKILLS_DIR, { recursive: true });

    // Initialize registry if needed
    if (!existsSync(PILOT_EXTENSION_REGISTRY_FILE)) {
      this.saveRegistry({ extensions: [], lastUpdated: Date.now() });
    }
  }

  setProject(projectPath: string) {
    this.projectPath = projectPath;
  }

  // --- Extension Management ---

  listExtensions(): InstalledExtension[] {
    const extensions: InstalledExtension[] = [];
    const registry = this.loadRegistry();

    // Global extensions (from ~/.config/.pilot/extensions/)
    extensions.push(...this.scanExtensionsDir(PILOT_EXTENSIONS_DIR, 'global', registry));

    // Project extensions (from <project>/.pilot/extensions/)
    if (this.projectPath) {
      const projectExtDir = join(this.projectPath, '.pilot', 'extensions');
      if (existsSync(projectExtDir)) {
        extensions.push(...this.scanExtensionsDir(projectExtDir, 'project', registry));
      }
    }

    return extensions;
  }

  private scanExtensionsDir(
    dir: string,
    scope: 'global' | 'project' | 'built-in',
    registry: ExtensionRegistry
  ): InstalledExtension[] {
    if (!existsSync(dir)) return [];

    const extensions: InstalledExtension[] = [];
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const extPath = join(dir, entry.name);
      const packageJsonPath = join(extPath, 'package.json');

      if (!existsSync(packageJsonPath)) continue;

      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        const registryEntry = registry.extensions.find((e) => e.path === extPath);

        extensions.push({
          id: entry.name,
          name: packageJson.name || entry.name,
          description: packageJson.description || 'No description',
          version: packageJson.version || '0.0.0',
          scope,
          path: extPath,
          enabled: registryEntry?.enabled ?? true,
          hasErrors: false,
        });
      } catch (error) {
        extensions.push({
          id: entry.name,
          name: entry.name,
          description: 'Error loading extension',
          version: '0.0.0',
          scope,
          path: extPath,
          enabled: false,
          hasErrors: true,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return extensions;
  }

  toggleExtension(extensionId: string): boolean {
    const extensions = this.listExtensions();
    const ext = extensions.find((e) => e.id === extensionId);
    if (!ext) return false;

    const registry = this.loadRegistry();
    const registryEntry = registry.extensions.find((e) => e.path === ext.path);

    if (registryEntry) {
      registryEntry.enabled = !registryEntry.enabled;
    } else {
      registry.extensions.push({
        id: ext.id,
        name: ext.name,
        version: ext.version,
        path: ext.path,
        enabled: !ext.enabled,
        installedAt: Date.now(),
      });
    }

    this.saveRegistry(registry);
    return true;
  }

  removeExtension(extensionId: string): boolean {
    const extensions = this.listExtensions();
    const ext = extensions.find((e) => e.id === extensionId);
    if (!ext) return false;

    try {
      rmSync(ext.path, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to remove extension:', error);
      return false;
    }

    const registry = this.loadRegistry();
    registry.extensions = registry.extensions.filter((e) => e.path !== ext.path);
    this.saveRegistry(registry);

    return true;
  }

  importExtensionZip(zipPath: string, scope: 'global' | 'project'): ImportResult {
    const extName = basename(zipPath, '.zip');
    const targetDir = scope === 'global'
      ? PILOT_EXTENSIONS_DIR
      : join(this.projectPath || '', '.pilot', 'extensions');

    const extPath = join(targetDir, extName);

    try {
      mkdirSync(extPath, { recursive: true });

      // Extract ZIP contents into the extension directory
      this.extractZip(zipPath, extPath);

      // Verify package.json exists after extraction
      if (!existsSync(join(extPath, 'package.json'))) {
        // Check if files were extracted into a subdirectory (common with GitHub ZIPs)
        const entries = readdirSync(extPath, { withFileTypes: true });
        const singleDir = entries.length === 1 && entries[0].isDirectory() ? entries[0].name : null;
        if (singleDir && existsSync(join(extPath, singleDir, 'package.json'))) {
          // Move contents up from subdirectory
          const subDir = join(extPath, singleDir);
          for (const item of readdirSync(subDir)) {
            const src = join(subDir, item);
            const dest = join(extPath, item);
            try {
              renameSync(src, dest);
            } catch {
              /* Expected: cross-device rename fails, falls back to copy */
              cpSync(src, dest, { recursive: true });
              rmSync(src, { recursive: true, force: true });
            }
          }
          rmSync(subDir, { recursive: true, force: true });
        } else {
          rmSync(extPath, { recursive: true, force: true });
          return {
            success: false,
            id: extName,
            name: extName,
            type: 'extension',
            scope,
            error: 'ZIP does not contain a package.json — not a valid extension',
          };
        }
      }

      // Read the actual package name from the extracted package.json
      const pkg = JSON.parse(readFileSync(join(extPath, 'package.json'), 'utf-8'));

      return {
        success: true,
        id: extName,
        name: pkg.name || extName,
        type: 'extension',
        scope,
      };
    } catch (error) {
      // Clean up on failure
      if (existsSync(extPath)) rmSync(extPath, { recursive: true, force: true });
      return {
        success: false,
        id: extName,
        name: extName,
        type: 'extension',
        scope,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // --- Skill Management ---

  listSkills(): InstalledSkill[] {
    const skills: InstalledSkill[] = [];
    const registry = this.loadRegistry();

    // Global skills (from ~/.config/.pilot/skills/)
    skills.push(...this.scanSkillsDir(PILOT_SKILLS_DIR, 'global', registry));

    // Project skills (from <project>/.pilot/skills/)
    if (this.projectPath) {
      const projectSkillsDir = join(this.projectPath, '.pilot', 'skills');
      if (existsSync(projectSkillsDir)) {
        skills.push(...this.scanSkillsDir(projectSkillsDir, 'project', registry));
      }
    }

    return skills;
  }

  toggleSkill(skillId: string): boolean {
    const skills = this.listSkills();
    const skill = skills.find((s) => s.id === skillId);
    if (!skill) return false;

    const registry = this.loadRegistry();
    if (!registry.skills) registry.skills = [];

    const registryEntry = registry.skills.find((s) => s.path === skill.path);

    if (registryEntry) {
      registryEntry.enabled = !registryEntry.enabled;
    } else {
      registry.skills.push({
        id: skill.id,
        name: skill.name,
        path: skill.path,
        enabled: !skill.enabled,
      });
    }

    this.saveRegistry(registry);
    return true;
  }

  private scanSkillsDir(dir: string, scope: 'global' | 'project' | 'built-in', registry: ExtensionRegistry): InstalledSkill[] {
    if (!existsSync(dir)) return [];

    const skills: InstalledSkill[] = [];
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      // Direct .md files in the skills directory root (per SDK spec)
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const mdPath = join(dir, entry.name);
        const skillName = basename(entry.name, '.md');
        try {
          const content = readFileSync(mdPath, 'utf-8');
          const descMatch = content.match(/description:\s*(.+)/);
          const description = descMatch ? descMatch[1].trim() : 'No description';

          const registryEntry = registry.skills?.find((s) => s.path === mdPath);

          skills.push({
            id: skillName,
            name: skillName,
            description,
            scope,
            path: mdPath,
            skillMdPath: mdPath,
            enabled: registryEntry?.enabled ?? true,
          });
        } catch (error) {
          console.error('Failed to read skill .md:', error);
        }
        continue;
      }

      // Subdirectories with SKILL.md
      if (!entry.isDirectory()) continue;

      const skillPath = join(dir, entry.name);
      const skillMdPath = join(skillPath, 'SKILL.md');

      if (!existsSync(skillMdPath)) continue;

      try {
        const content = readFileSync(skillMdPath, 'utf-8');
        const descriptionMatch = content.match(/^#\s+(.+)$/m);
        const description = descriptionMatch ? descriptionMatch[1] : 'No description';

        const registryEntry = registry.skills?.find((s) => s.path === skillPath);

        skills.push({
          id: entry.name,
          name: entry.name,
          description,
          scope,
          path: skillPath,
          skillMdPath,
          enabled: registryEntry?.enabled ?? true,
        });
      } catch (error) {
        console.error('Failed to read skill:', error);
      }
    }

    return skills;
  }

  removeSkill(skillId: string): boolean {
    const skills = this.listSkills();
    const skill = skills.find((s) => s.id === skillId);
    if (!skill) return false;

    try {
      rmSync(skill.path, { recursive: true, force: true });
      return true;
    } catch (error) {
      console.error('Failed to remove skill:', error);
      return false;
    }
  }

  importSkillZip(zipPath: string, scope: 'global' | 'project'): ImportResult {
    const skillName = basename(zipPath, '.zip');
    const targetDir = scope === 'global'
      ? PILOT_SKILLS_DIR
      : join(this.projectPath || '', '.pilot', 'skills');

    const skillPath = join(targetDir, skillName);

    try {
      mkdirSync(skillPath, { recursive: true });

      // Extract ZIP contents into the skill directory
      this.extractZip(zipPath, skillPath);

      // Verify SKILL.md exists after extraction
      if (!existsSync(join(skillPath, 'SKILL.md'))) {
        // Check if files were extracted into a subdirectory
        const entries = readdirSync(skillPath, { withFileTypes: true });
        const singleDir = entries.length === 1 && entries[0].isDirectory() ? entries[0].name : null;
        if (singleDir && existsSync(join(skillPath, singleDir, 'SKILL.md'))) {
          const subDir = join(skillPath, singleDir);
          for (const item of readdirSync(subDir)) {
            const src = join(subDir, item);
            const dest = join(skillPath, item);
            try {
              renameSync(src, dest);
            } catch {
              /* Expected: cross-device rename fails, falls back to copy */
              cpSync(src, dest, { recursive: true });
              rmSync(src, { recursive: true, force: true });
            }
          }
          rmSync(subDir, { recursive: true, force: true });
        } else {
          rmSync(skillPath, { recursive: true, force: true });
          return {
            success: false,
            id: skillName,
            name: skillName,
            type: 'skill',
            scope,
            error: 'ZIP does not contain a SKILL.md — not a valid skill',
          };
        }
      }

      return {
        success: true,
        id: skillName,
        name: skillName,
        type: 'skill',
        scope,
      };
    } catch (error) {
      // Clean up on failure
      if (existsSync(skillPath)) rmSync(skillPath, { recursive: true, force: true });
      return {
        success: false,
        id: skillName,
        name: skillName,
        type: 'skill',
        scope,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Import a .md file as a skill. The SDK supports direct .md files in the skills directory root.
   * The file is copied into the skills dir. The skill name is derived from the filename.
   */
  importSkillMd(mdPath: string, scope: 'global' | 'project'): ImportResult {
    const fileName = basename(mdPath);
    const skillName = basename(mdPath, '.md');
    const targetDir = scope === 'global'
      ? PILOT_SKILLS_DIR
      : join(this.projectPath || '', '.pilot', 'skills');

    try {
      mkdirSync(targetDir, { recursive: true });

      const content = readFileSync(mdPath, 'utf-8');

      // Basic validation: check for frontmatter with description
      if (!content.includes('description:')) {
        return {
          success: false,
          id: skillName,
          name: skillName,
          type: 'skill',
          scope,
          error: 'Skill .md file must have frontmatter with a description field',
        };
      }

      writeFileSync(join(targetDir, fileName), content, 'utf-8');

      return {
        success: true,
        id: skillName,
        name: skillName,
        type: 'skill',
        scope,
      };
    } catch (error) {
      return {
        success: false,
        id: skillName,
        name: skillName,
        type: 'skill',
        scope,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // --- ZIP Extraction ---

  private extractZip(zipPath: string, targetDir: string): void {
    try {
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(targetDir, true); // overwrite = true
    } catch (err) {
      throw new Error(
        `Failed to extract ZIP: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }

  // --- Registry Management ---

  private loadRegistry(): ExtensionRegistry {
    try {
      const raw = readFileSync(PILOT_EXTENSION_REGISTRY_FILE, 'utf-8');
      return JSON.parse(raw);
    } catch {
      /* Expected: registry file may not exist */
      return { extensions: [], lastUpdated: Date.now() };
    }
  }

  private saveRegistry(registry: ExtensionRegistry): void {
    registry.lastUpdated = Date.now();
    writeFileSync(PILOT_EXTENSION_REGISTRY_FILE, JSON.stringify(registry, null, 2));
  }
}
