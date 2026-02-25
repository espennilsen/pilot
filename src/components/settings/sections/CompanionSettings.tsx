import { useEffect, useState, useCallback } from 'react';
import { Smartphone, Wifi } from 'lucide-react';
import { SettingRow, Toggle } from '../settings-helpers';
import { IPC } from '../../../../shared/ipc';
import { invoke } from '../../../lib/ipc-client';
import type { CompanionStatus, PairedDevice } from './companion/companion-settings-types';
import { CompanionPairing } from './companion/CompanionPairing';
import { CompanionDevices } from './companion/CompanionDevices';
import { CompanionRemoteAccess } from './companion/CompanionRemoteAccess';

const DEFAULT_STATUS: CompanionStatus = {
  enabled: false, port: 18088, protocol: 'https', running: false,
  connectedClients: 0, remoteUrl: null, remoteType: null,
  lanAddress: null, lanAddresses: [], autoStart: false,
};

export function CompanionSettings() {
  const [status, setStatus] = useState<CompanionStatus | null>(null);
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [restartHint, setRestartHint] = useState(false);
  const [certRegenerated, setCertRegenerated] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const s = await invoke(IPC.COMPANION_GET_STATUS) as CompanionStatus;
      setStatus(s);
    } catch {
      setStatus(DEFAULT_STATUS);
    }
  }, []);

  const loadDevices = useCallback(async () => {
    try {
      const d = await invoke(IPC.COMPANION_GET_DEVICES) as PairedDevice[];
      setDevices(d);
    } catch {
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadDevices();
    const interval = setInterval(() => {
      loadStatus();
      loadDevices();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadStatus, loadDevices]);

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

      {/* Connection settings */}
      <div className="ml-7 space-y-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary">Protocol:</label>
            <select
              value={status?.protocol ?? 'https'}
              onChange={async (e) => {
                const proto = e.target.value as 'http' | 'https';
                await invoke(IPC.APP_SETTINGS_UPDATE, { companionProtocol: proto });
                if (status) setStatus({ ...status, protocol: proto });
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

      {/* Server status info */}
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

          <CompanionPairing status={status} />
          <CompanionDevices devices={devices} onDevicesChanged={loadDevices} />
          <CompanionRemoteAccess status={status} onStatusChanged={loadStatus} />
        </>
      )}
    </div>
  );
}
