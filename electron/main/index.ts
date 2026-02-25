import { app, BrowserWindow, ipcMain, Menu, MenuItemConstructorOptions, net, protocol, shell } from 'electron';
import { join } from 'path';
import { readFileSync, readdirSync } from 'fs';
import { initLogger, getLogger, shutdownLogger } from '../services/logger';
import { PilotSessionManager } from '../services/pi-session-manager';
import { DevCommandsService } from '../services/dev-commands';
import { ExtensionManager } from '../services/extension-manager';
import { TerminalService } from '../services/terminal-service';
import { registerAgentIpc, setPromptLibraryRef } from '../ipc/agent';
import { registerModelIpc } from '../ipc/model';
import { registerSandboxIpc } from '../ipc/sandbox';
import { registerSessionIpc } from '../ipc/session';
import { registerSettingsIpc } from '../ipc/settings';
import { registerAuthIpc } from '../ipc/auth';
import { registerGitIpc } from '../ipc/git';
import { registerProjectIpc } from '../ipc/project';
import { registerDevCommandsIpc } from '../ipc/dev-commands';
import { registerExtensionsIpc } from '../ipc/extensions';
import { registerWorkspaceIpc } from '../ipc/workspace';
import { registerShellIpc } from '../ipc/shell';
import { registerTerminalIpc } from '../ipc/terminal';
import { registerMemoryIpc } from '../ipc/memory';
import { registerTasksIpc } from '../ipc/tasks';
import { registerPromptsIpc } from '../ipc/prompts';
import { registerCompanionIpc } from '../ipc/companion';
import { registerSubagentIpc } from '../ipc/subagent';
import { registerAttachmentIpc } from '../ipc/attachment';
import { PromptLibrary } from '../services/prompt-library';
import { CommandRegistry } from '../services/command-registry';
import { CompanionAuth } from '../services/companion-auth';
import { CompanionServer } from '../services/companion-server';
import { CompanionDiscovery } from '../services/companion-discovery';
import { CompanionRemote } from '../services/companion-remote';
import { companionBridge, syncAllHandlers } from '../services/companion-ipc-bridge';
import { ensureTLSCert } from '../services/companion-tls';
import { PILOT_APP_DIR } from '../services/pilot-paths';
import { loadAppSettings } from '../services/app-settings';
import { IPC } from '../../shared/ipc';

let mainWindow: BrowserWindow | null = null;
let sessionManager: PilotSessionManager | null = null;
let devService: DevCommandsService | null = null;
let extensionManager: ExtensionManager | null = null;
let terminalService: TerminalService | null = null;
let promptLibrary: PromptLibrary | null = null;
let companionAuth: CompanionAuth | null = null;
let companionServer: CompanionServer | null = null;
let companionDiscovery: CompanionDiscovery | null = null;
let companionRemote: CompanionRemote | null = null;
let developerModeEnabled = false;

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

function buildApplicationMenu() {
  const template: MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Conversation',
          accelerator: isMac ? 'Cmd+N' : 'Ctrl+N',
          click: () => mainWindow?.webContents.send('menu:new-conversation'),
        },
        { type: 'separator' as const },
        {
          label: 'Open Project…',
          accelerator: isMac ? 'Cmd+Shift+N' : 'Ctrl+Shift+N',
          click: () => mainWindow?.webContents.send('menu:open-project'),
        },
        { type: 'separator' as const },
        {
          label: 'Close Tab',
          accelerator: isMac ? 'Cmd+W' : 'Ctrl+W',
          click: () => mainWindow?.webContents.send('menu:close-tab'),
        },
        ...(isMac ? [
          {
            label: 'Close Window',
            accelerator: 'Cmd+Shift+W',
            click: () => mainWindow?.close(),
          },
        ] : [
          { type: 'separator' as const },
          {
            label: 'Exit',
            accelerator: 'Alt+F4',
            click: () => app.quit(),
          },
        ]),
      ]
    },
    { role: 'editMenu' as const },
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
      ]
    },
    // Terminal menu (only visible in developer mode)
    ...(developerModeEnabled ? [{
      label: 'Terminal',
      submenu: [
        {
          label: 'Toggle Terminal',
          accelerator: isMac ? 'Cmd+`' : 'Ctrl+`',
          click: () => mainWindow?.webContents.send('menu:toggle-terminal'),
        },
        {
          label: 'New Terminal',
          accelerator: isMac ? 'Cmd+Shift+`' : 'Ctrl+Shift+`',
          click: () => mainWindow?.webContents.send('menu:new-terminal'),
        },
      ]
    }] : []),
    { role: 'windowMenu' as const },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Keyboard Shortcuts',
          accelerator: isMac ? 'Cmd+/' : 'Ctrl+/',
          click: () => mainWindow?.webContents.send('menu:keyboard-shortcuts'),
        },
        { type: 'separator' as const },
        {
          label: 'Documentation',
          click: () => mainWindow?.webContents.send('menu:documentation'),
        },
        {
          label: 'Report Issue…',
          click: () => shell.openExternal('https://github.com/nicepkg/pilot/issues'),
        },
        { type: 'separator' as const },
        {
          label: 'About Pilot',
          click: () => mainWindow?.webContents.send('menu:about'),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  // Read persisted theme to set correct initial window chrome (avoid flash)
  const settings = loadAppSettings();
  const isLightTheme = settings.theme === 'light';
  const windowBg = isLightTheme ? '#ffffff' : '#1a1b1e';
  const windowFg = isLightTheme ? '#1a1b1e' : '#ffffff';

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const } : {}),
    ...(isWin ? {
      titleBarOverlay: {
        color: windowBg,
        symbolColor: windowFg,
        height: 36,
      },
    } : {}),
    icon: join(__dirname, '../../resources/icon.png'),
    backgroundColor: windowBg,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  // Position traffic lights on macOS
  if (isMac) {
    mainWindow.setWindowButtonPosition({ x: 12, y: 12 });
  }

  // Load the renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Show window when ready to prevent flash
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    // Open DevTools in dev mode for debugging
    if (process.env.ELECTRON_RENDERER_URL) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // Send maximize state changes to renderer
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized-changed', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized-changed', false);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Build application menu
  buildApplicationMenu();
}

// Enable native Wayland support on Linux when available
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
}

// Register custom protocol for serving local attachment files in the renderer.
// Must be called before app.whenReady().
protocol.registerSchemesAsPrivileged([
  { scheme: 'pilot-attachment', privileges: { bypassCSP: true, supportFetchAPI: true } },
  { scheme: 'pilot-html', privileges: { bypassCSP: true, supportFetchAPI: true, standard: true, secure: true } },
]);

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
  // Initialize logger first
  initLogger();
  const log = getLogger('main');
  log.info('Pilot starting', { version: app.getVersion(), platform: process.platform });

  // Handle pilot-attachment:// URLs → read local files
  protocol.handle('pilot-attachment', (request) => {
    // URL format: pilot-attachment:///absolute/path/to/file.png
    const filePath = decodeURIComponent(new URL(request.url).pathname);
    return net.fetch(`file://${filePath}`);
  });

  // Handle pilot-html:// URLs → serve local HTML and assets from project directories
  // URL format: pilot-html://localhost/<absolute-path-to-file>
  // Uses standard: true so relative asset references (CSS, JS, images) resolve correctly.
  protocol.handle('pilot-html', (request) => {
    const url = new URL(request.url);
    const filePath = decodeURIComponent(url.pathname);
    const { resolve } = require('path');
    const { existsSync } = require('fs');
    const resolved = resolve(filePath);

    if (!existsSync(resolved)) {
      return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    }

    return net.fetch(`file://${resolved}`);
  });
  // Create window first (needed by terminal service)
  createWindow();

  // Initialize services
  sessionManager = new PilotSessionManager();
  devService = new DevCommandsService();
  extensionManager = new ExtensionManager();
  terminalService = mainWindow ? new TerminalService(mainWindow) : null;
  
  // Register IPC handlers
  registerAgentIpc(sessionManager);
  registerModelIpc(sessionManager);
  registerSandboxIpc(sessionManager);
  registerSessionIpc(sessionManager);
  registerSettingsIpc(sessionManager);
  registerAuthIpc(sessionManager);
  registerGitIpc();
  registerProjectIpc();
  registerDevCommandsIpc(devService);
  registerExtensionsIpc(extensionManager);
  registerWorkspaceIpc();
  registerShellIpc();
  if (terminalService) {
    registerTerminalIpc(terminalService);
  }
  registerMemoryIpc(sessionManager.memoryManager);
  registerTasksIpc(sessionManager.taskManager);
  registerSubagentIpc(sessionManager.subagentManager);
  registerAttachmentIpc();

  // Register system commands in the CommandRegistry
  CommandRegistry.register('memory', 'Memory', 'Open memory panel');
  CommandRegistry.register('tasks', 'Tasks', 'Open task board');
  CommandRegistry.register('prompts', 'Prompt Library', 'Open prompt picker');
  CommandRegistry.register('orchestrate', 'Orchestrator', 'Enter orchestrator mode');
  CommandRegistry.register('spawn', 'Subagent', 'Quick-spawn a subagent');

  // Initialize companion system
  companionAuth = new CompanionAuth(PILOT_APP_DIR);
  companionAuth.init().catch(err => {
    console.error('Failed to initialize companion auth:', err);
  });
  companionDiscovery = new CompanionDiscovery();
  companionRemote = new CompanionRemote();

  // TLS cert generation is async but we need the server ref for IPC handlers.
  // Create a deferred init: register IPC handlers immediately, init server async.
  const companionSettings = {
    port: loadAppSettings().companionPort ?? 18088,
    protocol: (loadAppSettings().companionProtocol ?? 'https') as 'http' | 'https',
  };

  const companionReady = (async () => {
    try {
      if (companionSettings.protocol === 'https') {
        const { cert, key } = await ensureTLSCert(PILOT_APP_DIR);
        companionServer = new CompanionServer({
          port: companionSettings.port,
          protocol: 'https',
          tlsCert: cert,
          tlsKey: key,
          ipcBridge: companionBridge,
          auth: companionAuth!,
        });
      } else {
        companionServer = new CompanionServer({
          port: companionSettings.port,
          protocol: 'http',
          ipcBridge: companionBridge,
          auth: companionAuth!,
        });
      }
      log.debug(`Companion server configured (${companionSettings.protocol}:${companionSettings.port}, not yet started)`);

      // Auto-start the companion server if the user has enabled it in settings
      if (loadAppSettings().companionAutoStart && companionServer) {
        try {
          await companionServer.start();
          const computerName = await CompanionDiscovery.getComputerName();
          await companionDiscovery!.start(companionServer.port, computerName);
          console.log('[Companion] Auto-started companion server');
        } catch (autoErr) {
          console.error('[Companion] Failed to auto-start companion server:', autoErr);
        }
      }
    } catch (err) {
      console.error('Failed to initialize companion server:', err);
    }
  })();

  // Clean up dev server tunnels when commands stop
  devService.onCommandStopped = (commandId: string) => {
    companionRemote?.removeTunnelByCommand(commandId);
  };

  // Auto-tunnel dev server ports when remote access is active.
  // When a dev command outputs a localhost URL, create a tunnel for it.
  devService.onServerUrlDetected = async (commandId: string, localUrl: string) => {
    if (!companionRemote?.isActive()) return;
    try {
      const url = new URL(localUrl);
      const port = parseInt(url.port, 10);
      if (!port) return;
      const commands = devService?.loadConfig() ?? [];
      const cmd = commands.find(c => c.id === commandId);
      const label = cmd?.label ?? commandId;
      const tunnelUrl = await companionRemote.tunnelPort(port, commandId, label, localUrl);
      if (tunnelUrl) {
        // Notify renderer of the tunnel
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send(IPC.DEV_SERVER_URL, commandId, localUrl, tunnelUrl);
        }
        companionBridge.forwardEvent(IPC.DEV_SERVER_URL, [commandId, localUrl, tunnelUrl]);
      }
    } catch (err) {
      console.error('[Companion] Failed to auto-tunnel dev server:', err);
    }
  };

  // When Tailscale remote is enabled, swap server TLS certs to Tailscale-issued ones.
  // Store originals so we can restore when Tailscale is disconnected.
  let originalTlsCert: Buffer | null = null;
  let originalTlsKey: Buffer | null = null;

  companionRemote.onTlsCertChanged = (cert: Buffer, key: Buffer) => {
    if (companionServer) {
      // Save originals on first swap
      if (!originalTlsCert) {
        originalTlsCert = companionServer['config'].tlsCert;
        originalTlsKey = companionServer['config'].tlsKey;
      }
      companionServer.updateTlsCerts(cert, key);
    }
  };

  // Restore self-signed certs when remote is disabled
  const origDispose = companionRemote.dispose.bind(companionRemote);
  companionRemote.dispose = () => {
    origDispose();
    if (originalTlsCert && originalTlsKey && companionServer) {
      companionServer.updateTlsCerts(originalTlsCert, originalTlsKey);
      originalTlsCert = null;
      originalTlsKey = null;
      console.log('[Companion] Restored self-signed TLS certs');
    }
  };

  // Register companion IPC handlers with lazy server access.
  // getServer() returns null until TLS cert generation completes.
  registerCompanionIpc({
    auth: companionAuth!,
    getServer: () => companionServer,
    discovery: companionDiscovery!,
    remote: companionRemote!,
  });

  // Initialize prompt library (await so prompts are available before first slash command query)
  promptLibrary = new PromptLibrary();
  try {
    await promptLibrary.init();
  } catch (err) {
    console.error('Failed to initialize prompt library:', err);
  }
  registerPromptsIpc(promptLibrary);
  setPromptLibraryRef(promptLibrary);

  // Window control IPC handlers
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
  });
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.handle('window:close', () => {
    mainWindow?.close();
  });
  ipcMain.handle('window:is-maximized', () => {
    return mainWindow?.isMaximized() ?? false;
  });

  ipcMain.handle('shell:open-external', (_event, url: string) => {
    return shell.openExternal(url);
  });

  // Docs IPC — read user documentation markdown files
  const docsDir = join(app.getAppPath(), 'docs', 'user');

  ipcMain.handle(IPC.DOCS_READ, (_event, page: string) => {
    try {
      const safePage = page.replace(/[^a-zA-Z0-9_-]/g, '');
      const filePath = join(docsDir, `${safePage}.md`);
      return readFileSync(filePath, 'utf-8');
    } catch {
      /* Expected: documentation file may not exist */
      return null;
    }
  });

  ipcMain.handle(IPC.DOCS_LIST, () => {
    try {
      return readdirSync(docsDir)
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace(/\.md$/, ''));
    } catch {
      /* Expected: docs directory may not exist or be unreadable */
      return [];
    }
  });

  // Sync all IPC handlers to the companion bridge registry.
  // This must happen AFTER all ipcMain.handle() registrations above.
  syncAllHandlers();

  // Terminal menu visibility (driven by developer mode in renderer)
  ipcMain.on(IPC.TERMINAL_SET_MENU_VISIBLE, (event, visible: boolean) => {
    developerModeEnabled = visible;
    buildApplicationMenu();
  });

  // Theme changed — update window chrome (background, titlebar overlay)
  ipcMain.on(IPC.APP_THEME_CHANGED, (_event, resolved: string) => {
    const bg = resolved === 'light' ? '#ffffff' : '#1a1b1e';
    const fg = resolved === 'light' ? '#1a1b1e' : '#ffffff';
    if (mainWindow) {
      mainWindow.setBackgroundColor(bg);
      if (isWin) {
        mainWindow.setTitleBarOverlay({ color: bg, symbolColor: fg });
      }
    }
  });

  // Set dock icon on macOS (BrowserWindow icon only applies to Windows/Linux)
  if (isMac && app.dock) {
    app.dock.setIcon(join(__dirname, '../../resources/icon.png'));
  }

  app.on('activate', () => {
    // On macOS it's common to re-create a window when the dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Cleanup on quit
app.on('will-quit', () => {
  sessionManager?.disposeAll();
  devService?.dispose();
  terminalService?.disposeAll();
  promptLibrary?.dispose();
  companionServer?.stop();
  companionDiscovery?.stop();
  companionRemote?.dispose();
  companionBridge.shutdown();
  shutdownLogger();
});
