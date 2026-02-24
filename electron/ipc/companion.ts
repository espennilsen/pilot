import { ipcMain, BrowserWindow, shell } from 'electron';
import { execSync } from 'child_process';
import { IPC } from '../../shared/ipc';
import type { CompanionAuth } from '../services/companion-auth';
import type { CompanionServer } from '../services/companion-server';
import { CompanionDiscovery } from '../services/companion-discovery';
import type { CompanionRemote } from '../services/companion-remote';
import { setActivationCallback, setTunnelOutputCallback } from '../services/companion-remote';
import { regenerateTLSCert } from '../services/companion-tls';
import { PILOT_APP_DIR } from '../services/pilot-paths';
import { loadAppSettings, saveAppSettings } from '../services/app-settings';

interface CompanionDeps {
  auth: CompanionAuth;
  /** Getter — may return null before TLS cert is ready */
  getServer: () => CompanionServer | null;
  discovery: CompanionDiscovery;
  remote: CompanionRemote;
}

/** Return all non-internal IPv4 addresses with their interface names. */
function getAllLanAddresses(): Array<{ address: string; name: string }> {
  const results: Array<{ address: string; name: string }> = [];
  try {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const iface of nets[name] ?? []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          results.push({ address: iface.address, name });
        }
      }
    }
  } catch { /* ignore */ }
  return results;
}

/** Return the first non-internal IPv4 address, or null. */
function getLanAddress(): string | null {
  const all = getAllLanAddresses();
  return all.length > 0 ? all[0].address : null;
}

function requireServer(deps: CompanionDeps): CompanionServer {
  const server = deps.getServer();
  if (!server) {
    throw new Error('Companion server is still initializing (generating TLS certificate). Try again in a moment.');
  }
  return server;
}

export function registerCompanionIpc(deps: CompanionDeps) {
  const { auth, discovery, remote } = deps;

  // Forward tunnel process output to all renderer windows in real-time.
  // This is always active so output is captured regardless of UI state.
  setTunnelOutputCallback((provider, text) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.COMPANION_TUNNEL_OUTPUT, provider, text);
    }
  });

  /**
   * Get current companion server status
   */
  ipcMain.handle(IPC.COMPANION_GET_STATUS, async () => {
    const server = deps.getServer();
    const remoteInfo = remote.getInfo();
    const appSettings = loadAppSettings();

    const allAddresses = getAllLanAddresses();
    const lanAddress = allAddresses.length > 0 ? allAddresses[0].address : null;

    return {
      enabled: server?.running ?? false,
      port: appSettings.companionPort ?? server?.port ?? 18088,
      // Report the saved setting, not the running server's protocol.
      // This prevents the status poll from reverting a pending protocol change.
      protocol: appSettings.companionProtocol ?? server?.protocol ?? 'https',
      running: server?.running ?? false,
      connectedClients: server?.connectedClients ?? 0,
      ready: server !== null,
      remoteUrl: remoteInfo.url,
      remoteType: remoteInfo.type,
      lanAddress,
      lanAddresses: allAddresses,
      autoStart: appSettings.companionAutoStart ?? false,
    };
  });

  /**
   * Enable and start the companion server
   */
  ipcMain.handle(IPC.COMPANION_ENABLE, async () => {
    const server = requireServer(deps);
    if (server.running) {
      throw new Error('Companion server is already running');
    }
    await server.start();
    // Start mDNS discovery
    const computerName = await CompanionDiscovery.getComputerName();
    await discovery.start(server.port, computerName);
    return {
      enabled: true,
      port: server.port,
      running: server.running,
    };
  });

  /**
   * Disable and stop the companion server
   */
  ipcMain.handle(IPC.COMPANION_DISABLE, async () => {
    const server = deps.getServer();
    if (!server?.running) {
      return { enabled: false, running: false };
    }
    // Stop mDNS discovery first
    await discovery.stop();
    // Disable remote access if active
    if (remote.isActive()) {
      remote.dispose();
    }
    // Stop the server
    await server.stop();
    return {
      enabled: false,
      running: false,
    };
  });

  /**
   * Toggle whether the companion server auto-starts on app launch
   */
  ipcMain.handle(IPC.COMPANION_SET_AUTO_START, async (_event, autoStart: boolean) => {
    saveAppSettings({ companionAutoStart: autoStart });
    return { autoStart };
  });

  /**
   * Generate a 6-digit pairing PIN for manual pairing
   */
  ipcMain.handle(IPC.COMPANION_GENERATE_PIN, async () => {
    const pin = auth.generatePIN();
    return { pin };
  });

  /**
   * Generate QR code payload for mobile pairing.
   * Returns { payload, dataUrl } — the raw JSON payload plus a PNG data URL for display.
   * If host is omitted, uses the LAN address automatically.
   */
  ipcMain.handle(IPC.COMPANION_GENERATE_QR, async (_event, host?: string, port?: number) => {
    const server = requireServer(deps);
    if (!server.running) {
      throw new Error('Companion server must be running to generate QR code');
    }

    // Auto-detect LAN IP if host not provided
    const resolvedHost = host || getLanAddress() || 'localhost';
    // Use provided port for explicit overrides, server port for LAN IPs.
    // When port is undefined (e.g. Tailscale funnel on 443), omit it from the payload.
    const resolvedPort = port !== undefined ? port : (host ? undefined : server.port);

    const qrPayload = auth.generateQRPayload(resolvedHost, resolvedPort);

    // Generate QR code as data URL
    let dataUrl: string | null = null;
    try {
      const QRCode = require('qrcode');
      dataUrl = await QRCode.toDataURL(JSON.stringify(qrPayload), {
        width: 256,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
    } catch (err) {
      console.error('[Companion] Failed to generate QR code image:', err);
    }

    return { payload: qrPayload, dataUrl };
  });

  /**
   * Pair a device using PIN or QR token
   */
  ipcMain.handle(IPC.COMPANION_PAIR, async (_event, credential: string, deviceName: string) => {
    const token = await auth.pair(credential, deviceName);
    if (!token) {
      throw new Error('Pairing failed. PIN may be expired or incorrect.');
    }
    return { token };
  });

  /**
   * Get list of all paired devices
   */
  ipcMain.handle(IPC.COMPANION_GET_DEVICES, async () => {
    const devices = auth.getDevices();
    return devices;
  });

  /**
   * Revoke access for a specific device
   */
  ipcMain.handle(IPC.COMPANION_REVOKE_DEVICE, async (_event, sessionId: string) => {
    await auth.revokeDevice(sessionId);
    return { success: true };
  });

  /**
   * Enable remote access tunnel (Tailscale or Cloudflare)
   */
  ipcMain.handle(IPC.COMPANION_ENABLE_REMOTE, async (_event, preferTailscale = true) => {
    const server = requireServer(deps);
    if (!server.running) {
      throw new Error('Companion server must be running to enable remote access');
    }

    // Push funnel activation URLs to the renderer in real-time
    // so the user sees a clickable link while tailscale serve blocks.
    setActivationCallback((activationUrl: string) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(IPC.COMPANION_REMOTE_ACTIVATION, { activationUrl });
      }
    });

    try {
      const remoteUrl = await remote.setup(server.port, preferTailscale);
      if (!remoteUrl) {
        throw new Error('Failed to set up remote access. Ensure Tailscale or Cloudflare is installed.');
      }

      const remoteInfo = remote.getInfo();
      return {
        url: remoteInfo.url,
        type: remoteInfo.type,
        active: remoteInfo.active,
      };
    } finally {
      setActivationCallback(null);
    }
  });

  /**
   * Disable remote access tunnel
   */
  ipcMain.handle(IPC.COMPANION_DISABLE_REMOTE, async () => {
    if (!remote.isActive()) {
      return { active: false };
    }
    
    remote.dispose();
    return {
      active: false,
      url: null,
      type: null,
    };
  });

  /**
   * Get all active tunnels (companion + dev server ports)
   */
  ipcMain.handle(IPC.COMPANION_GET_TUNNELS, async () => {
    const remoteInfo = remote.getInfo();
    const portTunnels = remote.getPortTunnels().map(t => ({
      commandId: t.commandId,
      label: t.label,
      localUrl: t.localUrl,
      tunnelUrl: t.tunnelUrl,
      tunnelType: t.tunnelType,
    }));
    return {
      companion: remoteInfo.url ? {
        url: remoteInfo.url,
        type: remoteInfo.type,
      } : null,
      devServers: portTunnels,
    };
  });

  /**
   * Check which remote providers are available
   */
  ipcMain.handle(IPC.COMPANION_CHECK_REMOTE, async () => {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    let tailscale = false;
    let tailscaleOnline = false;
    let cloudflared = false;
    try { execSync(`${whichCmd} tailscale`, { stdio: 'ignore' }); tailscale = true; } catch { /* Expected: tool not installed */ }
    try { execSync(`${whichCmd} cloudflared`, { stdio: 'ignore' }); cloudflared = true; } catch { /* Expected: tool not installed */ }
    if (tailscale) {
      try {
        const out = execSync('tailscale status --json', { encoding: 'utf-8' });
        const status = JSON.parse(out);
        tailscaleOnline = !!status.Self?.Online;
      } catch { /* Expected: tailscale not running or not authenticated */ }
    }
    return { tailscale, tailscaleOnline, cloudflared };
  });

  /**
   * Open a tunnel URL in the default browser (or specified browser)
   */
  ipcMain.handle(IPC.COMPANION_OPEN_TUNNEL, async (_event, url: string) => {
    // Only allow http/https URLs to prevent protocol injection (file:, javascript:, etc.)
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { opened: false, error: 'Only http and https URLs are allowed' };
      }
    } catch {
      /* Expected: URL parsing may fail for malformed input */
      return { opened: false, error: 'Invalid URL' };
    }
    await shell.openExternal(url);
    return { opened: true };
  });

  /**
   * Regenerate TLS certificate (includes all current LAN IPs).
   * Hot-swaps the cert on the running server if possible.
   */
  ipcMain.handle(IPC.COMPANION_REGEN_CERT, async () => {
    const { cert, key } = await regenerateTLSCert(PILOT_APP_DIR);
    const server = deps.getServer();
    if (server?.running && server.protocol === 'https') {
      server.updateTlsCerts(cert, key);
    }
    return { success: true };
  });
}
