/**
 * @file Renderer process logger — forwards to main via IPC.
 *
 * Usage:
 *   import { getLogger } from '../lib/renderer-logger';
 *   const log = getLogger('my-component');
 *   log.info('Hello from renderer');
 */

import { IPC } from '../../shared/ipc';

export interface Logger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

function send(source: string, level: string, msg: string, data?: unknown): void {
  try {
    if (typeof window !== 'undefined' && window.api?.invoke) {
      window.api.invoke(IPC.LOG_MESSAGE, source, level, msg, data).catch(() => {
        (console as any)[level]?.(`[${source}] ${msg}`, data ?? '');
      });
    } else {
      (console as any)[level]?.(`[${source}] ${msg}`, data ?? '');
    }
  } catch {
    (console as any)[level]?.(`[${source}] ${msg}`, data ?? '');
  }
}

/**
 * Get a scoped logger for the renderer process.
 * @param source Component or module name
 */
export function getLogger(source: string): Logger {
  return {
    debug: (msg, data) => send(source, 'debug', msg, data),
    info:  (msg, data) => send(source, 'info',  msg, data),
    warn:  (msg, data) => send(source, 'warn',  msg, data),
    error: (msg, data) => send(source, 'error', msg, data),
  };
}
