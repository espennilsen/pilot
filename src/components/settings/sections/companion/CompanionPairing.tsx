import { useEffect, useState } from 'react';
import { QrCode, RefreshCw } from 'lucide-react';
import { IPC } from '../../../../../shared/ipc';
import { invoke } from '../../../../lib/ipc-client';
import type { CompanionStatus } from './companion-settings-types';

interface CompanionPairingProps {
  status: CompanionStatus;
}

export function CompanionPairing({ status }: CompanionPairingProps) {
  const [pin, setPin] = useState<string | null>(null);
  const [pinExpiry, setPinExpiry] = useState<number | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrHost, setQrHost] = useState<string | null>(null);
  const [qrPort, setQrPort] = useState<number | null>(null);
  const [qrVisible, setQrVisible] = useState(false);
  const [selectedHost, setSelectedHost] = useState<string | null>(null);

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
      let port: number | undefined;
      if (host && status.remoteUrl) {
        try {
          const tunnelUrl = new URL(status.remoteUrl);
          if (host === tunnelUrl.hostname) {
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

  const getEffectiveHost = (): string | undefined => {
    if (selectedHost) return selectedHost;
    if (status.remoteUrl) {
      try { return new URL(status.remoteUrl).hostname; } catch { /* ignore */ }
    }
    if (status.lanAddresses?.length) {
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
    if (qrVisible) {
      await generateQRForHost(host);
    }
  };

  const pinTimeRemaining = pinExpiry ? Math.max(0, Math.floor((pinExpiry - Date.now()) / 1000)) : 0;

  return (
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
              const options: Array<{ value: string; label: string }> = [];
              if (status.remoteUrl) {
                try {
                  const url = new URL(status.remoteUrl);
                  options.push({
                    value: url.hostname,
                    label: `${url.hostname} (${status.remoteType || 'tunnel'})`,
                  });
                } catch {
                  options.push({ value: status.remoteUrl, label: `${status.remoteUrl} (tunnel)` });
                }
              }
              for (const a of status.lanAddresses) {
                options.push({ value: a.address, label: `${a.address} (${a.name})` });
              }
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
  );
}
