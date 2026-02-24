import { ipcMain } from 'electron';
import { WebSocket } from 'ws';

/**
 * Global registry of IPC handlers for Companion WebSocket access.
 * Auto-populated by syncAllHandlers() after all ipcMain.handle() registrations.
 */
const companionHandlerRegistry = new Map<string, (...args: any[]) => Promise<any>>();

/**
 * Channels that should NOT be exposed to companion clients (security).
 * Desktop-only actions or sensitive operations.
 */
const COMPANION_BLOCKLIST = new Set([
  'window:minimize',
  'window:maximize',
  'window:close',
  'window:is-maximized',
  'shell:open-external',    // Desktop opens URLs in browser
  'shell:reveal-in-finder', // Desktop-only
  'shell:open-in-terminal', // Desktop-only
  'shell:open-in-editor',   // Desktop-only
  'project:open-dialog',    // Native dialog, desktop-only
]);

/**
 * Registry for fire-and-forget channels (ipcMain.on, not ipcMain.handle).
 * These don't return a result — the bridge sends an empty ack.
 */
const sendHandlerRegistry = new Map<string, (...args: any[]) => void>();

/**
 * Register a fire-and-forget handler for companion access.
 * Use for channels registered with ipcMain.on() instead of ipcMain.handle().
 */
export function registerSendHandler(
  channel: string,
  handler: (...args: any[]) => void
): void {
  sendHandlerRegistry.set(channel, handler);
}

/**
 * Auto-register all existing ipcMain.handle() handlers with the companion bridge.
 * Call this ONCE in main/index.ts AFTER all registerXxxIpc() calls.
 *
 * Uses Electron's internal handler map. The `_invokeHandlers` property is a
 * Map<string, Function> maintained by ipcMain.handle(). This is stable across
 * Electron 28–40+.
 */
export function syncAllHandlers(): void {
  const ipcMainAny = ipcMain as any;

  // Electron stores invoke handlers in _invokeHandlers (Map)
  const handlersMap: Map<string, Function> | undefined = ipcMainAny._invokeHandlers;

  if (!handlersMap || typeof handlersMap.entries !== 'function') {
    console.warn('[CompanionIPCBridge] Could not access ipcMain._invokeHandlers — falling back to empty registry');
    return;
  }

  let registered = 0;
  let blocked = 0;

  for (const [channel, handler] of handlersMap.entries()) {
    if (COMPANION_BLOCKLIST.has(channel)) {
      blocked++;
      continue;
    }

    if (!companionHandlerRegistry.has(channel)) {
      companionHandlerRegistry.set(channel, async (...args: any[]) => {
        // Handlers registered with ipcMain.handle take (event, ...args)
        // We pass a null event since companion calls don't have an Electron event
        return (handler as any)(null, ...args);
      });
      registered++;
    }
  }

  // Debug-only: useful for development, noisy in production
  console.debug(`[CompanionIPCBridge] Synced ${registered} invoke handlers, ${sendHandlerRegistry.size} send handlers (${blocked} blocked)`);
}

// WebSocket message types

interface IPCInvokeMessage {
  type: 'ipc';
  id: string;
  channel: string;
  args: any[];
}

interface IPCResponseMessage {
  type: 'ipc-response';
  id: string;
  result?: any;
  error?: string;
}

interface IPCEventMessage {
  type: 'event';
  channel: string;
  payload: any;
}

type CompanionMessage = IPCInvokeMessage | IPCResponseMessage | IPCEventMessage;

/**
 * CompanionIPCBridge routes WebSocket messages from companion apps to IPC handlers.
 * 
 * Architecture:
 * - Companion apps connect via WebSocket
 * - They send { type: 'ipc', id, channel, args } to invoke IPC handlers
 * - Bridge looks up handler in registry, executes it, sends back result
 * - Main process events are forwarded to all connected clients via forwardEvent()
 * 
 * Message flow:
 * 1. WS → { type: 'ipc', id: '123', channel: 'session:create', args: [...] }
 * 2. Bridge calls registered handler for 'session:create'
 * 3. Bridge → { type: 'ipc-response', id: '123', result: {...} }
 * 
 * Event flow (main → companion):
 * 1. Main process calls bridge.forwardEvent('agent:event', payload)
 * 2. Bridge → { type: 'event', channel: 'agent:event', payload: {...} }
 */
export class CompanionIPCBridge {
  private clients = new Map<string, WebSocket>();

  /**
   * Attach a WebSocket client to the bridge.
   * Listens for IPC invoke messages and routes them to registered handlers.
   * Automatically cleans up on disconnect.
   * 
   * @param ws - WebSocket connection from companion app
   * @param sessionId - Unique identifier for this client (e.g., pairing code)
   */
  attachClient(ws: WebSocket, sessionId: string): void {
    this.clients.set(sessionId, ws);
    
    console.log(`[CompanionIPCBridge] Client attached: ${sessionId}`);

    ws.on('message', async (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString()) as IPCInvokeMessage;
        
        if (message.type !== 'ipc') {
          // Ignore non-IPC messages (ping/pong, etc.)
          return;
        }

        const { id, channel, args } = message;
        
        // Look up handler in invoke registry first
        const handler = companionHandlerRegistry.get(channel);
        
        if (handler) {
          try {
            // Invoke handler with args (no event object)
            const result = await handler(...(args || []));
            
            const successResponse: IPCResponseMessage = {
              type: 'ipc-response',
              id,
              result,
            };
            ws.send(JSON.stringify(successResponse));
          } catch (err) {
            const errorResponse: IPCResponseMessage = {
              type: 'ipc-response',
              id,
              error: err instanceof Error ? err.message : String(err),
            };
            ws.send(JSON.stringify(errorResponse));
            console.error(`[CompanionIPCBridge] Handler error for ${channel}:`, err);
          }
          return;
        }

        // Check fire-and-forget handler registry
        const sendHandler = sendHandlerRegistry.get(channel);
        if (sendHandler) {
          try {
            sendHandler(...(args || []));
          } catch (err) {
            console.error(`[CompanionIPCBridge] Send handler error for ${channel}:`, err);
          }
          // Send ack so the client's invoke() resolves
          ws.send(JSON.stringify({ type: 'ipc-response', id, result: undefined }));
          return;
        }

        // No handler found
        const errorResponse: IPCResponseMessage = {
          type: 'ipc-response',
          id,
          error: `No handler registered for channel: ${channel}`,
        };
        ws.send(JSON.stringify(errorResponse));
        console.error(`[CompanionIPCBridge] Unknown channel: ${channel}`);
      } catch (err) {
        console.error('[CompanionIPCBridge] Error parsing message:', err);
      }
    });

    ws.on('close', () => {
      this.detachClient(sessionId);
      console.log(`[CompanionIPCBridge] Client disconnected: ${sessionId}`);
    });

    ws.on('error', (err) => {
      console.error(`[CompanionIPCBridge] WebSocket error for session ${sessionId}:`, err);
    });
  }

  /**
   * Detach a WebSocket client from the bridge.
   * Called automatically on disconnect, but can be called manually to force disconnect.
   */
  detachClient(sessionId: string): void {
    const ws = this.clients.get(sessionId);
    if (ws) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      this.clients.delete(sessionId);
    }
  }

  /**
   * Forward an IPC event to all connected WebSocket clients.
   * Equivalent to BrowserWindow.webContents.send() for companion apps.
   * 
   * Call this from the same places where you call win.webContents.send():
   * ```
   * BrowserWindow.getAllWindows().forEach(win =>
   *   win.webContents.send(IPC.AGENT_EVENT, payload)
   * );
   * companionBridge.forwardEvent(IPC.AGENT_EVENT, payload);
   * ```
   * 
   * @param channel - IPC channel name (e.g., 'agent:event')
   * @param payload - Event payload (must be JSON-serializable)
   */
  forwardEvent(channel: string, payload: unknown): void {
    const eventMessage: IPCEventMessage = {
      type: 'event',
      channel,
      payload,
    };
    
    const messageStr = JSON.stringify(eventMessage);
    
    // Send to all connected clients, clean up dead connections
    for (const [sessionId, ws] of Array.from(this.clients.entries())) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(messageStr);
        } catch (err) {
          console.error(`[CompanionIPCBridge] Error sending event to ${sessionId}:`, err);
        }
      } else {
        // Clean up closed/closing connections
        this.clients.delete(sessionId);
      }
    }
  }

  /**
   * Get the number of currently connected companion clients.
   */
  get connectedClients(): number {
    return this.clients.size;
  }

  /**
   * Get all connected session IDs.
   */
  getConnectedSessions(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Check if a specific session is connected.
   */
  isSessionConnected(sessionId: string): boolean {
    const ws = this.clients.get(sessionId);
    return ws !== undefined && ws.readyState === WebSocket.OPEN;
  }

  /**
   * Disconnect all clients and clear the registry.
   * Call this on app shutdown.
   */
  shutdown(): void {
    for (const [sessionId, ws] of this.clients.entries()) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }
    this.clients.clear();
    console.log('[CompanionIPCBridge] Shutdown complete');
  }
}

/**
 * Singleton instance of the bridge.
 * Create this once in main/index.ts and use it throughout the app.
 */
export const companionBridge = new CompanionIPCBridge();
