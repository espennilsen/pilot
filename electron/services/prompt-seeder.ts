/**
 * prompt-seeder.ts — Seeds built-in prompt templates from bundled resources.
 *
 * Copies bundled prompts to the global prompts directory on first run.
 * Handles version checking and content hash comparison to avoid overwriting
 * user edits while still allowing updates to newer versions.
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { getLogger } from './logger';
import { computeHash } from './prompt-parser';

const log = getLogger('PromptSeeder');

/**
 * Seed built-in prompts from a bundled directory into a global directory.
 *
 * For each bundled .md file:
 * - If the destination doesn't exist, copy it with a content hash.
 * - If the destination exists and the bundled version is newer, update it
 *   — unless the user has edited the content (detected via content hash mismatch).
 */
export async function seedBuiltins(bundledDir: string, globalDir: string): Promise<void> {
  if (!existsSync(bundledDir)) return;

  await fs.mkdir(globalDir, { recursive: true });

  let bundledFiles: string[];
  try {
    bundledFiles = (await fs.readdir(bundledDir)).filter(f => f.endsWith('.md'));
  } catch {
    return;
  }

  for (const filename of bundledFiles) {
    const destPath = path.join(globalDir, filename);
    const srcPath = path.join(bundledDir, filename);

    if (!existsSync(destPath)) {
      // New file — copy and add content hash
      const content = await fs.readFile(srcPath, 'utf-8');
      const { data: fm, content: body } = matter(content);
      fm._contentHash = computeHash(body.trim());
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
        const currentHash = computeHash(destBody.trim());

        if (storedHash && storedHash !== currentHash) {
          // User has edited — don't overwrite
          continue;
        }

        // Safe to update
        const fm = { ...srcFm };
        fm._contentHash = computeHash(srcBody.trim());
        const fileContent = matter.stringify(srcBody.trim(), fm);
        await fs.writeFile(destPath, fileContent, 'utf-8');
      }
    } catch (err) {
      log.debug('Failed to scaffold prompt file', err);
    }
  }
}
