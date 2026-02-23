import { create } from 'zustand';
import { IPC } from '../../shared/ipc';
import { on } from '../lib/ipc-client';

export type TunnelProvider = 'tailscale' | 'cloudflare';

/** Virtual command IDs used in the output window system */
export const TUNNEL_IDS = {
  tailscale: '__tunnel:tailscale__',
  cloudflare: '__tunnel:cloudflare__',
} as const;

/** Labels for display in output window tabs */
export const TUNNEL_LABELS: Record<string, string> = {
  [TUNNEL_IDS.tailscale]: 'Tailscale Funnel',
  [TUNNEL_IDS.cloudflare]: 'Cloudflare Tunnel',
};

/** Check if a command ID is a tunnel output tab */
export function isTunnelId(id: string): boolean {
  return id === TUNNEL_IDS.tailscale || id === TUNNEL_IDS.cloudflare;
}

/** Get the provider from a tunnel ID */
export function tunnelIdToProvider(id: string): TunnelProvider | null {
  if (id === TUNNEL_IDS.tailscale) return 'tailscale';
  if (id === TUNNEL_IDS.cloudflare) return 'cloudflare';
  return null;
}

interface TunnelOutputStore {
  output: Record<TunnelProvider, string>;
  appendOutput: (provider: TunnelProvider, text: string) => void;
  clearOutput: (provider: TunnelProvider) => void;
}

export const useTunnelOutputStore = create<TunnelOutputStore>((set) => ({
  output: {
    tailscale: '',
    cloudflare: '',
  },

  appendOutput: (provider: TunnelProvider, text: string) => {
    set((s) => ({
      output: {
        ...s.output,
        [provider]: s.output[provider] + text,
      },
    }));
  },

  clearOutput: (provider: TunnelProvider) => {
    set((s) => ({
      output: {
        ...s.output,
        [provider]: '',
      },
    }));
  },
}));

// Listen for tunnel output from main process
if (typeof window !== 'undefined' && window.api) {
  on(IPC.COMPANION_TUNNEL_OUTPUT, (provider: unknown, text: unknown) => {
    if (typeof provider === 'string' && typeof text === 'string') {
      useTunnelOutputStore.getState().appendOutput(provider as TunnelProvider, text);
    }
  });
}
