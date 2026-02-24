import express, { Express } from 'express';
import { createServer as createHttpsServer, Server as HTTPSServer } from 'https';
import { createServer as createHttpServer, Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { join } from 'path';
import {
  DEFAULT_COMPANION_PORT,
  CompanionIPCBridge,
  CompanionAuth,
  CompanionServerConfig,
  WSAuthMessage,
  WSAuthOkMessage,
  WSAuthErrorMessage,
  WSMessage,
} from './companion-server-types';
import { setupCompanionRoutes } from './companion-routes';

/**
 * CompanionServer - HTTP + WebSocket server for Pilot Companion
 * 
 * Serves the React renderer as a web app and provides WebSocket IPC bridge
 * for remote clients to connect to the main Pilot instance.
 * 
 * Architecture:
 * - HTTPS server serves static React bundle
 * - WebSocket server handles real-time IPC communication
 * - Self-signed TLS certificate for secure connections
 * - Token-based authentication for WebSocket connections
 */
export class CompanionServer {
  private app: Express;
  private httpServer: HTTPServer | HTTPSServer | null = null;
  private wss: WebSocketServer | null = null;
  private config: {
    port: number;
    reactBundlePath: string;
    protocol: 'http' | 'https';
    tlsCert?: Buffer;
    tlsKey?: Buffer;
    ipcBridge: CompanionIPCBridge;
    auth: CompanionAuth;
  };
  private isRunning = false;
  private authenticatedClients = new Map<string, WebSocket>();
  private clientIdCounter = 0;

  constructor(config: CompanionServerConfig) {
    this.config = {
      port: config.port ?? DEFAULT_COMPANION_PORT,
      reactBundlePath: config.reactBundlePath ?? join(__dirname, '../renderer'),
      protocol: config.protocol ?? 'https',
      tlsCert: config.tlsCert,
      tlsKey: config.tlsKey,
      ipcBridge: config.ipcBridge,
      auth: config.auth,
    };

    this.app = express();
    setupCompanionRoutes(this.app, this.config);
  }

  /**
   * Start the HTTPS and WebSocket servers
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('CompanionServer is already running');
    }

    // Create HTTP or HTTPS server
    if (this.config.protocol === 'https') {
      if (!this.config.tlsCert || !this.config.tlsKey) {
        throw new Error('TLS certificate and key are required for HTTPS mode');
      }
      this.httpServer = createHttpsServer(
        { cert: this.config.tlsCert, key: this.config.tlsKey },
        this.app
      );
    } else {
      this.httpServer = createHttpServer(this.app);
    }

    // Create WebSocket server attached to the HTTP(S) server
    this.wss = new WebSocketServer({ 
      server: this.httpServer,
      maxPayload: 1 * 1024 * 1024  // 1MB limit
    });

    // Set up WebSocket connection handling
    this.wss.on('connection', (ws: WebSocket) => {
      this.handleWebSocketConnection(ws);
    });

    // Start listening on 0.0.0.0 (all interfaces)
    return new Promise((resolve, reject) => {
      try {
        this.httpServer!.listen(this.config.port, '0.0.0.0', () => {
          this.isRunning = true;
          console.log(`[CompanionServer] Started on ${this.config.protocol}://0.0.0.0:${this.config.port}`);
          resolve();
        });

        this.httpServer!.on('error', (err: Error) => {
          console.error('[CompanionServer] Server error:', err);
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Handle new WebSocket connection
   * First message MUST be auth message with valid token
   */
  private handleWebSocketConnection(ws: WebSocket): void {
    let clientId: string | null = null;
    let authenticated = false;
    let authTimeout: NodeJS.Timeout;

    // Client must authenticate within 5 seconds
    authTimeout = setTimeout(() => {
      if (!authenticated) {
        const errorMsg: WSAuthErrorMessage = {
          type: 'auth_error',
          reason: 'Authentication timeout',
        };
        ws.send(JSON.stringify(errorMsg));
        ws.close(4003, 'Authentication timeout');
      }
    }, 5000);

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as WSMessage;

        // First message must be authentication
        if (!authenticated) {
          if (message.type !== 'auth') {
            const errorMsg: WSAuthErrorMessage = {
              type: 'auth_error',
              reason: 'First message must be auth',
            };
            ws.send(JSON.stringify(errorMsg));
            ws.close(4003, 'Invalid auth sequence');
            clearTimeout(authTimeout);
            return;
          }

          const authMsg = message as WSAuthMessage;
          const authResult = await this.config.auth.validateToken(authMsg.token);

          if (!authResult) {
            const errorMsg: WSAuthErrorMessage = {
              type: 'auth_error',
              reason: 'Invalid token',
            };
            ws.send(JSON.stringify(errorMsg));
            ws.close(4003, 'Invalid token');
            clearTimeout(authTimeout);
            return;
          }

          // Authentication successful
          authenticated = true;
          clearTimeout(authTimeout);
          
          // Use session ID from auth token as client ID
          clientId = authResult.sessionId;
          this.authenticatedClients.set(clientId, ws);

          // Register with IPC bridge
          this.config.ipcBridge.attachClient(ws, clientId);

          // Send success message
          const okMsg: WSAuthOkMessage = { type: 'auth_ok' };
          ws.send(JSON.stringify(okMsg));

          console.log(`[CompanionServer] Client authenticated: ${clientId}`);
          return;
        }

        // All subsequent messages are handled by the IPC bridge
        // The bridge will forward them to the appropriate handlers

      } catch (err) {
        console.error('[CompanionServer] Error processing WebSocket message:', err);
        if (!authenticated) {
          const errorMsg: WSAuthErrorMessage = {
            type: 'auth_error',
            reason: 'Invalid message format',
          };
          ws.send(JSON.stringify(errorMsg));
          ws.close(4003, 'Invalid message format');
          clearTimeout(authTimeout);
        }
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      if (clientId && authenticated) {
        this.authenticatedClients.delete(clientId);
        this.config.ipcBridge.detachClient(clientId);
        console.log(`[CompanionServer] Client disconnected: ${clientId}`);
      }
    });

    ws.on('error', (err: Error) => {
      console.error('[CompanionServer] WebSocket error:', err);
      clearTimeout(authTimeout);
      if (clientId && authenticated) {
        this.authenticatedClients.delete(clientId);
        this.config.ipcBridge.detachClient(clientId);
      }
    });
  }

  /**
   * Broadcast an event to all connected companion clients
   * This is called by the main process to push events to remote clients
   */
  broadcast(channel: string, payload: unknown): void {
    if (!this.isRunning) {
      console.warn('[CompanionServer] Cannot broadcast - server not running');
      return;
    }

    this.config.ipcBridge.forwardEvent(channel, payload);
  }

  /**
   * Stop the server and disconnect all clients
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('[CompanionServer] Stopping...');

    // Close all WebSocket connections
    for (const [clientId, ws] of this.authenticatedClients) {
      ws.close(1000, 'Server shutting down');
      this.config.ipcBridge.detachClient(clientId);
    }
    this.authenticatedClients.clear();

    // Close WebSocket server
    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss!.close(() => {
          console.log('[CompanionServer] WebSocket server closed');
          resolve();
        });
      });
      this.wss = null;
    }

    // Close HTTP(S) server
    if (this.httpServer) {
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.close((err) => {
          if (err) {
            console.error('[CompanionServer] Error closing server:', err);
            reject(err);
          } else {
            console.log(`[CompanionServer] ${this.config.protocol.toUpperCase()} server closed`);
            resolve();
          }
        });
      });
      this.httpServer = null;
    }

    this.isRunning = false;
    console.log('[CompanionServer] Stopped');
  }

  /**
   * Check if server is running
   */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Get the configured port
   */
  get port(): number {
    return this.config.port;
  }

  /**
   * Get the number of connected clients
   */
  get connectedClients(): number {
    return this.authenticatedClients.size;
  }

  /**
   * Force-disconnect a client by session ID.
   * Called when a device's auth token is revoked to immediately terminate the session.
   */
  disconnectClient(sessionId: string): void {
    const ws = this.authenticatedClients.get(sessionId);
    if (ws) {
      ws.close(4001, 'Token revoked');
      this.authenticatedClients.delete(sessionId);
      this.config.ipcBridge.detachClient(sessionId);
      console.log(`[CompanionServer] Client force-disconnected: ${sessionId}`);
    }
  }

  /**
   * Update TLS certificates at runtime (e.g. when switching to Tailscale certs).
   * Uses Node's tls.Server.setSecureContext() to swap certs without restarting.
   */
  updateTlsCerts(cert: Buffer, key: Buffer): void {
    if (!this.httpServer || this.config.protocol !== 'https') return;
    // Node's HTTPS server extends tls.Server which has setSecureContext
    (this.httpServer as any).setSecureContext({ cert, key });
    this.config.tlsCert = cert;
    this.config.tlsKey = key;
    console.log('[CompanionServer] TLS certificates updated');
  }

  /** Get the current protocol */
  get protocol(): 'http' | 'https' {
    return this.config.protocol;
  }
}
