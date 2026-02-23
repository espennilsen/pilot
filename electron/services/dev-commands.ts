import { readFileSync, writeFileSync, existsSync, watchFile, unwatchFile, mkdirSync } from 'fs';
import { join } from 'path';
import { spawn, execSync, type ChildProcess } from 'child_process';
import { BrowserWindow } from 'electron';
import { IPC } from '../../shared/ipc';
import type { DevCommand, DevCommandState } from '../../shared/types';

function isEslintAvailable(projectPath: string): boolean {
  // Check local node_modules
  if (existsSync(join(projectPath, 'node_modules', '.bin', 'eslint'))) return true;
  // Check if globally available
  try {
    execSync('which eslint', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const DEFAULT_COMMANDS: DevCommand[] = [
  { id: 'dev-server', label: 'Start Dev Server', command: 'npm run dev', icon: 'Play', cwd: './', env: {}, persistent: true },
  { id: 'test', label: 'Run Tests', command: 'npm test', icon: 'TestTube', cwd: './', env: {}, persistent: false },
  { id: 'lint', label: 'Lint', command: 'npx eslint .', icon: 'Search', cwd: './', env: {}, persistent: false },
];

/**
 * Regex to detect localhost URLs in command output.
 * Matches common dev server output from Vite, Next.js, CRA, Angular, Nuxt, Express, etc.
 */
const LOCALHOST_URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})\/?/;

export class DevCommandsService {
  private processes = new Map<string, ChildProcess>();
  private states = new Map<string, DevCommandState>();
  private projectPath: string | null = null;
  private fileWatcherPath: string | null = null;
  private fileWatcherCallback: (() => void) | null = null;
  /** Called when a dev server URL is first detected for a command */
  onServerUrlDetected: ((commandId: string, url: string) => void) | null = null;
  /** Called when a command stops (for tunnel cleanup) */
  onCommandStopped: ((commandId: string) => void) | null = null;

  setProject(projectPath: string) {
    this.projectPath = projectPath;
    // Watch .pilot/commands.json for changes
    const configPath = join(projectPath, '.pilot', 'commands.json');
    if (this.fileWatcherPath) {
      unwatchFile(this.fileWatcherPath, this.fileWatcherCallback!);
      this.fileWatcherPath = null;
      this.fileWatcherCallback = null;
    }
    if (existsSync(configPath)) {
      this.fileWatcherCallback = () => {
        // Notify renderer of config change
        this.sendToRenderer(IPC.DEV_LOAD_CONFIG, this.loadConfig());
      };
      watchFile(configPath, { interval: 2000 }, this.fileWatcherCallback);
      this.fileWatcherPath = configPath;
    }
  }

  loadConfig(): DevCommand[] {
    let commands: DevCommand[];

    if (!this.projectPath) {
      commands = DEFAULT_COMMANDS;
    } else {
      const configPath = join(this.projectPath, '.pilot', 'commands.json');
      if (!existsSync(configPath)) {
        commands = DEFAULT_COMMANDS;
      } else {
        try {
          const raw = readFileSync(configPath, 'utf-8');
          const parsed = JSON.parse(raw);
          commands = parsed.commands ?? DEFAULT_COMMANDS;
        } catch {
          commands = DEFAULT_COMMANDS;
        }
      }
    }

    // Mark lint command as unavailable if eslint is not installed
    if (this.projectPath) {
      const hasEslint = isEslintAvailable(this.projectPath);
      commands = commands.map(cmd =>
        cmd.id === 'lint' && cmd.command.includes('eslint') && !hasEslint
          ? { ...cmd, command: 'echo "eslint is not installed. Run: npm install -D eslint"' }
          : cmd
      );
    }

    return commands;
  }

  saveConfig(commands: DevCommand[]): void {
    if (!this.projectPath) return;
    const configPath = join(this.projectPath, '.pilot', 'commands.json');
    const dir = join(this.projectPath, '.pilot');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(configPath, JSON.stringify({ commands }, null, 2));
  }

  runCommand(commandId: string): DevCommandState {
    const commands = this.loadConfig();
    const cmd = commands.find(c => c.id === commandId);
    if (!cmd || !this.projectPath) {
      throw new Error(`Command ${commandId} not found`);
    }

    // Kill existing process if running
    this.stopCommand(commandId);

    const cwd = join(this.projectPath, cmd.cwd);
    const proc = spawn(cmd.command, { shell: true, cwd, env: { ...process.env, ...cmd.env } });

    const state: DevCommandState = {
      commandId,
      status: 'running',
      pid: proc.pid ?? null,
      output: '',
      exitCode: null,
      startedAt: Date.now(),
      finishedAt: null,
      detectedUrl: null,
    };

    this.states.set(commandId, state);
    this.processes.set(commandId, proc);

    const detectUrl = (text: string) => {
      if (state.detectedUrl) return; // already found
      const match = text.match(LOCALHOST_URL_RE);
      if (match) {
        // Normalize to localhost (0.0.0.0 → localhost for browser access)
        let url = match[0];
        url = url.replace('0.0.0.0', 'localhost').replace('127.0.0.1', 'localhost');
        state.detectedUrl = url;
        this.sendToRenderer(IPC.DEV_SERVER_URL, commandId, url);
        this.onServerUrlDetected?.(commandId, url);
      }
    };

    proc.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      state.output += text;
      detectUrl(text);
      this.sendToRenderer(IPC.DEV_COMMAND_OUTPUT, commandId, text);
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      state.output += text;
      detectUrl(text);
      this.sendToRenderer(IPC.DEV_COMMAND_OUTPUT, commandId, text);
    });

    proc.on('close', (code: number | null) => {
      state.status = code === 0 ? 'passed' : 'failed';
      state.exitCode = code;
      state.finishedAt = Date.now();
      this.processes.delete(commandId);
      this.sendToRenderer(IPC.DEV_COMMAND_STATUS, commandId, { ...state });
      if (state.detectedUrl) {
        this.onCommandStopped?.(commandId);
      }
    });

    return state;
  }

  stopCommand(commandId: string): void {
    const proc = this.processes.get(commandId);
    if (proc) {
      proc.kill('SIGTERM');
      this.processes.delete(commandId);
      const state = this.states.get(commandId);
      if (state) {
        state.status = 'idle';
        state.finishedAt = Date.now();
        state.detectedUrl = null;
        this.sendToRenderer(IPC.DEV_COMMAND_STATUS, commandId, { ...state });
      }
      this.onCommandStopped?.(commandId);
    }
  }

  getState(commandId: string): DevCommandState {
    return this.states.get(commandId) ?? {
      commandId, 
      status: 'idle', 
      pid: null, 
      output: '', 
      exitCode: null, 
      startedAt: null, 
      finishedAt: null,
      detectedUrl: null,
    };
  }

  dispose(): void {
    if (this.fileWatcherPath) {
      unwatchFile(this.fileWatcherPath, this.fileWatcherCallback!);
      this.fileWatcherPath = null;
      this.fileWatcherCallback = null;
    }
    for (const proc of this.processes.values()) {
      proc.kill('SIGTERM');
    }
    this.processes.clear();
  }

  private sendToRenderer(channel: string, ...args: unknown[]): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(channel, ...args);
    }
    // Forward to companion clients
    try {
      const { companionBridge } = require('./companion-ipc-bridge');
      companionBridge.forwardEvent(channel, args.length === 1 ? args[0] : args);
    } catch {
      // Companion bridge not initialized yet
    }
  }
}
