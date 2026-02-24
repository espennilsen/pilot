/**
 * prompt-parser.ts — Pure parsing functions for prompt templates.
 *
 * Extracted from PromptLibrary to support testing and separation of concerns.
 * All functions are stateless and side-effect-free.
 */

import crypto from 'crypto';
import matter from 'gray-matter';
import type { PromptTemplate, PromptVariable } from '../../shared/types';

// ─── Constants ────────────────────────────────────────────────────────────

export const MULTILINE_VARIABLE_NAMES = new Set([
  'code', 'diff', 'description', 'context', 'error', 'test_output', 'changes',
]);

export const FILE_VARIABLE_NAMES = new Set([
  'file', 'files', 'path', 'paths', 'filepath', 'file_path', 'file_paths',
  'folder', 'directory', 'dir', 'target', 'source', 'input_file', 'output_file',
]);

export const VALID_CATEGORIES = new Set([
  'Code', 'Writing', 'Debug', 'Refactor', 'Explain', 'Custom',
]);

export const COMMAND_REGEX = /^[a-z][a-z0-9-]{1,19}$/;
export const VARIABLE_REGEX = /\{\{(\w+)\}\}/g;

// ─── Types ────────────────────────────────────────────────────────────────

export interface ParsedPromptFile {
  id: string;
  filePath: string;
  template: PromptTemplate;
}

// ─── Functions ────────────────────────────────────────────────────────────

/**
 * Parse a single .md file into a PromptTemplate.
 */
export function parsePromptFile(
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
  const variables = extractVariables(body, fm.variables);

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
export function extractVariables(
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

/**
 * Compute SHA-256 hash of content (first 16 chars).
 */
export function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Convert text to URL-safe slug.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20) || 'prompt';
}
