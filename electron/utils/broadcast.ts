import { BrowserWindow } from 'electron';

/**
 * Broadcast a message to all renderer windows and companion clients.
 * This is the single source of truth for main→renderer communication.
 */
export function broadcastToRenderer(channel: string, data: unknown): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    win.webContents.send(channel, data);
  }
  // Forward to companion clients if bridge is initialized
  try {
    const { companionBridge } = require('../services/companion-ipc-bridge');
    companionBridge.forwardEvent(channel, data);
  } catch { /* companion bridge not initialized */ }
}
