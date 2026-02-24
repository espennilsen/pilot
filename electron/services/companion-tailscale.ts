import { exec, execSync, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { PILOT_APP_DIR } from './pilot-paths';

const execAsync = promisify(exec);

export interface TailscaleStatus {
  Self?: {
    DNSName?: string;
    HostName?: string;
    Online?: boolean;
  };
}

export interface TailscaleResult {
  url: string;
  dnsName: string;
  certPath: string | null;
  keyPath: string | null;
  funnelProcess: ChildProcess | null;
}

interface TailscaleCallbacks {
  onActivationUrl?: (url: string) => void;
  onTunnelOutput?: (provider: 'tailscale' | 'cloudflare', text: string) => void;
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
export function runTailscaleFunnel(port: number, callbacks?: TailscaleCallbacks): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const tailscaleCmd = process.platform === 'win32' ? 'tailscale.exe' : 'tailscale';
    const proc = spawn(tailscaleCmd, [
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
      callbacks?.onTunnelOutput?.('tailscale', text);

      // Push activation URL to renderer so it can show a clickable link
      if (!activationSent) {
        const urlMatch = output.match(/https:\/\/login\.tailscale\.com\/\S+/);
        if (urlMatch || /funnel is not enabled/i.test(output)) {
          activationSent = true;
          const activationUrl = urlMatch?.[0] || 'https://login.tailscale.com/admin/machines';
          callbacks?.onActivationUrl?.(activationUrl);
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
 * @param callbacks - Optional callbacks for activation URL and tunnel output
 * @returns Tailscale connection info or null if unavailable
 */
export async function setupTailscaleProxy(port: number, callbacks?: TailscaleCallbacks): Promise<TailscaleResult | null> {
  try {
    // Check if tailscale CLI is installed
    try {
      execSync(process.platform === 'win32' ? 'where tailscale' : 'which tailscale', { stdio: 'ignore' });
    } catch (err) {
      console.debug('Tailscale check failed', err);
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
    const certDir = join(PILOT_APP_DIR, 'tailscale-certs');
    if (!existsSync(certDir)) {
      mkdirSync(certDir, { recursive: true });
    }

    const certPath = join(certDir, dnsName + '.crt');
    const keyPath = join(certDir, dnsName + '.key');

    let useTailscaleCerts = false;
    try {
      const certOutput = execSync(
        `tailscale cert --cert-file="${certPath}" --key-file="${keyPath}" "${dnsName}"`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
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
      const funnelProcess = await runTailscaleFunnel(port, callbacks);
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
