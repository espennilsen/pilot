/**
 * PromptLibrary — Service for loading, managing, and querying prompt templates.
 *
 * Two-layer merge: global (~/.config/.pilot/prompts/) + project (<cwd>/.pilot/prompts/).
 * Project prompts override global prompts with the same filename.
 * File watching via chokidar for live reload on external edits.
 */

import fs from 'fs/promises';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import matter from 'gray-matter';
import chokidar from 'chokidar';
import { PILOT_PROMPTS_DIR } from './pilot-paths';
import { CommandRegistry } from './command-registry';
import type {
  PromptTemplate,
  PromptVariable,
  CommandConflict,
  PromptCreateInput,
  PromptUpdateInput,
} from '../../shared/types';

// ─── Constants ────────────────────────────────────────────────────────────

const MULTILINE_VARIABLE_NAMES = new Set([
  'code', 'diff', 'description', 'context', 'error', 'test_output', 'changes',
]);

const FILE_VARIABLE_NAMES = new Set([
  'file', 'files', 'path', 'paths', 'filepath', 'file_path', 'file_paths',
  'folder', 'directory', 'dir', 'target', 'source', 'input_file', 'output_file',
]);

const VALID_CATEGORIES = new Set([
  'Code', 'Writing', 'Debug', 'Refactor', 'Explain', 'Custom',
]);

const COMMAND_REGEX = /^[a-z][a-z0-9-]{1,19}$/;
const VARIABLE_REGEX = /\{\{(\w+)\}\}/g;

// ─── Types ────────────────────────────────────────────────────────────────

type ChangeCallback = () => void;

interface ParsedPromptFile {
  id: string;
  filePath: string;
  template: PromptTemplate;
}

// ─── PromptLibrary ────────────────────────────────────────────────────────

export class PromptLibrary {
  private prompts = new Map<string, PromptTemplate>();
  private overriddenPrompts = new Map<string, PromptTemplate>(); // global prompts overridden by project
  private filePaths = new Map<string, string>(); // id → file path
  private projectPath: string | null = null;
  private listeners = new Set<ChangeCallback>();
  private globalWatcher: chokidar.FSWatcher | null = null;
  private projectWatcher: chokidar.FSWatcher | null = null;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;
  private registryUnsub: (() => void) | null = null;
  private seeded = false;

  // ── Lifecycle ───────────────────────────────────────────────────────

  /**
   * Initialize: seed built-ins, load prompts, start watchers.
   */
  async init(projectPath?: string): Promise<void> {
    this.projectPath = projectPath ?? null;

    // Seed built-in prompts on first run
    await this.seedBuiltins();

    // Load all prompts
    await this.reload();

    // Watch global directory
    this.startGlobalWatcher();

    // Watch project directory if applicable
    if (this.projectPath) {
      this.startProjectWatcher();
    }

    // Listen for command registry changes to recompute conflicts
    this.registryUnsub = CommandRegistry.onChange(() => {
      this.computeConflicts();
      this.emit();
    });
  }

  /**
   * Reload prompts for a new project path.
   */
  async setProjectPath(projectPath: string | null): Promise<void> {
    if (this.projectPath === projectPath) return;
    this.projectPath = projectPath;

    // Stop old project watcher
    this.projectWatcher?.close();
    this.projectWatcher = null;

    // Reload with new project
    await this.reload();

    // Start new project watcher
    if (this.projectPath) {
      this.startProjectWatcher();
    }
  }

  dispose(): void {
    this.globalWatcher?.close();
    this.projectWatcher?.close();
    this.registryUnsub?.();
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
  }

  // ── Loading ─────────────────────────────────────────────────────────

  /**
   * Reload all prompts from disk, merge layers, compute conflicts.
   */
  async reload(): Promise<void> {
    this.prompts.clear();
    this.filePaths.clear();
    this.overriddenPrompts.clear();

    // Layer 1: Global prompts
    const globalPrompts = await this.loadFromDir(PILOT_PROMPTS_DIR, 'global');

    // Layer 2: Project prompts (override global by filename)
    const projectPrompts = this.projectPath
      ? await this.loadFromDir(path.join(this.projectPath, '.pilot', 'prompts'), 'project')
      : [];

    // Build set of project IDs for override detection
    const projectIds = new Set(projectPrompts.map(p => p.id));

    // Merge: global first, then project overrides
    for (const p of globalPrompts) {
      if (projectIds.has(p.id)) {
        // This global prompt is overridden by a project prompt
        this.overriddenPrompts.set(p.id, p.template);
      } else {
        this.prompts.set(p.id, p.template);
        this.filePaths.set(p.id, p.filePath);
      }
    }
    for (const p of projectPrompts) {
      this.prompts.set(p.id, p.template);
      this.filePaths.set(p.id, p.filePath);
    }

    this.computeConflicts();
  }

  /**
   * Parse all .md files in a directory.
   */
  private async loadFromDir(dir: string, layer: 'global' | 'project'): Promise<ParsedPromptFile[]> {
    const results: ParsedPromptFile[] = [];

    if (!existsSync(dir)) return results;

    let files: string[];
    try {
      files = (await fs.readdir(dir)).filter(f => f.endsWith('.md'));
    } catch {
      return results;
    }

    for (const filename of files) {
      try {
        const filePath = path.join(dir, filename);
        const raw = await fs.readFile(filePath, 'utf-8');
        const parsed = this.parsePromptFile(filename, filePath, raw, layer);
        if (parsed) results.push(parsed);
      } catch {
        // Skip malformed files silently
      }
    }

    return results;
  }

  /**
   * Parse a single .md file into a PromptTemplate.
   */
  private parsePromptFile(
    filename: string,
    filePath: string,
    raw: string,
    layer: 'global' | 'project'
  ): ParsedPromptFile | null {
    const { data: fm, content } = matter(raw);
    const id = filename.replace(/\.md$/, '');
    const body = content.trim();

    if (!body) return null;

    // Determine source
    let source: PromptTemplate['source'];
    if (layer === 'project') {
      source = 'project';
    } else {
      source = fm.source === 'builtin' ? 'builtin' : 'user';
    }

    // Extract variables from content
    const variables = this.extractVariables(body, fm.variables);

    // File stats for timestamps
    const now = new Date().toISOString();

    const template: PromptTemplate = {
      id,
      title: fm.title || id,
      description: fm.description || '',
      content: body,
      category: VALID_CATEGORIES.has(fm.category) ? fm.category : 'Custom',
      icon: fm.icon || '📝',
      command: fm.command && typeof fm.command === 'string' ? fm.command : null,
      commandConflict: null, // computed after all prompts are loaded
      variables,
      source,
      hidden: fm.hidden === true,
      createdAt: fm.createdAt || now,
      updatedAt: fm.updatedAt || now,
    };

    return { id, filePath, template };
  }

  /**
   * Extract variables from {{...}} patterns in content.
   * Merge with frontmatter overrides if present.
   */
  private extractVariables(
    content: string,
    fmVariables?: Record<string, any>
  ): PromptVariable[] {
    const seen = new Set<string>();
    const variables: PromptVariable[] = [];
    let match: RegExpExecArray | null;

    // Reset regex state
    VARIABLE_REGEX.lastIndex = 0;
    while ((match = VARIABLE_REGEX.exec(content)) !== null) {
      const name = match[1];
      if (seen.has(name)) continue;
      seen.add(name);

      // Check for frontmatter override
      const override = fmVariables?.[name];

      let type: PromptVariable['type'] = FILE_VARIABLE_NAMES.has(name) ? 'file'
        : MULTILINE_VARIABLE_NAMES.has(name) ? 'multiline' : 'text';
      let options: string[] | undefined;
      let defaultValue: string | undefined;
      let placeholder = name.replace(/_/g, ' ');
      let required = true;

      if (override && typeof override === 'object') {
        if (override.type === 'select' || override.type === 'multiline' || override.type === 'text' || override.type === 'file') {
          type = override.type;
        }
        if (Array.isArray(override.options)) {
          options = override.options;
          type = 'select';
        }
        if (override.default != null) defaultValue = String(override.default);
        if (override.placeholder) placeholder = override.placeholder;
        if (override.required === false) required = false;
      }

      variables.push({ name, placeholder, type, options, required, defaultValue });
    }

    return variables;
  }

  // ── Conflict Detection ──────────────────────────────────────────────

  /**
   * Compute command conflicts for all loaded prompts.
   * Priority: project > user > builtin
   */
  private computeConflicts(): void {
    const claimedCommands = new Map<string, string>(); // command → prompt id

    // Sort prompts by priority: project > user > builtin
    const sorted = Array.from(this.prompts.values()).sort((a, b) => {
      const priority = { project: 0, user: 1, builtin: 2 };
      return (priority[a.source] ?? 3) - (priority[b.source] ?? 3);
    });

    for (const prompt of sorted) {
      prompt.commandConflict = null;

      if (!prompt.command || prompt.hidden) continue;

      // Check system command conflict
      const systemCmd = CommandRegistry.getSystemCommand(prompt.command);
      if (systemCmd) {
        prompt.commandConflict = {
          type: 'system',
          reason: `Conflicts with ${systemCmd.owner} (/${prompt.command})`,
          owner: systemCmd.owner,
        };
        continue;
      }

      // Check duplicate prompt command
      const existingId = claimedCommands.get(prompt.command);
      if (existingId) {
        const existing = this.prompts.get(existingId);
        prompt.commandConflict = {
          type: 'duplicate',
          reason: `/${prompt.command} is already used by ${existing?.title ?? existingId}`,
          conflictingPromptId: existingId,
        };
        continue;
      }

      // Claim the command
      claimedCommands.set(prompt.command, prompt.id);
    }
  }

  // ── Query ───────────────────────────────────────────────────────────

  /**
   * Get all non-hidden prompts.
   */
  getAll(): PromptTemplate[] {
    return Array.from(this.prompts.values()).filter(p => !p.hidden);
  }

  /**
   * Get ALL prompts including hidden and overridden (for manager panel).
   */
  getAllIncludingHidden(): PromptTemplate[] {
    const active = Array.from(this.prompts.values());
    const overridden = Array.from(this.overriddenPrompts.values());
    return [...active, ...overridden];
  }

  /**
   * Get a single prompt by ID.
   */
  getById(id: string): PromptTemplate | null {
    return this.prompts.get(id) ?? null;
  }

  /**
   * Get the highest-priority prompt with this command that has no conflict
   * and is not hidden.
   */
  getByCommand(command: string): PromptTemplate | null {
    for (const prompt of this.prompts.values()) {
      if (
        prompt.command === command &&
        !prompt.commandConflict &&
        !prompt.hidden
      ) {
        return prompt;
      }
    }
    return null;
  }

  /**
   * Get all non-hidden, non-conflicted prompt commands for autocomplete.
   */
  getAllCommands(): Array<{ command: string; promptId: string; title: string; icon: string; description: string }> {
    const result: Array<{ command: string; promptId: string; title: string; icon: string; description: string }> = [];
    for (const prompt of this.prompts.values()) {
      if (prompt.command && !prompt.commandConflict && !prompt.hidden) {
        result.push({
          command: prompt.command,
          promptId: prompt.id,
          title: prompt.title,
          icon: prompt.icon,
          description: prompt.description,
        });
      }
    }
    return result;
  }

  /**
   * Fill template variables. Returns the final prompt text.
   */
  fillTemplate(content: string, values: Record<string, string>): string {
    let result = content;
    for (const [key, value] of Object.entries(values)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    // Remove unfilled optional variables
    result = result.replace(/\{\{\w+\}\}/g, '').replace(/\n{3,}/g, '\n\n').trim();
    return result;
  }

  // ── Validation ──────────────────────────────────────────────────────

  /**
   * Validate a command string. Returns { valid, error? }.
   */
  validateCommand(
    command: string,
    excludePromptId?: string
  ): { valid: boolean; error?: string } {
    if (!command) return { valid: true };

    if (!COMMAND_REGEX.test(command)) {
      return {
        valid: false,
        error: 'Command must be lowercase, 2-20 chars, letters/numbers/hyphens only',
      };
    }

    // Check system commands
    const systemCmd = CommandRegistry.getSystemCommand(command);
    if (systemCmd) {
      return {
        valid: false,
        error: `/${command} is a system command (${systemCmd.owner})`,
      };
    }

    // Check existing prompts
    for (const prompt of this.prompts.values()) {
      if (prompt.id === excludePromptId) continue;
      if (prompt.command === command && !prompt.hidden) {
        return {
          valid: false,
          error: `/${command} is already used by ${prompt.title}`,
        };
      }
    }

    return { valid: true };
  }

  // ── CRUD ────────────────────────────────────────────────────────────

  /**
   * Create a new prompt. Returns the created template.
   */
  async create(input: PromptCreateInput, projectPath?: string): Promise<PromptTemplate> {
    const dir = input.scope === 'project' && projectPath
      ? path.join(projectPath, '.pilot', 'prompts')
      : PILOT_PROMPTS_DIR;

    await fs.mkdir(dir, { recursive: true });

    // Generate filename
    const baseSlug = input.command || this.slugify(input.title);
    let filename = `${baseSlug}.md`;
    let counter = 2;
    while (existsSync(path.join(dir, filename))) {
      filename = `${baseSlug}-${counter}.md`;
      counter++;
    }

    const now = new Date().toISOString();
    const source = input.scope === 'project' ? 'project' : 'user';

    const frontmatter: Record<string, any> = {
      title: input.title,
      icon: input.icon || '📝',
      category: input.category || 'Custom',
      source,
      description: input.description || '',
      createdAt: now,
      updatedAt: now,
    };

    if (input.command) {
      frontmatter.command = input.command;
    }

    const fileContent = matter.stringify(input.content, frontmatter);
    await fs.writeFile(path.join(dir, filename), fileContent, 'utf-8');

    // Reload will be triggered by file watcher, but do an immediate reload
    await this.reload();
    this.emit();

    return this.prompts.get(filename.replace(/\.md$/, ''))!;
  }

  /**
   * Update an existing prompt.
   */
  async update(id: string, updates: PromptUpdateInput): Promise<PromptTemplate | null> {
    const filePath = this.filePaths.get(id);
    if (!filePath) return null;

    const raw = await fs.readFile(filePath, 'utf-8');
    const { data: fm, content } = matter(raw);

    // Apply updates to frontmatter
    if (updates.title !== undefined) fm.title = updates.title;
    if (updates.description !== undefined) fm.description = updates.description;
    if (updates.category !== undefined) fm.category = updates.category;
    if (updates.icon !== undefined) fm.icon = updates.icon;
    if (updates.command !== undefined) fm.command = updates.command;
    if (updates.hidden !== undefined) fm.hidden = updates.hidden;
    fm.updatedAt = new Date().toISOString();

    // Update content hash if this is a built-in being edited
    if (fm.source === 'builtin' && updates.content !== undefined) {
      fm._contentHash = this.computeHash(updates.content);
    }

    const body = updates.content !== undefined ? updates.content : content.trim();
    const fileContent = matter.stringify(body, fm);
    await fs.writeFile(filePath, fileContent, 'utf-8');

    await this.reload();
    this.emit();

    return this.prompts.get(id) ?? null;
  }

  /**
   * Delete a prompt. Built-ins are hidden instead of deleted.
   */
  async delete(id: string): Promise<boolean> {
    const prompt = this.prompts.get(id);
    if (!prompt) return false;

    if (prompt.source === 'builtin') {
      // Hide instead of delete
      await this.update(id, { hidden: true });
      return true;
    }

    const filePath = this.filePaths.get(id);
    if (!filePath) return false;

    try {
      await fs.unlink(filePath);
      await this.reload();
      this.emit();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Unhide a hidden built-in prompt.
   */
  async unhide(id: string): Promise<boolean> {
    const prompt = this.prompts.get(id);
    if (!prompt) return false;
    await this.update(id, { hidden: false });
    return true;
  }

  // ── Built-in Seeding ────────────────────────────────────────────────

  /**
   * Seed built-in prompts from resources/prompts/ into the global directory.
   */
  private async seedBuiltins(): Promise<void> {
    if (this.seeded) return;
    this.seeded = true;

    const bundledDir = path.join(__dirname, '../../resources/prompts');
    if (!existsSync(bundledDir)) return;

    await fs.mkdir(PILOT_PROMPTS_DIR, { recursive: true });

    let bundledFiles: string[];
    try {
      bundledFiles = (await fs.readdir(bundledDir)).filter(f => f.endsWith('.md'));
    } catch {
      return;
    }

    for (const filename of bundledFiles) {
      const destPath = path.join(PILOT_PROMPTS_DIR, filename);
      const srcPath = path.join(bundledDir, filename);

      if (!existsSync(destPath)) {
        // New file — copy and add content hash
        const content = await fs.readFile(srcPath, 'utf-8');
        const { data: fm, content: body } = matter(content);
        fm._contentHash = this.computeHash(body.trim());
        const fileContent = matter.stringify(body.trim(), fm);
        await fs.writeFile(destPath, fileContent, 'utf-8');
        continue;
      }

      // File exists — check if we should update
      try {
        const srcContent = await fs.readFile(srcPath, 'utf-8');
        const destContent = await fs.readFile(destPath, 'utf-8');

        const { data: srcFm, content: srcBody } = matter(srcContent);
        const { data: destFm, content: destBody } = matter(destContent);

        const srcVersion = typeof srcFm.version === 'number' ? srcFm.version : 0;
        const destVersion = typeof destFm.version === 'number' ? destFm.version : 0;

        if (srcVersion > destVersion) {
          // Check if user has edited the file
          const storedHash = destFm._contentHash;
          const currentHash = this.computeHash(destBody.trim());

          if (storedHash && storedHash !== currentHash) {
            // User has edited — don't overwrite
            continue;
          }

          // Safe to update
          const fm = { ...srcFm };
          fm._contentHash = this.computeHash(srcBody.trim());
          const fileContent = matter.stringify(srcBody.trim(), fm);
          await fs.writeFile(destPath, fileContent, 'utf-8');
        }
      } catch {
        // Skip on error
      }
    }
  }

  // ── File Watching ───────────────────────────────────────────────────

  private startGlobalWatcher(): void {
    if (this.globalWatcher) return;
    if (!existsSync(PILOT_PROMPTS_DIR)) return;

    this.globalWatcher = chokidar.watch(PILOT_PROMPTS_DIR, {
      ignoreInitial: true,
      depth: 0,
    });

    this.globalWatcher.on('all', () => this.debouncedReload());
  }

  private startProjectWatcher(): void {
    if (!this.projectPath) return;
    const dir = path.join(this.projectPath, '.pilot', 'prompts');
    if (!existsSync(dir)) return;

    this.projectWatcher = chokidar.watch(dir, {
      ignoreInitial: true,
      depth: 0,
    });

    this.projectWatcher.on('all', () => this.debouncedReload());
  }

  private debouncedReload(): void {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(async () => {
      await this.reload();
      this.emit();
    }, 300);
  }

  // ── Event Emitter ───────────────────────────────────────────────────

  onChange(callback: ChangeCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emit(): void {
    for (const cb of this.listeners) {
      try { cb(); } catch { /* ignore */ }
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private computeHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20) || 'prompt';
  }
}
