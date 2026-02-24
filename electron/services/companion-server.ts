import express, { Express, Request, Response, NextFunction } from 'express';
import { createServer as createHttpsServer, Server as HTTPSServer } from 'https';
import { createServer as createHttpServer, Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { join, extname, resolve, normalize } from 'path';
import { existsSync } from 'fs';

/** Default port for the companion HTTPS + WebSocket server */
export const DEFAULT_COMPANION_PORT = 18088;

/**
 * Minimal interface for the CompanionIPCBridge
 * The actual implementation will be in companion-ipc-bridge.ts
 */
interface CompanionIPCBridge {
  attachClient(ws: WebSocket, clientId: string): void;
  detachClient(clientId: string): void;
  forwardEvent(channel: string, payload: unknown): void;
}

/**
 * Minimal interface for the CompanionAuth service
 * The actual implementation will be in companion-auth.ts
 */
interface CompanionAuth {
  validateToken(token: string): Promise<{ sessionId: string; deviceName: string } | null>;
}

/**
 * Configuration for the CompanionServer
 */
interface CompanionServerConfig {
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
interface WSAuthMessage {
  type: 'auth';
  token: string;
}

interface WSAuthOkMessage {
  type: 'auth_ok';
}

interface WSAuthErrorMessage {
  type: 'auth_error';
  reason: string;
}

type WSMessage = WSAuthMessage | WSAuthOkMessage | WSAuthErrorMessage;

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
    this.setupRoutes();
  }

  /**
   * Set up Express routes
   */
  private setupRoutes(): void {
    // CORS headers - restrict to same-origin; companion clients connect via WebSocket, not CORS
    this.app.use((_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('Access-Control-Allow-Origin', 'null');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (_req.method === 'OPTIONS') { res.status(204).end(); return; }
      next();
    });

    // JSON middleware for API routes
    this.app.use(express.json());

    // Companion mode detection endpoint
    // The renderer checks this to know it's running in companion mode
    this.app.get('/api/companion-mode', (_req: Request, res: Response) => {
      res.json({ companion: true });
    });

    // Companion WebSocket connection info
    // Returns the WebSocket connection details for the companion client
    this.app.get('/api/companion-config', (_req: Request, res: Response) => {
      res.json({
        wsPort: this.config.port,
        wsPath: '/',
        secure: this.config.protocol === 'https',
        tokenRequired: true,
      });
    });

    // Serve attachment files (images saved by the renderer)
    // Validates the path is inside a .pilot/attachments directory.
    this.app.get('/api/attachments', (req: Request, res: Response) => {
      const filePath = req.query.path as string | undefined;
      if (!filePath) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      // Canonicalize and normalize the path
      const normalizedPath = normalize(resolve(filePath));

      // Reject paths containing .. segments after normalization
      if (normalizedPath.includes('..')) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      // Verify path contains /.pilot/attachments/ as a real directory component
      const attachmentsPattern = /[\/\\]\.pilot[\/\\]attachments[\/\\]/;
      if (!attachmentsPattern.test(normalizedPath)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      // Only allow image extensions
      const ext = extname(normalizedPath).toLowerCase();
      const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
      if (!allowedExtensions.includes(ext)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      // Verify file exists
      if (!existsSync(normalizedPath)) {
        res.status(404).json({ error: 'Not found' });
        return;
      }

      // Serve the file with proper content type
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
      };
      res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
      res.sendFile(normalizedPath);
    });

    // Serve static files from the React bundle directory
    const staticPath = this.config.reactBundlePath;
    this.app.use(express.static(staticPath));

    // Pairing endpoint — mobile app submits PIN/QR token here to get a session token
    this.app.post('/api/companion-pair', async (req: Request, res: Response) => {
      const { credential, deviceName } = req.body || {};
      if (!credential || !deviceName) {
        res.status(400).json({ error: 'Missing credential or deviceName' });
        return;
      }
      try {
        const token = await (this.config.auth as any).pair(credential, deviceName);
        if (!token) {
          res.status(401).json({ error: 'Invalid or expired credential' });
          return;
        }
        // Return token + WS URL so the client can connect
        const wsProto = this.config.protocol === 'https' ? 'wss' : 'ws';
        res.json({ token, wsUrl: `${wsProto}://${req.hostname}:${this.config.port}/` });
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });

    // SPA fallback - all other routes return index.html
    // Injects companion connection params into the HTML as a <script> tag
    // so the WebSocket IPC client can bootstrap without manual configuration.
    this.app.get('/{*path}', (req: Request, res: Response, next: NextFunction) => {
      // Skip API routes
      if (req.path.startsWith('/api/')) {
        return next();
      }

      const indexPath = join(staticPath, 'index.html');
      
      if (!existsSync(indexPath)) {
        res.status(404).send('Renderer bundle not found. Build the app first.');
        return;
      }

      // Serve the HTML as-is. The renderer's initCompanionPolyfill() detects
      // companion mode (no window.api from preload) and derives the WS URL
      // from location.hostname:port. No inline script injection needed.
      res.sendFile(indexPath);
    });
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
