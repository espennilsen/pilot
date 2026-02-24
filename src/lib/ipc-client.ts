import { IPC } from '../../shared/ipc';

/** Delay before attempting WebSocket reconnection after disconnect */
const WS_RECONNECT_DELAY_MS = 2000;
/** Maximum time to wait for an IPC invoke response before timing out */
const WS_INVOKE_TIMEOUT_MS = 30_000;

// ─── Universal IPC Transport ───────────────────────────────────────────────
// Provides the same API whether running in Electron (preload bridge) or
// in a browser / WKWebView via companion WebSocket.

/** Set once during init — survives window.api being polyfilled */
let _companionMode = false;

/**
 * Detect whether we're running in companion (browser) mode.
 * In Electron, the preload script exposes `window.api` before any JS runs.
 * In companion mode (browser / WKWebView), `window.api` doesn't exist at load time.
 */
export function isCompanionMode(): boolean {
  return _companionMode;
}

/** Whether the companion WebSocket client has a valid auth token */
export function isCompanionConnected(): boolean {
  return _companionMode && companionClient !== null;
}

// ─── WebSocket IPC Client ──────────────────────────────────────────────────

interface PendingInvoke {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * WebSocketIPCClient provides window.api-compatible invoke/on/send methods
 * over a WebSocket connection to the Pilot Companion server.
 */
class WebSocketIPCClient {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private authToken: string;
  private pending = new Map<string, PendingInvoke>();
  private listeners = new Map<string, Set<(...args: any[]) => void>>();
  private authenticated = false;
  private authPromise: Promise<void> | null = null;
  private authResolve: (() => void) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(wsUrl: string, authToken: string) {
    this.wsUrl = wsUrl;
    this.authToken = authToken;
    this.connect();
  }

  private connect(): void {
    if (this.disposed) return;

    this.authenticated = false;
    this.authPromise = new Promise<void>((resolve) => {
      this.authResolve = resolve;
    });

    try {
      this.ws = new WebSocket(this.wsUrl);
    } catch { /* Expected: WebSocket connection may fail during reconnect */
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      // Send auth message immediately on connect
      this.ws!.send(JSON.stringify({ type: 'auth', token: this.authToken }));
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        this.handleMessage(msg);
      } catch { /* Expected: malformed WebSocket message */
        // ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.authenticated = false;
      // Reject all pending invocations
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error('WebSocket disconnected'));
      }
      this.pending.clear();
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  private handleMessage(msg: any): void {
    switch (msg.type) {
      case 'auth_ok':
        this.authenticated = true;
        // Ensure token is persisted for future sessions (covers migration
        // from sessionStorage and any edge cases where localStorage was cleared).
        try { localStorage.setItem('companion-auth-token', this.authToken); } catch { /* quota */ }
        this.authResolve?.();
        break;

      case 'auth_error':
        console.error('[CompanionIPC] Auth failed:', msg.reason);
        if (msg.reason === 'Invalid token') {
          // Token was revoked server-side — clear stored credential and stop
          // reconnecting. User will see the pairing screen on next load.
          localStorage.removeItem('companion-auth-token');
          sessionStorage.removeItem('companion-auth-token');
          this.disposed = true;
        }
        // For transient errors (timeout, malformed message), don't clear the
        // token — the reconnect loop will retry with the same credential.
        this.authResolve?.(); // unblock but leave authenticated=false
        break;

      case 'ipc-response': {
        const pending = this.pending.get(msg.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(msg.id);
          if (msg.error) {
            pending.reject(new Error(msg.error));
          } else {
            pending.resolve(msg.result);
          }
        }
        break;
      }

      case 'event': {
        const callbacks = this.listeners.get(msg.channel);
        if (callbacks) {
          for (const cb of callbacks) {
            try {
              cb(msg.payload);
            } catch (e) {
              console.error('[CompanionIPC] Event listener error:', e);
            }
          }
        }
        break;
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, WS_RECONNECT_DELAY_MS);
  }

  private generateId(): string {
    return crypto.randomUUID();
  }

  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    // Wait for authentication to complete
    if (!this.authenticated && this.authPromise) {
      await this.authPromise;
    }
    if (!this.authenticated) {
      throw new Error('Not authenticated to companion server');
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const id = this.generateId();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`IPC invoke timeout: ${channel}`));
      }, WS_INVOKE_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });

      this.ws!.send(JSON.stringify({
        type: 'ipc',
        id,
        channel,
        args,
      }));
    });
  }

  on(channel: string, listener: (...args: any[]) => void): () => void {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
    }
    this.listeners.get(channel)!.add(listener);

    // Return unsubscribe function
    return () => {
      const set = this.listeners.get(channel);
      if (set) {
        set.delete(listener);
        if (set.size === 0) this.listeners.delete(channel);
      }
    };
  }

  send(channel: string, ...args: unknown[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const id = this.generateId();
    this.ws.send(JSON.stringify({
      type: 'ipc',
      id,
      channel,
      args,
    }));
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('Client disposed'));
    }
    this.pending.clear();
    this.listeners.clear();
    this.ws?.close();
    this.ws = null;
  }
}

// ─── Companion Mode Polyfill ───────────────────────────────────────────────

let companionClient: WebSocketIPCClient | null = null;

/**
 * Initialize the companion mode polyfill.
 * Call this BEFORE the React app mounts if running in companion mode.
 * It creates a window.api-compatible shim backed by WebSocket.
 *
 * Always creates window.api in companion mode (even without auth token)
 * so that all React components can render. IPC calls will fail gracefully
 * until the user pairs and a valid token is stored.
 */
export function initCompanionPolyfill(): void {
  // On first call, detect companion mode before window.api gets polyfilled.
  // On subsequent calls (after pairing), _companionMode is already true.
  if (!_companionMode) {
    _companionMode = typeof window !== 'undefined' && !window.api;
  }
  if (!_companionMode) return;

  // Derive WebSocket URL from current page location (same host:port, wss)
  const wsUrl = localStorage.getItem('companion-ws-url')
    || sessionStorage.getItem('companion-ws-url')
    || `wss://${location.hostname}:${location.port}/`;
  // Check localStorage first (persistent), fall back to sessionStorage (legacy/migration).
  // If found only in sessionStorage, migrate to localStorage so it survives tab close.
  let authToken = localStorage.getItem('companion-auth-token');
  if (!authToken) {
    authToken = sessionStorage.getItem('companion-auth-token');
    if (authToken) {
      localStorage.setItem('companion-auth-token', authToken);
    }
  }

  // Connect WebSocket if we have a non-empty auth token
  if (authToken) {
    companionClient = new WebSocketIPCClient(wsUrl, authToken);
  } else {
    console.warn('[CompanionIPC] No auth token — showing pairing screen');
  }

  const notConnected = () => Promise.reject(new Error('Not connected — pair this device first'));

  // Polyfill window.api so all existing code works unchanged.
  // If no WS client, invoke/send reject gracefully instead of crashing.
  (window as any).api = {
    platform: detectPlatform(),
    invoke: companionClient
      ? (channel: string, ...args: unknown[]) => companionClient!.invoke(channel, ...args)
      : (_channel: string, ..._args: unknown[]) => notConnected(),
    on: companionClient
      ? (channel: string, listener: (...args: any[]) => void) => companionClient!.on(channel, listener)
      : (_channel: string, _listener: (...args: any[]) => void) => () => {},
    send: companionClient
      ? (channel: string, ...args: unknown[]) => companionClient!.send(channel, ...args)
      : () => {},
    // Window controls are no-ops in companion mode
    windowMinimize: async () => {},
    windowMaximize: async () => {},
    windowClose: async () => {},
    windowIsMaximized: async () => false,
    onWindowMaximizedChanged: () => () => {},
    openExternal: async (url: string) => { window.open(url, '_blank'); },
  };
}

function detectPlatform(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Mac/.test(ua)) return 'darwin';
  if (/Win/.test(ua)) return 'win32';
  // Default to linux for non-Mac/Win platforms (BSD, ChromeOS, etc.)
  // This is the closest match for path handling and shell behavior
  return 'linux';
}

// ─── Canonical IPC entry points ────────────────────────────────────────────
// All renderer code should use these instead of window.api directly.
// They route through window.api, which is either the Electron preload bridge
// or the companion WebSocket polyfill — so they work in both modes.

/**
 * Request/response IPC call. Equivalent to ipcRenderer.invoke().
 * Use IPC constants from shared/ipc.ts for channel names.
 */
export function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  return window.api.invoke(channel, ...args);
}

/**
 * Listen for events from the main process.
 * Returns an unsubscribe function.
 */
export function on(channel: string, listener: (...args: unknown[]) => void): () => void {
  return window.api.on(channel, listener);
}

/**
 * Fire-and-forget IPC send. Equivalent to ipcRenderer.send().
 */
export function send(channel: string, ...args: unknown[]): void {
  window.api.send(channel, ...args);
}
