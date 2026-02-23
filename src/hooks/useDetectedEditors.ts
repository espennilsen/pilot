import { useState, useEffect } from 'react';
import { invoke } from '../lib/ipc-client';
import { IPC } from '../../shared/ipc';

export interface DetectedEditor {
  id: string;
  name: string;
  cli: string;
}

let cache: DetectedEditor[] | null = null;

export function useDetectedEditors(): DetectedEditor[] {
  const [editors, setEditors] = useState<DetectedEditor[]>(cache ?? []);

  useEffect(() => {
    if (cache) return;

    invoke(IPC.SHELL_DETECT_EDITORS).then((result) => {
      cache = result as DetectedEditor[];
      setEditors(cache);
    });
  }, []);

  return editors;
}
