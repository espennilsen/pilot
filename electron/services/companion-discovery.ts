import { spawn, type ChildProcess } from 'child_process';
import { hostname, platform } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * CompanionDiscovery - mDNS/Bonjour service advertisement for Pilot Companion
 *
 * Advertises the Pilot Companion WebSocket server via multicast DNS so that
 * mobile/remote clients can discover it automatically on the local network.
 *
 * Uses @homebridge/ciao if available, otherwise falls back to dns-sd CLI on macOS.
 */
export class CompanionDiscovery {
  /** For ciao: bare service name (it adds _prefix and ._tcp automatically) */
  private static readonly SERVICE_TYPE_BARE = 'pilot-comp';
  /** For dns-sd CLI: full mDNS service type string */
  private static readonly SERVICE_TYPE_FULL = '_pilot-comp._tcp';
  private static readonly TXT_RECORDS = {
    version: '1',
    app: 'pilot',
  };

  private ciaoService: any = null;
  private ciaoResponder: any = null;
  private dnssdProcess: ChildProcess | null = null;
  private isRunning = false;

  /**
   * Get the computer's display name.
   * On macOS, tries to get the friendly Computer Name.
   * Falls back to os.hostname() on other platforms or if scutil fails.
   */
  static async getComputerName(): Promise<string> {
    if (platform() === 'darwin') {
      try {
        const { stdout } = await execFileAsync('scutil', ['--get', 'ComputerName']);
        const computerName = stdout.trim();
        if (computerName && computerName.length > 0) {
          return computerName;
        }
      } catch (error) {
        // scutil failed, fall back to hostname
        console.log('[CompanionDiscovery] scutil failed, using hostname:', error);
      }
    }
    return hostname();
  }

  /**
   * Start advertising the companion service via mDNS.
   *
   * @param port - WebSocket server port
   * @param instanceName - Service instance name (computer display name)
   */
  async start(port: number, instanceName: string): Promise<void> {
    if (this.isRunning) {
      console.warn('[CompanionDiscovery] Already running, stop first');
      return;
    }

    console.log(
      `[CompanionDiscovery] Starting mDNS advertisement: ${instanceName} on port ${port}`
    );

    // Try @homebridge/ciao first
    const ciaoSuccess = await this.startWithCiao(port, instanceName);
    if (ciaoSuccess) {
      this.isRunning = true;
      return;
    }

    // Fall back to dns-sd CLI (macOS)
    if (platform() === 'darwin') {
      const dnssdSuccess = this.startWithDnsSd(port, instanceName);
      if (dnssdSuccess) {
        this.isRunning = true;
        return;
      }
    }

    console.warn(
      '[CompanionDiscovery] mDNS advertisement unavailable - @homebridge/ciao required (see https://github.com/nicnacnic/ciao for setup)'
    );
  }

  /**
   * Stop advertising the companion service.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('[CompanionDiscovery] Stopping mDNS advertisement');

    // Stop ciao service
    if (this.ciaoService) {
      try {
        await this.ciaoService.destroy();
        this.ciaoService = null;
      } catch (error) {
        console.error('[CompanionDiscovery] Error destroying ciao service:', error);
      }
    }

    // Stop ciao responder
    if (this.ciaoResponder) {
      try {
        await this.ciaoResponder.shutdown();
        this.ciaoResponder = null;
      } catch (error) {
        console.error('[CompanionDiscovery] Error shutting down ciao responder:', error);
      }
    }

    // Stop dns-sd process
    if (this.dnssdProcess) {
      this.dnssdProcess.kill();
      this.dnssdProcess = null;
    }

    this.isRunning = false;
  }

  /**
   * Try to start mDNS advertisement using @homebridge/ciao.
   * Returns true if successful, false if library not available.
   */
  private async startWithCiao(port: number, instanceName: string): Promise<boolean> {
    try {
      // Dynamic import to avoid hard dependency
      // @ts-ignore - optional dependency
      const ciao = await import('@homebridge/ciao');

      // Create responder
      this.ciaoResponder = ciao.getResponder();

      // Create and advertise service
      this.ciaoService = this.ciaoResponder.createService({
        name: instanceName,
        type: CompanionDiscovery.SERVICE_TYPE_BARE,
        port,
        txt: CompanionDiscovery.TXT_RECORDS,
      });

      await this.ciaoService.advertise();

      console.log('[CompanionDiscovery] Successfully started with @homebridge/ciao');
      return true;
    } catch (error) {
      // Library not installed or error occurred
      console.log('[CompanionDiscovery] @homebridge/ciao not available:', error);
      return false;
    }
  }

  /**
   * Start mDNS advertisement using macOS dns-sd CLI.
   * Returns true if process started successfully, false otherwise.
   */
  private startWithDnsSd(port: number, instanceName: string): boolean {
    try {
      // Build TXT record string: version=1 app=pilot
      const txtRecord = Object.entries(CompanionDiscovery.TXT_RECORDS)
        .map(([key, value]) => `${key}=${value}`)
        .join(' ');

      // dns-sd -R <Name> <Type> <Domain> <Port> <TXT>
      // Example: dns-sd -R "My Computer" _pilot-comp._tcp local 8765 version=1 app=pilot
      const args = [
        '-R',
        instanceName,
        CompanionDiscovery.SERVICE_TYPE_FULL,
        'local',
        port.toString(),
        txtRecord,
      ];

      this.dnssdProcess = spawn('dns-sd', args);

      this.dnssdProcess.stdout?.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          console.log(`[CompanionDiscovery] dns-sd: ${output}`);
        }
      });

      this.dnssdProcess.stderr?.on('data', (data) => {
        console.error(`[CompanionDiscovery] dns-sd error: ${data.toString().trim()}`);
      });

      this.dnssdProcess.on('error', (error) => {
        console.error('[CompanionDiscovery] dns-sd process error:', error);
        this.dnssdProcess = null;
      });

      this.dnssdProcess.on('close', (code) => {
        console.log(`[CompanionDiscovery] dns-sd process exited with code ${code}`);
        this.dnssdProcess = null;
        this.isRunning = false;
      });

      console.log('[CompanionDiscovery] Successfully started with dns-sd CLI');
      return true;
    } catch (error) {
      console.error('[CompanionDiscovery] Failed to start dns-sd:', error);
      return false;
    }
  }

  /**
   * Check if the service is currently running.
   */
  isAdvertising(): boolean {
    return this.isRunning;
  }
}
