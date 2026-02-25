export interface CompanionStatus {
  enabled: boolean;
  port: number;
  protocol: 'http' | 'https';
  running: boolean;
  connectedClients: number;
  remoteUrl: string | null;
  remoteType: 'tailscale' | 'cloudflare' | null;
  lanAddress: string | null;
  lanAddresses: Array<{ address: string; name: string }>;
  autoStart: boolean;
}

export interface PairedDevice {
  sessionId: string;
  deviceName: string;
  lastSeen: number;
}

export interface RemoteAvailability {
  tailscale: boolean;
  tailscaleOnline: boolean;
  cloudflared: boolean;
}
