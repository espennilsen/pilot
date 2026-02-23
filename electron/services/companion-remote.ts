import { exec, execSync, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const execAsync = promisify(exec);

interface TailscaleStatus {
  Self?: {
    DNSName?: string;
    HostName?: string;
    Online?: boolean;
  };
}

interface TailscaleResult {
  url: string;
  dnsName: string;
  certPath: string | null;
  keyPath: string | null;
  funnelProcess: ChildProcess | null;
}

interface CloudflareTunnelInfo {
  url: string;
  process: ChildProcess;
  dispose: () => void;
}

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
 * Starts `tailscale funnel` as a foreground child process.
 * Funnel exposes the local port to the public internet on port 443.
 * The process stays alive and is killed when dispose() is called or the app exits —
 * no lingering background daemons.
 *
 * If funnel activation is required on the tailnet, pushes the activation URL
 * to the renderer and waits up to 2 minutes for the user to enable it.
 *
 * Resolves with the child process once the funnel is ready.
 */
function runTailscaleFunnel(port: number): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const proc = spawn('tailscale', [
      'funnel', '--https=443', `https+insecure://localhost:${port}`,
    ], { stdio: 'pipe' });

    let output = '';
    let activationSent = false;
    let settled = false;

    // Foreground funnel is "ready" once it's produced initial output and
    // is still running (no exit). We wait a short period after the last
    // output to consider it stable.
    let readyTimer: ReturnType<typeof setTimeout> | null = null;

    const settle = () => {
      if (settled) return;
      settled = true;
      if (readyTimer) clearTimeout(readyTimer);
      resolve(proc);
    };

    const onData = (data: Buffer) => {
      const text = data.toString();
      output += text;

      // Stream output to renderer
      _onTunnelOutput?.('tailscale', text);

      // Push activation URL to renderer so it can show a clickable link
      if (!activationSent) {
        const urlMatch = output.match(/https:\/\/login\.tailscale\.com\/\S+/);
        if (urlMatch || /funnel is not enabled/i.test(output)) {
          activationSent = true;
          const activationUrl = urlMatch?.[0] || 'https://login.tailscale.com/admin/machines';
          _onActivationUrl?.(activationUrl);
        }
      }

      // "Available on the internet" / "started" / similar means funnel is ready
      if (/available|serving|started|ready/i.test(text) && !settled) {
        settle();
        return;
      }

      // Reset the ready timer — if no more output for 2s, assume ready
      if (readyTimer) clearTimeout(readyTimer);
      if (!settled) {
        readyTimer = setTimeout(settle, 2000);
      }
    };

    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);

    proc.on('error', (err) => {
      if (!settled) { settled = true; reject(err); }
    });

    proc.on('exit', (code) => {
      if (settled) return;
      settled = true;
      if (readyTimer) clearTimeout(readyTimer);
      if (activationSent) {
        const urlMatch = output.match(/https:\/\/login\.tailscale\.com\/\S+/);
        const activationUrl = urlMatch?.[0] || 'https://login.tailscale.com/admin/machines';
        reject(new Error(
          `Tailscale Funnel is not enabled on your tailnet. Enable it here:\n${activationUrl}`
        ));
      } else if (code === 0) {
        resolve(proc);
      } else {
        reject(new Error(`tailscale funnel exited with code ${code}: ${output.trim()}`));
      }
    });

    // Timeout: 2 minutes to give the user time to visit the activation link
    setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill();
        if (activationSent) {
          const urlMatch = output.match(/https:\/\/login\.tailscale\.com\/\S+/);
          const activationUrl = urlMatch?.[0] || 'https://login.tailscale.com/admin/machines';
          reject(new Error(
            `Tailscale Funnel is not enabled on your tailnet. Enable it here:\n${activationUrl}`
          ));
        } else {
          reject(new Error('tailscale funnel timed out'));
        }
      }
    }, 120000);
  });
}

/**
 * Sets up Tailscale proxy with TLS certificates for the given port.
 * Checks that Tailscale is installed, connected, and online.
 * Generates proper TLS certs via `tailscale cert` for browser-trusted HTTPS.
 * 
 * @param port - The local port to expose
 * @returns Tailscale connection info or null if unavailable
 */
export async function setupTailscaleProxy(port: number): Promise<TailscaleResult | null> {
  try {
    // Check if tailscale CLI is installed
    try {
      execSync('which tailscale', { stdio: 'ignore' });
    } catch {
      throw new Error('Tailscale CLI not found. Install Tailscale from https://tailscale.com/download');
    }

    // Get Tailscale status
    const { stdout: statusOutput } = await execAsync('tailscale status --json');
    const status: TailscaleStatus = JSON.parse(statusOutput);

    if (!status.Self?.Online) {
      throw new Error('Tailscale is not connected. Start Tailscale and log in first.');
    }

    if (!status.Self?.DNSName) {
      throw new Error('Tailscale DNS name not available. Ensure Tailscale is properly configured.');
    }

    // DNSName from Tailscale includes trailing dot, remove it
    const dnsName = status.Self.DNSName.replace(/\.$/, '');
    
    // Generate TLS certificates for the Tailscale domain
    const certDir = join(homedir(), '.config', '.pilot', 'tailscale-certs');
    if (!existsSync(certDir)) {
      mkdirSync(certDir, { recursive: true });
    }

    const certPath = join(certDir, dnsName + '.crt');
    const keyPath = join(certDir, dnsName + '.key');

    let useTailscaleCerts = false;
    try {
      const certOutput = execSync(
        `tailscale cert --cert-file="${certPath}" --key-file="${keyPath}" "${dnsName}" 2>&1`,
        { encoding: 'utf-8' }
      );
      console.log(`[CompanionRemote] Generated Tailscale TLS certs for ${dnsName}`);
      useTailscaleCerts = true;
    } catch (certError: any) {
      const stderr = certError?.stdout || certError?.stderr || certError?.message || '';
      if (stderr.includes('does not support')) {
        console.warn(`[CompanionRemote] Tailscale account doesn't support TLS certs — using self-signed cert with Tailscale IP`);
      } else {
        console.warn(`[CompanionRemote] tailscale cert failed: ${stderr.trim()} — using self-signed cert with Tailscale IP`);
      }
    }

    // Start Tailscale Funnel to expose the local port on the public internet via port 443.
    // Funnel handles its own TLS — no need for local certs on the funnel side.
    // Runs as a foreground process that dies when the app exits.
    try {
      const funnelProcess = await runTailscaleFunnel(port);
      console.log(`[CompanionRemote] Tailscale funnel: 443 → localhost:${port}`);

      const url = `https://${dnsName}`;
      console.log(`[CompanionRemote] Tailscale URL: ${url}`);

      return {
        url,
        dnsName,
        certPath: useTailscaleCerts ? certPath : null,
        keyPath: useTailscaleCerts ? keyPath : null,
        funnelProcess,
      };
    } catch (funnelErr: any) {
      // Funnel activation errors should propagate to the UI
      if (/funnel/i.test(funnelErr.message)) throw funnelErr;
      console.warn('[CompanionRemote] tailscale funnel failed, falling back to direct port:', funnelErr.message);
    }

    // Direct port URL — funnel failed or unavailable
    const url = `https://${dnsName}:${port}`;
    console.log(`[CompanionRemote] Tailscale URL (direct): ${url}`);
    return { url, dnsName, certPath: useTailscaleCerts ? certPath : null, keyPath: useTailscaleCerts ? keyPath : null, funnelProcess: null };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[CompanionRemote] Tailscale setup failed:', msg);
    // Re-throw so the caller gets a useful message
    throw new Error(`Tailscale: ${msg}`);
  }
}

/**
 * Sets up a Cloudflare tunnel for the given port.
 * Spawns cloudflared and parses the assigned *.trycloudflare.com URL.
 * 
 * @param port - The local port to expose
 * @returns Tunnel info with URL and dispose function, or null if cloudflared unavailable
 */
export async function setupCloudflareTunnel(
  port: number
): Promise<CloudflareTunnelInfo | null> {
  try {
    // Check if cloudflared is installed
    try {
      execSync('which cloudflared', { stdio: 'ignore' });
    } catch {
      console.log('cloudflared not found in PATH');
      return null;
    }

    return new Promise((resolve) => {
      // Spawn cloudflared tunnel process.
      // Use https:// origin since the companion server is TLS-only.
      // --no-tls-verify because the origin cert is self-signed.
      const tunnelProcess = spawn('cloudflared', [
        'tunnel',
        '--url',
        `https://localhost:${port}`,
        '--no-tls-verify',
      ], {
        stdio: 'pipe',
      });

      let resolved = false;
      let output = '';

      // Parse output to find the assigned URL
      const parseOutput = (data: Buffer) => {
        const text = data.toString();
        output += text;

        // Stream output to renderer
        _onTunnelOutput?.('cloudflare', text);

        // Cloudflared outputs the URL in various formats:
        // - "https://some-random-name.trycloudflare.com"
        // - Sometimes in stderr with additional log info
        const urlMatch = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
        
        if (urlMatch && !resolved) {
          resolved = true;
          const url = urlMatch[0];
          console.log(`Cloudflare tunnel established: ${url}`);
          
          resolve({
            url,
            process: tunnelProcess,
            dispose: () => {
              console.log('Shutting down Cloudflare tunnel');
              tunnelProcess.kill();
            },
          });
        }
      };

      tunnelProcess.stdout?.on('data', parseOutput);
      tunnelProcess.stderr?.on('data', parseOutput);

      tunnelProcess.on('error', (error) => {
        console.error('Cloudflare tunnel process error:', error);
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      });

      tunnelProcess.on('exit', (code) => {
        if (!resolved) {
          console.error(`Cloudflare tunnel exited with code ${code}`);
          console.error('Output:', output);
          resolved = true;
          resolve(null);
        }
      });

      // Timeout after 30 seconds if URL not found
      setTimeout(() => {
        if (!resolved) {
          console.error('Timeout waiting for Cloudflare tunnel URL');
          console.error('Output so far:', output);
          resolved = true;
          tunnelProcess.kill();
          resolve(null);
        }
      }, 30000);
    });
  } catch (error) {
    console.error('Error setting up Cloudflare tunnel:', error);
    return null;
  }
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
      const result = await setupTailscaleProxy(port);
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
      this.cloudflareTunnel = await setupCloudflareTunnel(port);
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
      const cfTunnel = await setupCloudflareTunnel(port);
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
