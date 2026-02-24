import { execSync, spawn, ChildProcess } from 'child_process';

export interface CloudflareTunnelInfo {
  url: string;
  process: ChildProcess;
  dispose: () => void;
}

/**
 * Sets up a Cloudflare tunnel for the given port.
 * Spawns cloudflared and parses the assigned *.trycloudflare.com URL.
 * 
 * @param port - The local port to expose
 * @param onTunnelOutput - Optional callback to stream tunnel output
 * @returns Tunnel info with URL and dispose function, or null if cloudflared unavailable
 */
export async function setupCloudflareTunnel(
  port: number,
  onTunnelOutput?: (provider: 'tailscale' | 'cloudflare', text: string) => void
): Promise<CloudflareTunnelInfo | null> {
  try {
    // Check if cloudflared is installed
    try {
      execSync(process.platform === 'win32' ? 'where cloudflared' : 'which cloudflared', { stdio: 'ignore' });
    } catch {
      console.log('cloudflared not found in PATH');
      return null;
    }

    return new Promise((resolve) => {
      // Spawn cloudflared tunnel process.
      // Use https:// origin since the companion server is TLS-only.
      // --no-tls-verify because the origin cert is self-signed.
      const cloudflareddCmd = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
      const tunnelProcess = spawn(cloudflareddCmd, [
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
        onTunnelOutput?.('cloudflare', text);

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
