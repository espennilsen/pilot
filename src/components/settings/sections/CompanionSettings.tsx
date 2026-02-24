import { useEffect, useState } from 'react';
import { Smartphone, QrCode, Wifi, Globe, RefreshCw, Terminal } from 'lucide-react';
import { SettingRow, Toggle } from '../settings-helpers';
import { IPC } from '../../../../shared/ipc';
import { invoke, on } from '../../../lib/ipc-client';
import { useOutputWindowStore } from '../../../stores/output-window-store';
import { TUNNEL_IDS } from '../../../stores/tunnel-output-store';

interface CompanionStatus {
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

interface PairedDevice {
  sessionId: string;
  deviceName: string;
  lastSeen: number;
}

interface RemoteAvailability {
  tailscale: boolean;
  tailscaleOnline: boolean;
  cloudflared: boolean;
}

export function CompanionSettings() {
  const [status, setStatus] = useState<CompanionStatus | null>(null);
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [pin, setPin] = useState<string | null>(null);
  const [pinExpiry, setPinExpiry] = useState<number | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrHost, setQrHost] = useState<string | null>(null);
  const [qrPort, setQrPort] = useState<number | null>(null);
  const [qrVisible, setQrVisible] = useState(false);
  const [selectedHost, setSelectedHost] = useState<string | null>(null);
  const [restartHint, setRestartHint] = useState(false);
  const [certRegenerated, setCertRegenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [remoteAvail, setRemoteAvail] = useState<RemoteAvailability | null>(null);

  const loadStatus = async () => {
    try {
      const s = await invoke(IPC.COMPANION_GET_STATUS) as CompanionStatus;
      setStatus(s);
    } catch { /* Expected: companion server may not be running */
      // Companion not initialized yet
      setStatus({ enabled: false, port: 18088, protocol: 'https', running: false, connectedClients: 0, remoteUrl: null, remoteType: null, lanAddress: null, lanAddresses: [], autoStart: false });
    }
  };

  const loadDevices = async () => {
    try {
      const d = await invoke(IPC.COMPANION_GET_DEVICES) as PairedDevice[];
      setDevices(d);
    } catch { /* Expected: companion server may not be running */
      setDevices([]);
    }
  };

  useEffect(() => {
    loadStatus();
    loadDevices();
    // Check remote provider availability once
    invoke(IPC.COMPANION_CHECK_REMOTE)
      .then((r: any) => setRemoteAvail(r as RemoteAvailability))
      .catch(() => {});
    // Refresh status every 5 seconds
    const interval = setInterval(() => {
      loadStatus();
      loadDevices();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // PIN / QR countdown timer
  useEffect(() => {
    if (!pinExpiry) return;
    const interval = setInterval(() => {
      const remaining = pinExpiry - Date.now();
      if (remaining <= 0) {
        setPin(null);
        setPinExpiry(null);
        setQrDataUrl(null);
        setQrHost(null);
        setQrPort(null);
        setQrVisible(false);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [pinExpiry]);

  const handleToggleServer = async () => {
    setLoading(true);
    try {
      if (status?.running) {
        await invoke(IPC.COMPANION_DISABLE);
      } else {
        await invoke(IPC.COMPANION_ENABLE);
      }
      await loadStatus();
      setRestartHint(false);
    } catch (err) {
      console.error('Failed to toggle companion server:', err);
    }
    setLoading(false);
  };

  const handleGeneratePIN = async () => {
    try {
      const result = await invoke(IPC.COMPANION_GENERATE_PIN) as { pin: string };
      setPin(result.pin);
      setPinExpiry(Date.now() + 30 * 1000);
    } catch (err) {
      console.error('Failed to generate PIN:', err);
    }
  };

  const generateQRForHost = async (host?: string) => {
    try {
      // Determine port: for tunnel hostnames use the port from the URL, for LAN IPs use server port.
      // Omit port for standard HTTPS (443) — companion defaults to 443 when no port is specified.
      let port: number | undefined;
      if (host && status?.remoteUrl) {
        try {
          const tunnelUrl = new URL(status.remoteUrl);
          if (host === tunnelUrl.hostname) {
            // Tunnel host — use explicit port if non-standard, omit for 443 (HTTPS default)
            const tunnelPort = tunnelUrl.port ? parseInt(tunnelUrl.port, 10) : 443;
            port = tunnelPort !== 443 ? tunnelPort : undefined;
          }
        } catch { /* not a tunnel host, use default */ }
      }

      const result = await invoke(IPC.COMPANION_GENERATE_QR, host || undefined, port) as {
        payload: { host?: string; port?: number };
        dataUrl: string | null;
      };
      if (result.dataUrl) {
        setQrDataUrl(result.dataUrl);
        setQrHost(result.payload?.host || null);
        setQrPort(result.payload?.port || null);
        setQrVisible(true);
        setPinExpiry(Date.now() + 30 * 1000);
      }
    } catch (err) {
      console.error('Failed to generate QR code:', err);
    }
  };

  /** Resolve the effective host: selectedHost state, or the first option from the dropdown (tunnel > LAN). */
  const getEffectiveHost = (): string | undefined => {
    if (selectedHost) return selectedHost;
    // Mirror the dropdown's default: tunnel first, then LAN
    if (status?.remoteUrl) {
      try { return new URL(status.remoteUrl).hostname; } catch { /* ignore */ }
    }
    if (status?.lanAddresses?.length) {
      return status.lanAddresses[0].address;
    }
    return undefined;
  };

  const handleGenerateQR = async () => {
    if (qrVisible) {
      setQrVisible(false);
      return;
    }
    const host = getEffectiveHost();
    setSelectedHost(host || null);
    await generateQRForHost(host);
  };

  const handleHostChange = async (host: string) => {
    setSelectedHost(host);
    // Regenerate QR with the new host if currently visible
    if (qrVisible) {
      await generateQRForHost(host);
    }
  };

  const handleRevokeDevice = async (sessionId: string) => {
    try {
      await invoke(IPC.COMPANION_REVOKE_DEVICE, sessionId);
      await loadDevices();
    } catch (err) {
      console.error('Failed to revoke device:', err);
    }
  };

  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [activationUrl, setActivationUrl] = useState<string | null>(null);

  // Listen for funnel activation prompts pushed from main process
  // while tailscale serve is blocking and waiting for the user.
  useEffect(() => {
    const unsub = on(IPC.COMPANION_REMOTE_ACTIVATION, (payload: { activationUrl: string }) => {
      setActivationUrl(payload.activationUrl);
      setRemoteError(null);
    });
    return unsub;
  }, []);

  const handleEnableRemote = async (provider: 'tailscale' | 'cloudflare') => {
    setLoading(true);
    setRemoteError(null);
    setActivationUrl(null);
    // Clear previous output and open the output popup so the user sees live progress
    const tunnelId = provider === 'tailscale' ? TUNNEL_IDS.tailscale : TUNNEL_IDS.cloudflare;
    const outputStore = useOutputWindowStore.getState();
    outputStore.clearOutput?.(tunnelId);
    try {
      // Disable existing tunnel first if switching providers
      if (status?.remoteUrl) {
        await invoke(IPC.COMPANION_DISABLE_REMOTE);
      }
      await invoke(IPC.COMPANION_ENABLE_REMOTE, provider === 'tailscale');
      setActivationUrl(null);
      const newStatus = await invoke(IPC.COMPANION_GET_STATUS) as CompanionStatus;
      setStatus(newStatus);

      // Switch QR to the tunnel address if QR is visible
      if (newStatus.remoteUrl && qrVisible) {
        try {
          const tunnelHost = new URL(newStatus.remoteUrl).hostname;
          setSelectedHost(tunnelHost);
          await generateQRForHost(tunnelHost);
        } catch { /* ignore parse errors */ }
      }
    } catch (err) {
      setActivationUrl(null);
      const msg = err instanceof Error ? err.message : String(err);
      setRemoteError(msg);
      console.error('Failed to enable remote access:', err);
    }
    setLoading(false);
  };

  const handleDisableRemote = async () => {
    setLoading(true);
    setRemoteError(null);
    try {
      await invoke(IPC.COMPANION_DISABLE_REMOTE);
      const newStatus = await invoke(IPC.COMPANION_GET_STATUS) as CompanionStatus;
      setStatus(newStatus);

      // If QR was showing a tunnel, fall back to LAN address
      if (qrVisible && selectedHost) {
        const lanAddr = newStatus.lanAddress || newStatus.lanAddresses[0]?.address;
        if (lanAddr) {
          setSelectedHost(lanAddr);
          await generateQRForHost(lanAddr);
        }
      }
    } catch (err) {
      console.error('Failed to disable remote access:', err);
    }
    setLoading(false);
  };

  const pinTimeRemaining = pinExpiry ? Math.max(0, Math.floor((pinExpiry - Date.now()) / 1000)) : 0;

  return (
    <div className="p-5 space-y-6">
      {/* Server toggle */}
      <SettingRow
        icon={<Smartphone className="w-4 h-4 text-accent" />}
        label="Companion Server"
        description="Enable the companion server to access Pilot from your iPhone, iPad, or any browser on the local network."
      >
        <div className="flex items-center gap-2">
          {status?.running && (
            <span className="flex items-center gap-1 text-[11px] text-success">
              <Wifi className="w-3 h-3" />
              {status.connectedClients} client{status.connectedClients !== 1 ? 's' : ''}
            </span>
          )}
          <Toggle
            checked={status?.running ?? false}
            onChange={handleToggleServer}
          />
        </div>
      </SettingRow>

      {/* Connection settings — always visible */}
      <div className="ml-7 space-y-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary">Protocol:</label>
            <select
              value={status?.protocol ?? 'https'}
              onChange={async (e) => {
                const proto = e.target.value as 'http' | 'https';
                await invoke(IPC.APP_SETTINGS_UPDATE, { companionProtocol: proto });
                // Update local state immediately so the UI reflects the change
                if (status) setStatus({ ...status, protocol: proto });
                // Show restart hint since protocol change needs server restart
                setRestartHint(true);
              }}
              className="text-xs bg-bg-surface border border-border rounded px-2 py-1 text-text-primary"
              disabled={status?.running}
            >
              <option value="https">HTTPS (TLS)</option>
              <option value="http">HTTP (no encryption)</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary">Port:</label>
            <input
              type="number"
              defaultValue={status?.port ?? 18088}
              onBlur={async (e) => {
                const port = parseInt(e.target.value, 10);
                if (port > 0 && port < 65536) {
                  await invoke(IPC.APP_SETTINGS_UPDATE, { companionPort: port });
                  setRestartHint(true);
                }
              }}
              className="text-xs bg-bg-surface border border-border rounded px-2 py-1 text-text-primary font-mono w-20"
              disabled={status?.running}
              min={1}
              max={65535}
            />
          </div>
        </div>
        {/* Auto-start on launch toggle */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-text-secondary">Start on launch</span>
            <p className="text-[11px] text-text-tertiary mt-0.5">Automatically start the companion server when Pilot opens</p>
          </div>
          <Toggle
            checked={status?.autoStart ?? false}
            onChange={async () => {
              const newValue = !(status?.autoStart ?? false);
              try {
                await invoke(IPC.COMPANION_SET_AUTO_START, newValue);
                if (status) setStatus({ ...status, autoStart: newValue });
              } catch (err) {
                console.error('Failed to toggle auto-start:', err);
              }
            }}
          />
        </div>
        {(status?.protocol === 'https') && (
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                try {
                  await invoke(IPC.COMPANION_REGEN_CERT);
                  setCertRegenerated(true);
                  setTimeout(() => setCertRegenerated(false), 3000);
                } catch (err) {
                  console.error('Failed to regenerate cert:', err);
                }
              }}
              className="text-xs px-2.5 py-1 bg-bg-surface border border-border text-text-secondary rounded hover:bg-bg-elevated hover:text-text-primary transition-colors"
            >
              Regenerate TLS Certificate
            </button>
            {certRegenerated && (
              <span className="text-xs text-success">✓ Certificate regenerated</span>
            )}
          </div>
        )}
        {restartHint && (
          <p className="text-[11px] text-warning">
            ⚠ Restart the companion server for changes to take effect.
          </p>
        )}
      </div>

      {status?.running && (
        <>
          <div className="ml-7 p-3 bg-bg-surface border border-border rounded-md text-xs space-y-1">
            <p className="text-text-secondary">
              Server running on port <span className="font-mono text-text-primary">{status.port}</span> ({status.protocol.toUpperCase()})
            </p>
            <p className="text-text-secondary">
              This Mac: <span className="font-mono text-accent">{status.protocol}://localhost:{status.port}</span>
            </p>
            {status.lanAddress && (
              <p className="text-text-secondary">
                Other devices: <span className="font-mono text-accent">{status.protocol}://{status.lanAddress}:{status.port}</span>
              </p>
            )}
          </div>

          {/* Pair new device */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <QrCode className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium text-text-primary">Pair New Device</span>
            </div>

            <div className="ml-6 space-y-3">
              <div className="flex items-start gap-3">
                <button
                  onClick={handleGeneratePIN}
                  className="text-xs px-3 py-1.5 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
                >
                  Show PIN
                </button>
                <button
                  onClick={handleGenerateQR}
                  className="text-xs px-3 py-1.5 bg-bg-surface border border-border text-text-primary rounded hover:bg-bg-elevated transition-colors"
                >
                  {qrVisible ? 'Hide QR Code' : 'Show QR Code'}
                </button>
                {pin && (
                  <div className="flex items-center gap-2">
                    <div className="text-center">
                      <div className="font-mono text-2xl font-bold text-text-primary tracking-widest">
                        {pin}
                      </div>
                      <p className="text-[11px] text-text-secondary mt-1">
                        {pinTimeRemaining > 0 ? `Expires in ${pinTimeRemaining}s` : 'Expired'}
                      </p>
                    </div>
                    <button
                      onClick={handleGeneratePIN}
                      title="Generate new PIN"
                      className="p-1.5 rounded hover:bg-bg-surface text-text-secondary hover:text-accent transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {qrVisible && qrDataUrl && (
                <div className="space-y-2">
                  {(() => {
                    // Build address options: tunnel (if active) + LAN interfaces
                    const options: Array<{ value: string; label: string }> = [];
                    if (status.remoteUrl) {
                      // Extract host from tunnel URL (e.g. "https://foo.tailnet.ts.net" → "foo.tailnet.ts.net")
                      try {
                        const url = new URL(status.remoteUrl);
                        options.push({
                          value: url.hostname,
                          label: `${url.hostname} (${status.remoteType || 'tunnel'})`,
                        });
                      } catch { /* Expected: URL parsing may fail for non-standard hosts */
                        options.push({ value: status.remoteUrl, label: `${status.remoteUrl} (tunnel)` });
                      }
                    }
                    for (const a of status.lanAddresses) {
                      options.push({ value: a.address, label: `${a.address} (${a.name})` });
                    }
                    // Only show dropdown if there are multiple options
                    if (options.length <= 1) return null;
                    return (
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-text-secondary whitespace-nowrap">Address:</label>
                        <select
                          value={selectedHost || options[0]?.value || ''}
                          onChange={(e) => handleHostChange(e.target.value)}
                          className="text-xs bg-bg-surface border border-border rounded px-2 py-1 text-text-primary font-mono min-w-0 flex-1"
                        >
                          {options.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })()}
                  <div className="flex flex-col items-center gap-2 p-3 bg-white rounded-lg w-fit">
                    <img
                      src={qrDataUrl}
                      alt="Companion QR code"
                      width={200}
                      height={200}
                      className="block"
                    />
                    <p className="text-[11px] text-gray-500">
                      Scan with Pilot Companion
                      {pinExpiry && ` · ${pinTimeRemaining > 0 ? `${pinTimeRemaining}s` : 'expired'}`}
                    </p>
                    {qrHost && (
                      <p className="text-[10px] font-mono text-gray-400">
                        https://{qrHost}{qrPort ? `:${qrPort}` : ''}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Paired devices */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-text-secondary" />
              <span className="text-sm font-medium text-text-primary">Paired Devices</span>
            </div>

            <div className="ml-6 space-y-1.5">
              {devices.length === 0 && (
                <p className="text-xs text-text-secondary italic">No paired devices.</p>
              )}
              {devices.map((device) => {
                const lastSeenAgo = Math.floor((Date.now() - device.lastSeen) / 1000);
                let lastSeenText = 'just now';
                if (lastSeenAgo > 86400) lastSeenText = `${Math.floor(lastSeenAgo / 86400)} days ago`;
                else if (lastSeenAgo > 3600) lastSeenText = `${Math.floor(lastSeenAgo / 3600)} hours ago`;
                else if (lastSeenAgo > 60) lastSeenText = `${Math.floor(lastSeenAgo / 60)} min ago`;

                return (
                  <div
                    key={device.sessionId}
                    className="flex items-center justify-between bg-bg-surface border border-border rounded-md px-3 py-2"
                  >
                    <div>
                      <div className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                        📱 {device.deviceName}
                      </div>
                      <div className="text-[11px] text-text-secondary">
                        Last seen: {lastSeenText}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevokeDevice(device.sessionId)}
                      className="text-xs text-error/70 hover:text-error transition-colors"
                    >
                      Revoke
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Remote access */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5"><Globe className="w-4 h-4 text-text-secondary" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary">Remote Access</p>
                <p className="text-xs text-text-secondary mt-0.5">Access Pilot from outside your local network.</p>
              </div>
            </div>

            {status.remoteUrl ? (
              <div className="ml-7 space-y-2">
                <div className="p-3 bg-bg-surface border border-border rounded-md text-xs space-y-1">
                  <p className="text-text-secondary">
                    Connected via <span className="text-text-primary font-medium capitalize">{status.remoteType}</span>
                  </p>
                  <p className="font-mono text-accent break-all select-all">{status.remoteUrl}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleDisableRemote}
                    disabled={loading}
                    className="px-3 py-1.5 text-xs bg-bg-elevated hover:bg-bg-surface border border-border rounded-md text-text-secondary hover:text-error transition-colors disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                  <button
                    onClick={() => {
                      const tunnelId = status.remoteType === 'tailscale'
                        ? TUNNEL_IDS.tailscale
                        : TUNNEL_IDS.cloudflare;
                      useOutputWindowStore.getState().openOutput(tunnelId);
                    }}
                    className="px-3 py-1.5 text-xs bg-bg-elevated hover:bg-bg-surface border border-border rounded-md text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5"
                  >
                    <Terminal className="w-3 h-3" />
                    View Output
                  </button>
                </div>
              </div>
            ) : (
              <div className="ml-7 flex gap-2">
                <button
                  onClick={() => handleEnableRemote('tailscale')}
                  disabled={loading || (remoteAvail !== null && !remoteAvail.tailscale)}
                  className="flex-1 px-3 py-2 text-xs bg-bg-elevated hover:bg-bg-surface border border-border rounded-md text-text-primary transition-colors disabled:opacity-50 space-y-0.5 text-left"
                >
                  <div className="font-medium">Tailscale</div>
                  <div className={remoteAvail?.tailscale === false ? 'text-warning' : 'text-text-secondary'}>
                    {remoteAvail === null ? 'Checking…' :
                     !remoteAvail.tailscale ? 'Not installed' :
                     !remoteAvail.tailscaleOnline ? 'Installed but offline' :
                     'Ready'}
                  </div>
                </button>
                <button
                  onClick={() => handleEnableRemote('cloudflare')}
                  disabled={loading || (remoteAvail !== null && !remoteAvail.cloudflared)}
                  className="flex-1 px-3 py-2 text-xs bg-bg-elevated hover:bg-bg-surface border border-border rounded-md text-text-primary transition-colors disabled:opacity-50 space-y-0.5 text-left"
                >
                  <div className="font-medium">Cloudflare Tunnel</div>
                  <div className={remoteAvail?.cloudflared === false ? 'text-warning' : 'text-text-secondary'}>
                    {remoteAvail === null ? 'Checking…' :
                     !remoteAvail.cloudflared ? 'Not installed' :
                     'Ready — no account needed'}
                  </div>
                </button>
              </div>
            )}

            {activationUrl && (
              <div className="ml-7 text-xs text-text-secondary space-y-1">
                <p>Tailscale Funnel needs to be enabled on your tailnet.</p>
                <p>
                  Click to enable:{' '}
                  <a
                    href={activationUrl}
                    className="underline text-accent hover:text-accent/80 cursor-pointer"
                    onClick={(e) => {
                      e.preventDefault();
                      window.api?.openExternal?.(activationUrl);
                    }}
                  >
                    {activationUrl}
                  </a>
                </p>
                <p className="text-text-tertiary italic">Waiting for activation…</p>
              </div>
            )}

            {remoteError && !activationUrl && (
              <p className="ml-7 text-xs text-error whitespace-pre-line">
                {remoteError.split(/(https?:\/\/\S+)/g).map((part, i) =>
                  /^https?:\/\//.test(part) ? (
                    <a
                      key={i}
                      href={part}
                      className="underline text-accent hover:text-accent/80 cursor-pointer"
                      onClick={(e) => {
                        e.preventDefault();
                        window.api?.openExternal?.(part);
                      }}
                    >
                      {part}
                    </a>
                  ) : (
                    <span key={i}>{part}</span>
                  )
                )}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
