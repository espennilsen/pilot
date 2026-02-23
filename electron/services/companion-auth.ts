import { randomBytes, randomUUID } from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

/**
 * Transient pairing session — in-memory only, 5-minute expiry
 */
interface PairingSession {
  pin: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Persisted authentication token for a paired device
 */
export interface AuthToken {
  sessionId: string;
  token: string;
  deviceName: string;
  createdAt: number;
  lastSeen: number;
}

/**
 * QR code payload for mobile pairing
 */
export interface QRPayload {
  type: 'pilot-companion';
  version: 1;
  host: string;
  port: number;
  token: string;
}

/**
 * Device info returned by getDevices()
 */
export interface DeviceInfo {
  sessionId: string;
  deviceName: string;
  lastSeen: number;
}

/**
 * CompanionAuth — manages PIN/QR pairing and session tokens for Pilot Companion devices
 */
export class CompanionAuth {
  private configDir: string;
  private tokensFilePath: string;
  private activePairing: PairingSession | null = null;
  private tokens: Map<string, AuthToken> = new Map();

  constructor(configDir: string) {
    this.configDir = configDir;
    this.tokensFilePath = join(configDir, 'companion-tokens.json');
  }

  /**
   * Load persisted tokens from disk
   * Call this once during app startup
   */
  async init(): Promise<void> {
    try {
      const data = await readFile(this.tokensFilePath, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        this.tokens = new Map(parsed.map((t: AuthToken) => [t.token, t]));
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error('Failed to load companion tokens:', error);
      }
      // File doesn't exist or is invalid — start fresh
    }
  }

  /**
   * Generate a random 6-digit PIN for pairing
   * Only one active pairing at a time — calling this replaces any existing pairing
   * @returns 6-digit PIN string (e.g., "123456")
   */
  generatePIN(): string {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const now = Date.now();
    this.activePairing = {
      pin,
      createdAt: now,
      expiresAt: now + 5 * 60 * 1000, // 5 minutes
    };
    return pin;
  }

  /**
   * Generate QR code payload for mobile pairing
   * Replaces any existing active pairing
   * @param serverHost - WebSocket server host (e.g., "192.168.1.100")
   * @param serverPort - WebSocket server port
   * @returns QR payload object (serialize to JSON for QR encoding)
   */
  generateQRPayload(serverHost: string, serverPort: number): QRPayload {
    const token = randomBytes(32).toString('hex'); // 32 bytes = 64 hex chars
    const now = Date.now();
    this.activePairing = {
      pin: token, // Store token in pin field — validated the same way
      createdAt: now,
      expiresAt: now + 5 * 60 * 1000, // 5 minutes
    };
    return {
      type: 'pilot-companion',
      version: 1,
      host: serverHost,
      port: serverPort,
      token,
    };
  }

  /**
   * Pair a device using a PIN or QR token credential
   * Validates against the active pairing session
   * On success: generates a long-lived session token, clears the pairing, persists to disk
   * @param credential - 6-digit PIN or 64-char hex token from QR
   * @param deviceName - User-friendly device name (e.g., "John's iPhone")
   * @returns Long-lived session token string (96 hex chars) or null if pairing failed
   */
  async pair(credential: string, deviceName: string): Promise<string | null> {
    if (!this.activePairing) {
      return null;
    }

    const now = Date.now();
    if (now > this.activePairing.expiresAt) {
      this.activePairing = null;
      return null;
    }

    if (this.activePairing.pin !== credential) {
      return null;
    }

    // Generate long-lived session token
    const sessionId = randomUUID();
    const token = randomBytes(48).toString('hex'); // 48 bytes = 96 hex chars
    const authToken: AuthToken = {
      sessionId,
      token,
      deviceName,
      createdAt: now,
      lastSeen: now,
    };

    this.tokens.set(token, authToken);
    this.activePairing = null;

    await this.persistTokens();

    return token;
  }

  /**
   * Validate a session token
   * Updates lastSeen timestamp on success
   * @param token - Long-lived session token (96 hex chars)
   * @returns AuthToken object or null if invalid/not found
   */
  async validateToken(token: string): Promise<AuthToken | null> {
    const authToken = this.tokens.get(token);
    if (!authToken) {
      return null;
    }

    authToken.lastSeen = Date.now();
    await this.persistTokens();

    return authToken;
  }

  /**
   * Get list of all paired devices
   * @returns Array of device info objects
   */
  getDevices(): DeviceInfo[] {
    return Array.from(this.tokens.values()).map((t) => ({
      sessionId: t.sessionId,
      deviceName: t.deviceName,
      lastSeen: t.lastSeen,
    }));
  }

  /**
   * Revoke all tokens for a device session
   * @param sessionId - UUID of the session to revoke
   */
  async revokeDevice(sessionId: string): Promise<void> {
    for (const [token, authToken] of this.tokens.entries()) {
      if (authToken.sessionId === sessionId) {
        this.tokens.delete(token);
      }
    }
    await this.persistTokens();
  }

  /**
   * Get active pairing session info (for debugging/UI)
   * @returns Active pairing session or null
   */
  getActivePairing(): PairingSession | null {
    if (!this.activePairing) {
      return null;
    }
    // Check if expired
    if (Date.now() > this.activePairing.expiresAt) {
      this.activePairing = null;
      return null;
    }
    return this.activePairing;
  }

  /**
   * Clear active pairing session
   */
  clearActivePairing(): void {
    this.activePairing = null;
  }

  /**
   * Persist tokens to disk (private helper)
   */
  private async persistTokens(): Promise<void> {
    try {
      await mkdir(this.configDir, { recursive: true });
      const tokensArray = Array.from(this.tokens.values());
      await writeFile(
        this.tokensFilePath,
        JSON.stringify(tokensArray, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('Failed to persist companion tokens:', error);
    }
  }
}
