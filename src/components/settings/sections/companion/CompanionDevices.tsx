import { Smartphone } from 'lucide-react';
import { IPC } from '../../../../../shared/ipc';
import { invoke } from '../../../../lib/ipc-client';
import type { PairedDevice } from './companion-settings-types';

interface CompanionDevicesProps {
  devices: PairedDevice[];
  onDevicesChanged: () => void;
}

export function CompanionDevices({ devices, onDevicesChanged }: CompanionDevicesProps) {
  const handleRevokeDevice = async (sessionId: string) => {
    try {
      await invoke(IPC.COMPANION_REVOKE_DEVICE, sessionId);
      onDevicesChanged();
    } catch (err) {
      console.error('Failed to revoke device:', err);
    }
  };

  return (
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
  );
}
