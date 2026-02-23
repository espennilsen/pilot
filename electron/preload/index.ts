import { contextBridge, ipcRenderer, shell } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  // Platform detection
  platform: process.platform,

  // IPC helpers
  invoke: (channel: string, ...args: unknown[]) => {
    return ipcRenderer.invoke(channel, ...args);
  },

  on: (channel: string, listener: (...args: unknown[]) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => {
      listener(...args);
    };
    ipcRenderer.on(channel, subscription);

    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },

  send: (channel: string, ...args: unknown[]) => {
    ipcRenderer.send(channel, ...args);
  },

  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowIsMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onWindowMaximizedChanged: (callback: (isMaximized: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, isMaximized: boolean) => callback(isMaximized);
    ipcRenderer.on('window:maximized-changed', handler);
    return () => ipcRenderer.removeListener('window:maximized-changed', handler);
  },

  // Open URL in default browser
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
});

// Expose version info for About dialog
contextBridge.exposeInMainWorld('electronVersions', {
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
});
