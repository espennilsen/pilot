/**
 * @file Centralized logging service for PiLot main process.
 *
 * - Log levels: debug (0), info (1), warn (2), error (3)
 * - Daily log files (pilot-YYYY-MM-DD.log) with size-based mid-day rotation
 * - Age-based cleanup (default: 14 days retention)
 * - Syslog transport via UDP (RFC 5424)
 * - Zero external dependencies
 *
 * Usage:
 *   import { getLogger } from '../services/logger';
 *   const log = getLogger('my-module');
 *   log.info('Hello', { key: 'value' });
 */

import { createWriteStream, existsSync, statSync, renameSync, unlinkSync, readdirSync, type WriteStream } from 'fs';
import { join } from 'path';
import { createSocket, type Socket } from 'dgram';
import { hostname } from 'os';
import { PILOT_LOGS_DIR, ensurePilotAppDirs } from './pilot-paths';
import { loadAppSettings } from './app-settings';
import type { PilotAppSettings } from '../../shared/types';

// ─── Log Levels ──────────────────────────────────────────────────────────

const enum Level {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LEVEL_NAMES: Record<Level, string> = {
  [Level.DEBUG]: 'DEBUG',
  [Level.INFO]: 'INFO',
  [Level.WARN]: 'WARN',
  [Level.ERROR]: 'ERROR',
};

/** Map syslog severity: debug=7, info=6, warn=4, error=3 */
const SYSLOG_SEVERITY: Record<Level, number> = {
  [Level.DEBUG]: 7,
  [Level.INFO]: 6,
  [Level.WARN]: 4,
  [Level.ERROR]: 3,
};

function parseLevel(s: string): Level {
  switch (s) {
    case 'debug': return Level.DEBUG;
    case 'info':  return Level.INFO;
    case 'warn':  return Level.WARN;
    case 'error': return Level.ERROR;
    default:      return Level.WARN;
  }
}

// ─── Config ──────────────────────────────────────────────────────────────

interface FileConfig {
  enabled: boolean;
  dir: string;
  maxBytes: number;
  retainDays: number;
}

interface SyslogConfig {
  enabled: boolean;
  host: string;
  port: number;
  facility: number;
  appName: string;
}

interface Config {
  level: Level;
  file: FileConfig;
  syslog: SyslogConfig;
}

// ─── State ───────────────────────────────────────────────────────────────

let cfg: Config | null = null;
let fileStream: WriteStream | null = null;
let currentFilePath: string | null = null;
let currentFileDate: string | null = null;
let udpSocket: Socket | null = null;
const cachedHostname = hostname();

// ─── Public API ──────────────────────────────────────────────────────────

/** Initialise from app settings. Call once, early in startup. */
export function initLogger(): void {
  const settings = loadAppSettings();
  cfg = buildConfig(settings);
  if (cfg.file.enabled) openFileStream();
  if (cfg.syslog.enabled) openSyslog();
}

/** Reload config (e.g. after settings change). */
export function reloadLogger(): void {
  shutdownLogger();
  initLogger();
}

/** Close streams and sockets. */
export function shutdownLogger(): void {
  if (fileStream) { fileStream.end(); fileStream = null; }
  if (udpSocket) { try { udpSocket.close(); } catch { /* already closed */ } udpSocket = null; }
  currentFilePath = null;
  currentFileDate = null;
  cfg = null;
}

export interface Logger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

/** Get a scoped logger. `source` identifies the module (e.g. 'session-manager'). */
export function getLogger(source: string): Logger {
  return {
    debug: (msg, data) => log(Level.DEBUG, source, msg, data),
    info:  (msg, data) => log(Level.INFO,  source, msg, data),
    warn:  (msg, data) => log(Level.WARN,  source, msg, data),
    error: (msg, data) => log(Level.ERROR, source, msg, data),
  };
}

// ─── Internal ────────────────────────────────────────────────────────────

function buildConfig(s: PilotAppSettings): Config {
  const l = s.logging ?? {};
  return {
    level: parseLevel(l.level ?? 'warn'),
    file: {
      enabled: l.file?.enabled ?? true,
      dir: PILOT_LOGS_DIR,
      maxBytes: (l.file?.maxSizeMB ?? 10) * 1024 * 1024,
      retainDays: l.file?.retainDays ?? 14,
    },
    syslog: {
      enabled: l.syslog?.enabled ?? false,
      host: l.syslog?.host ?? 'localhost',
      port: l.syslog?.port ?? 514,
      facility: l.syslog?.facility ?? 16,
      appName: l.syslog?.appName ?? 'pilot',
    },
  };
}

function log(level: Level, source: string, msg: string, data?: unknown): void {
  if (!cfg || level < cfg.level) return;

  const ts = new Date().toISOString();
  const lvl = LEVEL_NAMES[level];
  const extra = data !== undefined ? ' ' + stringify(data) : '';
  const line = `[${ts}] [${lvl}] [${source}] ${msg}${extra}`;

  // Console
  const fn = level === Level.ERROR ? console.error
           : level === Level.WARN  ? console.warn
           : level === Level.DEBUG ? console.debug
           : console.log;
  fn(line);

  // File
  writeFile(line);

  // Syslog
  writeSyslog(level, source, msg + extra);
}

function stringify(data: unknown): string {
  try {
    const s = JSON.stringify(data);
    return s.length > 4096 ? s.slice(0, 4096) + '…(truncated)' : s;
  } catch {
    return String(data);
  }
}

// ─── File Transport ──────────────────────────────────────────────────────

/** Today's date as YYYY-MM-DD */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Build the log file path for a given date, with optional part suffix for mid-day rotation */
function logPath(date: string, part = 0): string {
  if (!cfg) return '';
  const suffix = part > 0 ? `-${part}` : '';
  return join(cfg.file.dir, `pilot-${date}${suffix}.log`);
}

/** Find the next available part number for a date (0, 1, 2, ...) */
function nextPart(date: string): number {
  let part = 0;
  while (existsSync(logPath(date, part + 1))) part++;
  return part;
}

function openFileStream(): void {
  if (!cfg) return;
  ensurePilotAppDirs();

  const date = today();
  currentFileDate = date;

  // If today's file already exceeds maxBytes, start a new part
  let part = 0;
  const base = logPath(date);
  if (existsSync(base)) {
    try {
      if (statSync(base).size >= cfg.file.maxBytes) {
        part = nextPart(date) + 1;
      }
    } catch { /* use base */ }
  }
  // Also check if we're already on a part file
  if (part === 0 && existsSync(base)) {
    currentFilePath = base;
  } else if (part > 0) {
    currentFilePath = logPath(date, part);
  } else {
    currentFilePath = base;
  }

  fileStream = createWriteStream(currentFilePath, { flags: 'a' });
  fileStream.on('error', () => { /* ignore write errors */ });

  // Clean up old logs on startup
  purgeOldLogs();
}

/** Delete log files older than retainDays */
function purgeOldLogs(): void {
  if (!cfg) return;
  const { dir, retainDays } = cfg.file;
  const cutoff = Date.now() - retainDays * 24 * 60 * 60 * 1000;

  try {
    for (const name of readdirSync(dir)) {
      // Match pilot-YYYY-MM-DD.log or pilot-YYYY-MM-DD-N.log
      const m = name.match(/^pilot-(\d{4}-\d{2}-\d{2})(?:-\d+)?\.log$/);
      if (!m) continue;
      const fileDate = new Date(m[1] + 'T00:00:00Z').getTime();
      if (fileDate < cutoff) {
        try { unlinkSync(join(dir, name)); } catch { /* ok */ }
      }
    }
  } catch { /* ignore readdir errors */ }
}

let bytesWritten = 0;

function writeFile(line: string): void {
  if (!fileStream || !cfg?.file.enabled) return;

  // Roll to new day file if date changed
  const date = today();
  if (date !== currentFileDate) {
    fileStream.end();
    currentFileDate = date;
    currentFilePath = logPath(date);
    fileStream = createWriteStream(currentFilePath, { flags: 'a' });
    fileStream.on('error', () => {});
    bytesWritten = 0;
    purgeOldLogs();
  }

  const buf = line + '\n';
  fileStream.write(buf);
  bytesWritten += Buffer.byteLength(buf);

  // Mid-day size rotation: if file exceeds maxBytes, start a new part
  if (bytesWritten > 1024 * 1024) {
    bytesWritten = 0;
    try {
      if (cfg && currentFilePath && existsSync(currentFilePath) &&
          statSync(currentFilePath).size >= cfg.file.maxBytes) {
        fileStream.end();
        const part = nextPart(date) + 1;
        currentFilePath = logPath(date, part);
        fileStream = createWriteStream(currentFilePath, { flags: 'a' });
        fileStream.on('error', () => {});
      }
    } catch { /* ignore rotation errors */ }
  }
}

// ─── Syslog Transport ────────────────────────────────────────────────────

function openSyslog(): void {
  udpSocket = createSocket('udp4');
  udpSocket.on('error', () => { /* ignore */ });
  // Unref so the socket doesn't keep the process alive
  udpSocket.unref();
}

function writeSyslog(level: Level, source: string, msg: string): void {
  if (!udpSocket || !cfg?.syslog.enabled) return;
  const { facility, appName, host, port } = cfg.syslog;
  const pri = facility * 8 + SYSLOG_SEVERITY[level];
  const ts = new Date().toISOString();
  // RFC 5424: <PRI>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID STRUCTURED-DATA MSG
  const packet = `<${pri}>1 ${ts} ${cachedHostname} ${appName} ${process.pid} ${source} - ${msg}`;
  const buf = Buffer.from(packet);
  udpSocket.send(buf, 0, buf.length, port, host, () => { /* fire and forget */ });
}
