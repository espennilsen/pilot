export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

/**
 * Parse a unified diff string (from pi's EditToolDetails.diff / generateDiffString)
 * into DiffLine[] with proper line numbers.
 */
export function parseUnifiedDiff(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const raw of diff.split('\n')) {
    // Parse hunk header for line numbers: @@ -oldStart,count +newStart,count @@
    const hunkMatch = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      continue;
    }
    if (raw === '') continue;
    if (raw.startsWith('+')) {
      lines.push({ type: 'added', content: raw.slice(1), newLineNumber: newLine });
      newLine++;
    } else if (raw.startsWith('-')) {
      lines.push({ type: 'removed', content: raw.slice(1), oldLineNumber: oldLine });
      oldLine++;
    } else if (raw.startsWith(' ')) {
      lines.push({ type: 'unchanged', content: raw.slice(1), oldLineNumber: oldLine, newLineNumber: newLine });
      oldLine++;
      newLine++;
    }
  }
  return lines;
}

export function computeSimpleDiff(oldText: string | null | undefined, newText: string | null | undefined): DiffLine[] {
  const safeOld = oldText ?? null;
  const safeNew = newText ?? '';

  // For new files (oldText is null): all lines are 'added'
  if (safeOld === null) {
    const lines = safeNew.split('\n');
    return lines.map((content, index) => ({
      type: 'added' as const,
      content,
      newLineNumber: index + 1,
    }));
  }

  // For deleted files (newText is empty): all lines are 'removed'
  if (safeNew === '') {
    const lines = safeOld.split('\n');
    return lines.map((content, index) => ({
      type: 'removed' as const,
      content,
      oldLineNumber: index + 1,
    }));
  }

  // For edits: simple line-by-line comparison
  const oldLines = safeOld.split('\n');
  const newLines = safeNew.split('\n');
  const result: DiffLine[] = [];

  // Simple Myers diff algorithm (basic implementation)
  // This is a simplified version - react-diff-viewer-continued will provide better diffs later
  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (oldIndex >= oldLines.length) {
      // Remaining lines are added
      result.push({
        type: 'added',
        content: newLines[newIndex],
        newLineNumber: newIndex + 1,
      });
      newIndex++;
    } else if (newIndex >= newLines.length) {
      // Remaining lines are removed
      result.push({
        type: 'removed',
        content: oldLines[oldIndex],
        oldLineNumber: oldIndex + 1,
      });
      oldIndex++;
    } else if (oldLines[oldIndex] === newLines[newIndex]) {
      // Lines match - unchanged
      result.push({
        type: 'unchanged',
        content: oldLines[oldIndex],
        oldLineNumber: oldIndex + 1,
        newLineNumber: newIndex + 1,
      });
      oldIndex++;
      newIndex++;
    } else {
      // Lines differ - look ahead to find matches
      const lookAhead = 3;
      let foundMatch = false;

      // Check if old line was deleted
      for (let i = 1; i <= lookAhead && newIndex + i < newLines.length; i++) {
        if (oldLines[oldIndex] === newLines[newIndex + i]) {
          // Found match - lines before it were added
          for (let j = 0; j < i; j++) {
            result.push({
              type: 'added',
              content: newLines[newIndex + j],
              newLineNumber: newIndex + j + 1,
            });
          }
          newIndex += i;
          foundMatch = true;
          break;
        }
      }

      if (!foundMatch) {
        // Check if new line was added
        for (let i = 1; i <= lookAhead && oldIndex + i < oldLines.length; i++) {
          if (oldLines[oldIndex + i] === newLines[newIndex]) {
            // Found match - lines before it were removed
            for (let j = 0; j < i; j++) {
              result.push({
                type: 'removed',
                content: oldLines[oldIndex + j],
                oldLineNumber: oldIndex + j + 1,
              });
            }
            oldIndex += i;
            foundMatch = true;
            break;
          }
        }
      }

      if (!foundMatch) {
        // No match found - treat as remove + add
        result.push({
          type: 'removed',
          content: oldLines[oldIndex],
          oldLineNumber: oldIndex + 1,
        });
        result.push({
          type: 'added',
          content: newLines[newIndex],
          newLineNumber: newIndex + 1,
        });
        oldIndex++;
        newIndex++;
      }
    }
  }

  return result;
}

export function formatDiffStats(diff: DiffLine[]): { added: number; removed: number } {
  const added = diff.filter((line) => line.type === 'added').length;
  const removed = diff.filter((line) => line.type === 'removed').length;
  return { added, removed };
}
