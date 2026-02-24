import { WebSocket } from 'ws';

/** Default port for the companion HTTPS + WebSocket server */
export const DEFAULT_COMPANION_PORT = 18088;

/**
 * Minimal interface for the CompanionIPCBridge
 * The actual implementation will be in companion-ipc-bridge.ts
 */
export interface CompanionIPCBridge {
  attachClient(ws: WebSocket, clientId: string): void;
  detachClient(clientId: string): void;
  forwardEvent(channel: string, payload: unknown): void;
}

/**
 * Minimal interface for the CompanionAuth service
 * The actual implementation will be in companion-auth.ts
 */
export interface CompanionAuth {
  validateToken(token: string): Promise<{ sessionId: string; deviceName: string } | null>;
}

/**
 * Configuration for the CompanionServer
 */
export interface CompanionServerConfig {
  /** Port to listen on (default: DEFAULT_COMPANION_PORT) */
  port?: number;
  /** Path to the built React renderer bundle */
  reactBundlePath?: string;
  /** Protocol to use. Default: 'https' */
  protocol?: 'http' | 'https';
  /** TLS certificate buffer (required for https) */
  tlsCert?: Buffer;
  /** TLS private key buffer (required for https) */
  tlsKey?: Buffer;
  /** IPC bridge for forwarding events to WebSocket clients */
  ipcBridge: CompanionIPCBridge;
  /** Auth service for validating tokens */
  auth: CompanionAuth;
}

/**
 * WebSocket message types
 */
export interface WSAuthMessage {
  type: 'auth';
  token: string;
}

export interface WSAuthOkMessage {
  type: 'auth_ok';
}

export interface WSAuthErrorMessage {
  type: 'auth_error';
  reason: string;
}

export type WSMessage = WSAuthMessage | WSAuthOkMessage | WSAuthErrorMessage;
