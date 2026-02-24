import fs from 'fs/promises';
import path from 'path';

import { PILOT_APP_DIR } from './pilot-paths';
import { getLogger } from './logger';

const log = getLogger('MemoryManager');

const GLOBAL_MEMORY_PATH = path.join(PILOT_APP_DIR, 'MEMORY.md');

/**
 * Minimum time (in milliseconds) between automatic memory extractions.
 * Prevents excessive extraction attempts during rapid agent activity.
 */
export const EXTRACTION_DEBOUNCE_MS = 30_000;

/**
 * Maximum memory context size (in bytes) to inject into system prompts.
 * Limits memory overhead when context windows are constrained.
 */
export const MAX_MEMORY_INJECT_SIZE = 50 * 1024; // 50KB

export interface MemoryExtractionResult {
  shouldSave: boolean;
  memories: Array<{
    text: string;
    scope: 'global' | 'project';
    category: string;
  }>;
}

export interface MemoryFiles {
  global: string | null;
  projectShared: string | null;
}

export class MemoryManager {
  private lastExtractionTime = 0;
  private _enabled = true;

  get enabled(): boolean {
    return this._enabled;
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  /**
   * Load and merge all memory layers for a given project.
   * Returns a single string to inject into the system prompt.
   */
  async getMemoryContext(projectPath: string): Promise<string> {
    const global = await this.loadFile(GLOBAL_MEMORY_PATH);
    const projectShared = await this.loadFile(
      path.join(projectPath, '.pilot', 'MEMORY.md')
    );

    const sections: string[] = [];

    if (global) {
      sections.push(`## Global Memory\n${global}`);
    }
    if (projectShared) {
      sections.push(`## Project Memory\n${projectShared}`);
    }

    if (sections.length === 0) return '';

    let content = sections.join('\n\n');

    // Truncate if too large — keep most recent entries
    if (Buffer.byteLength(content, 'utf-8') > MAX_MEMORY_INJECT_SIZE) {
      const lines = content.split('\n');
      // Pre-calculate byte sizes to avoid re-joining on every iteration (O(n) vs O(n²))
      const lineSizes = lines.map(l => Buffer.byteLength(l, 'utf-8'));
      let totalSize = lineSizes.reduce((a, b) => a + b, 0) + lines.length - 1; // +newlines

      // Collect indices of bullet entries (oldest first) — these are what we trim
      const bulletIndices: number[] = [];
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].startsWith('- ')) bulletIndices.push(i);
      }

      // Remove oldest bullets until under budget
      const toRemove = new Set<number>();
      for (const idx of bulletIndices) {
        if (totalSize <= MAX_MEMORY_INJECT_SIZE || (lines.length - toRemove.size) <= 10) break;
        totalSize -= lineSizes[idx] + 1; // +1 for newline
        toRemove.add(idx);
      }

      content = lines.filter((_, i) => !toRemove.has(i)).join('\n');
    }

    return [
      '<memory>',
      'The following are memories from past interactions. Use these to inform your responses.',
      'Do not mention these memories explicitly unless the user asks about them.',
      '',
      content,
      '</memory>',
    ].join('\n');
  }

  /**
   * Get raw memory files for the editor UI.
   */
  async getMemoryFiles(projectPath: string): Promise<MemoryFiles> {
    return {
      global: await this.loadFile(GLOBAL_MEMORY_PATH),
      projectShared: await this.loadFile(path.join(projectPath, '.pilot', 'MEMORY.md')),
    };
  }

  /**
   * Save a memory file by scope.
   */
  async saveMemoryFile(
    scope: 'global' | 'project',
    projectPath: string,
    content: string
  ): Promise<void> {
    const filePath = this.resolveFilePath(scope, projectPath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Clear a memory file (reset to empty).
   */
  async clearMemoryFile(
    scope: 'global' | 'project',
    projectPath: string
  ): Promise<void> {
    const filePath = this.resolveFilePath(scope, projectPath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, '# Memory\n', 'utf-8');
  }

  /**
   * Handle manual memory commands (# prefix).
   * Returns action taken and text.
   */
  async handleManualMemory(
    message: string,
    projectPath: string
  ): Promise<{ action: 'saved' | 'removed' | 'show_panel'; text: string }> {
    if (message.trim().toLowerCase() === '/memory') {
      return { action: 'show_panel', text: '' };
    }

    const content = message.replace(/^#\s*/, '').trim();

    if (!content || content.toLowerCase() === 'memory') {
      return { action: 'show_panel', text: '' };
    }

    if (content.toLowerCase().startsWith('forget ')) {
      const toForget = content.slice(7).trim();
      await this.removeMemory(toForget, projectPath);
      return { action: 'removed', text: toForget };
    }

    const cleanContent = content.replace(/^remember\s+/i, '').trim();
    const scope = this.inferScope(cleanContent);

    await this.appendMemory(cleanContent, scope, projectPath);
    return { action: 'saved', text: cleanContent };
  }

  /**
   * Build the extraction prompt for auto-memory extraction.
   * Returns the prompt string to send to a cheap model.
   */
  buildExtractionPrompt(
    userMessage: string,
    agentResponse: string,
    existingMemories: string
  ): string {
    return `You are a memory extraction system. Your job is to identify information worth remembering from a conversation between a user and a coding agent.

<existing_memories>
${existingMemories}
</existing_memories>

<latest_exchange>
User: ${userMessage}

Agent: ${agentResponse}
</latest_exchange>

Analyze the latest exchange and determine if there is anything NEW worth remembering that is NOT already in existing memories. Focus on:

1. **User preferences** — coding style, tools, frameworks, communication preferences
2. **Technical decisions** — architecture choices, library selections, patterns adopted
3. **Project facts** — deployment targets, API conventions, team practices
4. **Corrections** — if the user corrected the agent, remember the right way
5. **Explicit requests** — "always do X", "never do Y", "I prefer Z"

Rules:
- Only extract genuinely useful, reusable information
- Do NOT extract one-time task details ("fix the bug on line 42")
- Do NOT extract things already in existing memories
- Do NOT extract obvious things ("user is writing code")
- Keep each memory to ONE concise line
- If nothing is worth remembering, return empty

Respond ONLY with valid JSON, no markdown fences:
{
  "memories": [
    {
      "text": "the memory text",
      "scope": "global or project",
      "category": "User Preferences or Technical Context or Decisions or Project Notes"
    }
  ]
}

If nothing worth remembering, respond: {"memories": []}`;
  }

  /**
   * Check if extraction should be skipped (debounce).
   */
  shouldSkipExtraction(): boolean {
    const now = Date.now();
    if (now - this.lastExtractionTime < EXTRACTION_DEBOUNCE_MS) {
      return true;
    }
    return false;
  }

  /**
   * Mark extraction as having just run (for debounce).
   */
  markExtractionRun(): void {
    this.lastExtractionTime = Date.now();
  }

  /**
   * Process extraction result and save memories.
   */
  async processExtractionResult(
    resultJson: string,
    projectPath: string
  ): Promise<MemoryExtractionResult> {
    try {
      const MAX_MEMORIES_PER_EXTRACTION = 10;
      const MAX_MEMORY_TEXT_LENGTH = 500;
      const MAX_CATEGORY_LENGTH = 50;

      const parsed = JSON.parse(resultJson);
      const rawMemories = Array.isArray(parsed.memories) ? parsed.memories : [];
      const memories = rawMemories.slice(0, MAX_MEMORIES_PER_EXTRACTION);

      if (memories.length > 0) {
        for (const mem of memories) {
          if (mem.text && typeof mem.text === 'string') {
            const text = mem.text.length > MAX_MEMORY_TEXT_LENGTH
              ? mem.text.slice(0, MAX_MEMORY_TEXT_LENGTH) + '…'
              : mem.text;
            const category = (typeof mem.category === 'string' ? mem.category : 'General')
              .slice(0, MAX_CATEGORY_LENGTH);
            await this.appendMemory(
              text,
              mem.scope === 'global' ? 'global' : 'project',
              projectPath,
              category
            );
          }
        }
      }

      return { shouldSave: memories.length > 0, memories };
    } catch (err) {
      log.debug('Memory extraction parse failed', err);
      return { shouldSave: false, memories: [] };
    }
  }

  /**
   * Append a memory to the appropriate file.
   */
  async appendMemory(
    text: string,
    scope: 'global' | 'project',
    projectPath: string,
    category: string = 'General'
  ): Promise<void> {
    const filePath = this.resolveFilePath(scope, projectPath);

    await fs.mkdir(path.dirname(filePath), { recursive: true });

    let content = '';
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      /* Expected: memory file may not exist yet */
      content = '# Memory\n';
    }

    // Duplicate check
    if (content.includes(text)) return;

    const categoryHeading = `## ${category}`;
    if (content.includes(categoryHeading)) {
      const idx = content.indexOf(categoryHeading);
      const nextHeadingIdx = content.indexOf('\n## ', idx + categoryHeading.length);
      const insertIdx = nextHeadingIdx === -1 ? content.length : nextHeadingIdx;
      content = content.slice(0, insertIdx).trimEnd() +
        `\n- ${text}\n` +
        content.slice(insertIdx);
    } else {
      content = content.trimEnd() + `\n\n${categoryHeading}\n- ${text}\n`;
    }

    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Remove a memory by fuzzy matching its text.
   */
  async removeMemory(text: string, projectPath: string): Promise<boolean> {
    const files = [
      GLOBAL_MEMORY_PATH,
      path.join(projectPath, '.pilot', 'MEMORY.md'),
    ];

    for (const filePath of files) {
      try {
        let content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        const matchIdx = lines.findIndex(line =>
          line.toLowerCase().includes(text.toLowerCase()) && line.startsWith('- ')
        );
        if (matchIdx !== -1) {
          lines.splice(matchIdx, 1);
          await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
          return true;
        }
      } catch {
        /* Expected: memory file may not exist during remove */
        continue;
      }
    }
    return false;
  }

  /**
   * Get the count of memories across all files.
   */
  async getMemoryCount(projectPath: string): Promise<{ global: number; project: number; total: number }> {
    const countBullets = (content: string | null): number => {
      if (!content) return 0;
      return content.split('\n').filter(l => l.startsWith('- ')).length;
    };

    const files = await this.getMemoryFiles(projectPath);
    const globalCount = countBullets(files.global);
    const projectCount = countBullets(files.projectShared);

    return { global: globalCount, project: projectCount, total: globalCount + projectCount };
  }

  /**
   * Return the resolved file paths for each memory scope.
   */
  getMemoryPaths(projectPath: string): { global: string; projectShared: string } {
    return {
      global: GLOBAL_MEMORY_PATH,
      projectShared: path.join(projectPath, '.pilot', 'MEMORY.md'),
    };
  }

  // --- Helpers ---

  private resolveFilePath(
    scope: 'global' | 'project',
    projectPath: string
  ): string {
    switch (scope) {
      case 'global':
        return GLOBAL_MEMORY_PATH;
      case 'project':
        return path.join(projectPath, '.pilot', 'MEMORY.md');
    }
  }

  private inferScope(content: string): 'global' | 'project' {
    const globalKeywords = ['always', 'never', 'i prefer', 'i like', 'my style', 'all projects'];
    const isGlobal = globalKeywords.some(kw => content.toLowerCase().includes(kw));
    return isGlobal ? 'global' : 'project';
  }

  private async loadFile(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      /* Expected: memory file may not exist */
      return null;
    }
  }
}
