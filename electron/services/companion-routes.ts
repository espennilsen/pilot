import express, { Express, Request, Response, NextFunction } from 'express';
import { join, extname, resolve, normalize } from 'path';
import { existsSync } from 'fs';
import { CompanionAuth } from './companion-server-types';

/**
 * Set up all Express routes for the CompanionServer
 */
export function setupCompanionRoutes(
  app: Express,
  config: {
    port: number;
    reactBundlePath: string;
    protocol: 'http' | 'https';
    auth: CompanionAuth;
  }
): void {
  // CORS headers - restrict to same-origin; companion clients connect via WebSocket, not CORS
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Access-Control-Allow-Origin', 'null');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (_req.method === 'OPTIONS') { res.status(204).end(); return; }
    next();
  });

  // JSON middleware for API routes
  app.use(express.json());

  // Companion mode detection endpoint
  // The renderer checks this to know it's running in companion mode
  app.get('/api/companion-mode', (_req: Request, res: Response) => {
    res.json({ companion: true });
  });

  // Companion WebSocket connection info
  // Returns the WebSocket connection details for the companion client
  app.get('/api/companion-config', (_req: Request, res: Response) => {
    res.json({
      wsPort: config.port,
      wsPath: '/',
      secure: config.protocol === 'https',
      tokenRequired: true,
    });
  });

  // Serve attachment files (images saved by the renderer)
  // Validates the path is inside a .pilot/attachments directory.
  app.get('/api/attachments', (req: Request, res: Response) => {
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
  const staticPath = config.reactBundlePath;
  app.use(express.static(staticPath));

  // Pairing endpoint — mobile app submits PIN/QR token here to get a session token
  app.post('/api/companion-pair', async (req: Request, res: Response) => {
    const { credential, deviceName } = req.body || {};
    if (!credential || !deviceName) {
      res.status(400).json({ error: 'Missing credential or deviceName' });
      return;
    }
    try {
      const token = await (config.auth as any).pair(credential, deviceName);
      if (!token) {
        res.status(401).json({ error: 'Invalid or expired credential' });
        return;
      }
      // Return token + WS URL so the client can connect
      const wsProto = config.protocol === 'https' ? 'wss' : 'ws';
      res.json({ token, wsUrl: `${wsProto}://${req.hostname}:${config.port}/` });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // SPA fallback - all other routes return index.html
  // Injects companion connection params into the HTML as a <script> tag
  // so the WebSocket IPC client can bootstrap without manual configuration.
  app.get('/{*path}', (req: Request, res: Response, next: NextFunction) => {
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
