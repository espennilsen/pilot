/// <reference types="vite/client" />

declare module '*.png' {
  const src: string;
  export default src;
}

declare const __APP_VERSION__: string;
declare const __GIT_SHA__: string;

interface Window {
  /** IPC bridge. Always present in Electron. In companion mode, polyfilled by ipc-client.ts */
  api: {
    ping: () => string;
    platform: string;
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    on: (channel: string, listener: (...args: unknown[]) => void) => () => void;
    send: (channel: string, ...args: unknown[]) => void;
    windowMinimize: () => Promise<void>;
    windowMaximize: () => Promise<void>;
    windowClose: () => Promise<void>;
    windowIsMaximized: () => Promise<boolean>;
    onWindowMaximizedChanged: (callback: (isMaximized: boolean) => void) => () => void;
    openExternal: (url: string) => Promise<void>;
    /** Get native file path from a File object (sandboxed renderers can't use File.path) */
    getFilePath: (file: File) => string;
  };
  electronVersions?: {
    electron: string;
    chrome: string;
    node: string;
  };
}
