import { useEffect, useState } from 'react';
import { Globe, Terminal } from 'lucide-react';
import { IPC } from '../../../../../shared/ipc';
import { invoke, on } from '../../../../lib/ipc-client';
import { useOutputWindowStore } from '../../../../stores/output-window-store';
import { TUNNEL_IDS } from '../../../../stores/tunnel-output-store';
import type { CompanionStatus, RemoteAvailability } from './companion-settings-types';

interface CompanionRemoteAccessProps {
  status: CompanionStatus;
  onStatusChanged: () => void;
}

export function CompanionRemoteAccess({ status, onStatusChanged }: CompanionRemoteAccessProps) {
  const [loading, setLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [activationUrl, setActivationUrl] = useState<string | null>(null);
  const [remoteAvail, setRemoteAvail] = useState<RemoteAvailability | null>(null);

  // Check remote provider availability on mount
  useEffect(() => {
    invoke(IPC.COMPANION_CHECK_REMOTE)
      .then((r: any) => setRemoteAvail(r as RemoteAvailability))
      .catch(() => {});
  }, []);

  // Listen for funnel activation prompts pushed from main process
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
    const tunnelId = provider === 'tailscale' ? TUNNEL_IDS.tailscale : TUNNEL_IDS.cloudflare;
    const outputStore = useOutputWindowStore.getState();
    outputStore.clearOutput?.(tunnelId);
    try {
      if (status.remoteUrl) {
        await invoke(IPC.COMPANION_DISABLE_REMOTE);
      }
      await invoke(IPC.COMPANION_ENABLE_REMOTE, provider === 'tailscale');
      setActivationUrl(null);
      onStatusChanged();
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
      onStatusChanged();
    } catch (err) {
      console.error('Failed to disable remote access:', err);
    }
    setLoading(false);
  };

  return (
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
  );
}
