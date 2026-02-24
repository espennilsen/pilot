import { ChildProcess } from 'child_process';
import { readFileSync } from 'fs';
import { getLogger } from './logger';
import { setupTailscaleProxy, TailscaleResult } from './companion-tailscale';
import { setupCloudflareTunnel, CloudflareTunnelInfo } from './companion-cloudflare';

const log = getLogger('CompanionRemote');

// Callback to push activation URLs to the renderer while tailscale funnel blocks.
// Set by the IPC layer before calling setup().
let _onActivationUrl: ((url: string) => void) | null = null;

export function setActivationCallback(cb: ((url: string) => void) | null): void {
  _onActivationUrl = cb;
}

// Callback to stream tunnel process output to the renderer.
// Set by the IPC layer during setup.
let _onTunnelOutput: ((provider: 'tailscale' | 'cloudflare', text: string) => void) | null = null;

export function setTunnelOutputCallback(cb: ((provider: 'tailscale' | 'cloudflare', text: string) => void) | null): void {
  _onTunnelOutput = cb;
}

/**
 * Manages remote access state for Pilot Companion.
 * Handles both Tailscale and Cloudflare tunnel options.
 */
/** Tracked dev server tunnel */
interface PortTunnel {
  port: number;
  commandId: string;
  label: string;
  localUrl: string;
  tunnelUrl: string;
  tunnelType: 'tailscale' | 'cloudflare';
  cfTunnel?: CloudflareTunnelInfo;
}

export class CompanionRemote {
  private tailscaleUrl: string | null = null;
  private tailscaleDnsName: string | null = null;
  private tailscaleServeProcess: ChildProcess | null = null;
  private cloudflareTunnel: CloudflareTunnelInfo | null = null;
  private port: number | null = null;
  private preferTailscale = true;

  /** Active tunnels for dev server ports */
  private portTunnels = new Map<number, PortTunnel>();

  /** Callback to update TLS certs on the HTTPS server (for Tailscale) */
  onTlsCertChanged: ((cert: Buffer, key: Buffer) => void) | null = null;

  /**
   * Set up remote access for the companion server.
   * No automatic fallback — throws on failure so the UI can show the error.
   */
  async setup(port: number, preferTailscale = true): Promise<string | null> {
    this.port = port;
    this.preferTailscale = preferTailscale;

    if (preferTailscale) {
      const result = await setupTailscaleProxy(port, {
        onActivationUrl: _onActivationUrl || undefined,
        onTunnelOutput: _onTunnelOutput || undefined,
      });
      if (!result) throw new Error('Tailscale setup returned null');
      this.tailscaleUrl = result.url;
      this.tailscaleDnsName = result.dnsName;
      this.tailscaleServeProcess = result.funnelProcess;

      // Swap the server's TLS certs to the Tailscale-issued ones
      // so browsers trust the connection without certificate warnings.
      // If Tailscale certs aren't available (plan doesn't support it),
      // keep using the self-signed cert — the connection still works,
      // just with a browser warning.
      if (result.certPath && result.keyPath) {
        try {
          const cert = readFileSync(result.certPath);
          const key = readFileSync(result.keyPath);
          this.onTlsCertChanged?.(cert, key);
          console.log('[CompanionRemote] Server TLS certs updated to Tailscale certs');
        } catch (err) {
          console.error('[CompanionRemote] Failed to load Tailscale certs:', err);
        }
      } else {
        console.log('[CompanionRemote] Using self-signed cert (Tailscale certs not available on this plan)');
      }

      return this.tailscaleUrl;
    } else {
      this.cloudflareTunnel = await setupCloudflareTunnel(port, _onTunnelOutput || undefined);
      if (!this.cloudflareTunnel) {
        throw new Error('Cloudflare tunnel failed to start. Is cloudflared installed?');
      }
      return this.cloudflareTunnel.url;
    }
  }

  /**
   * Create a tunnel for a dev server port.
   * For Tailscale: just constructs the URL (all ports are accessible on the tailnet).
   * For Cloudflare: spawns a separate cloudflared process.
   *
   * @returns The tunnel URL or null if tunneling failed
   */
  async tunnelPort(port: number, commandId: string, label: string, localUrl: string): Promise<string | null> {
    if (!this.isActive()) return null;

    // Already tunneled this port
    const existing = this.portTunnels.get(port);
    if (existing) return existing.tunnelUrl;

    const type = this.getType()!;

    if (type === 'tailscale' && this.tailscaleDnsName) {
      // Tailscale exposes all ports on the tailnet — just construct the URL
      const tunnelUrl = `https://${this.tailscaleDnsName}:${port}`;
      this.portTunnels.set(port, {
        port, commandId, label, localUrl, tunnelUrl, tunnelType: 'tailscale',
      });
      console.log(`[CompanionRemote] Tailscale tunnel for ${label}: ${tunnelUrl}`);
      return tunnelUrl;
    }

    if (type === 'cloudflare') {
      // Cloudflare needs a separate tunnel process per port
      const cfTunnel = await setupCloudflareTunnel(port, _onTunnelOutput || undefined);
      if (!cfTunnel) {
        console.error(`[CompanionRemote] Failed to create Cloudflare tunnel for port ${port}`);
        return null;
      }
      this.portTunnels.set(port, {
        port, commandId, label, localUrl,
        tunnelUrl: cfTunnel.url,
        tunnelType: 'cloudflare',
        cfTunnel,
      });
      console.log(`[CompanionRemote] Cloudflare tunnel for ${label}: ${cfTunnel.url}`);
      return cfTunnel.url;
    }

    return null;
  }

  /**
   * Remove a tunnel for a dev server port.
   */
  removeTunnel(port: number): void {
    const tunnel = this.portTunnels.get(port);
    if (!tunnel) return;
    if (tunnel.cfTunnel) {
      tunnel.cfTunnel.dispose();
    }
    this.portTunnels.delete(port);
    console.log(`[CompanionRemote] Removed tunnel for port ${port}`);
  }

  /**
   * Remove tunnel by command ID (when a dev server stops).
   */
  removeTunnelByCommand(commandId: string): void {
    for (const [port, tunnel] of this.portTunnels) {
      if (tunnel.commandId === commandId) {
        this.removeTunnel(port);
        return;
      }
    }
  }

  /**
   * Get all active dev server tunnels.
   */
  getPortTunnels(): PortTunnel[] {
    return Array.from(this.portTunnels.values());
  }

  /**
   * Get the current remote URL.
   */
  getUrl(): string | null {
    return this.cloudflareTunnel?.url || this.tailscaleUrl;
  }

  /**
   * Get the type of remote access currently active.
   */
  getType(): 'tailscale' | 'cloudflare' | null {
    if (this.cloudflareTunnel) return 'cloudflare';
    if (this.tailscaleUrl) return 'tailscale';
    return null;
  }

  /**
   * Check if remote access is active.
   */
  isActive(): boolean {
    return this.getUrl() !== null;
  }

  /**
   * Tear down all remote access (companion + port tunnels).
   */
  dispose(): void {
    // Tear down port tunnels
    for (const [port] of this.portTunnels) {
      this.removeTunnel(port);
    }
    this.portTunnels.clear();

    if (this.cloudflareTunnel) {
      this.cloudflareTunnel.dispose();
      this.cloudflareTunnel = null;
    }
    
    // Kill the tailscale funnel process (foreground — no lingering daemon)
    if (this.tailscaleServeProcess) {
      this.tailscaleServeProcess.kill();
      this.tailscaleServeProcess = null;
      console.log('[CompanionRemote] Tailscale funnel stopped');
    }
    
    this.tailscaleUrl = null;
    this.tailscaleDnsName = null;
    this.port = null;
  }

  /**
   * Get connection info for display.
   */
  getInfo(): {
    url: string | null;
    type: 'tailscale' | 'cloudflare' | null;
    port: number | null;
    active: boolean;
  } {
    return {
      url: this.getUrl(),
      type: this.getType(),
      port: this.port,
      active: this.isActive(),
    };
  }
}
