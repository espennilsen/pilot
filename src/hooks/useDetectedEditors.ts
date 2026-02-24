import { useState, useEffect } from 'react';
import { invoke } from '../lib/ipc-client';
import { IPC } from '../../shared/ipc';

export interface DetectedEditor {
  id: string;
  name: string;
  cli: string;
}

interface CacheEntry {
  editors: DetectedEditor[];
  timestamp: number;
}

const CACHE_TTL_MS = 30_000; // 30 seconds
let cacheEntry: CacheEntry | null = null;

/**
 * Detects installed code editors via IPC on the system.
 * 
 * Queries the main process for available editors (VS Code, Cursor, Zed, etc.)
 * by checking common install locations and CLI availability. Results are cached
 * in memory for 30 seconds to avoid repeated IPC calls.
 * 
 * @returns Array of detected editors with id, name, and CLI command.
 *   Returns empty array while loading or if no editors are found.
 */
export function useDetectedEditors(): DetectedEditor[] {
  const [editors, setEditors] = useState<DetectedEditor[]>(() => {
    if (cacheEntry && Date.now() - cacheEntry.timestamp < CACHE_TTL_MS) {
      return cacheEntry.editors;
    }
    return [];
  });

  useEffect(() => {
    // Use cached value if still fresh
    if (cacheEntry && Date.now() - cacheEntry.timestamp < CACHE_TTL_MS) {
      return;
    }

    invoke(IPC.SHELL_DETECT_EDITORS).then((result) => {
      const detectedEditors = result as DetectedEditor[];
      cacheEntry = {
        editors: detectedEditors,
        timestamp: Date.now(),
      };
      setEditors(detectedEditors);
    });
  }, []);

  return editors;
}
