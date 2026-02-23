import { create } from 'zustand';
import { IPC } from '../../shared/ipc';
import { invoke } from '../lib/ipc-client';

export interface ProviderAuthInfo {
  provider: string;
  hasAuth: boolean;
  authType: 'api_key' | 'oauth' | 'env' | 'none';
}

interface AuthStore {
  providers: ProviderAuthInfo[];
  hasAnyAuth: boolean;
  isLoading: boolean;
  error: string | null;

  // OAuth flow state
  oauthInProgress: string | null; // provider id
  oauthMessage: string | null;
  oauthPrompt: string | null; // non-null when waiting for user to paste a code

  // Actions
  loadStatus: () => Promise<void>;
  setApiKey: (provider: string, apiKey: string) => Promise<boolean>;
  loginOAuth: (providerId: string) => Promise<void>;
  submitOAuthPrompt: (value: string) => Promise<void>;
  cancelOAuthPrompt: () => void;
  logout: (provider: string) => Promise<void>;
  clearError: () => void;
}

function friendlyAuthError(raw: unknown): string {
  const msg = String(raw);

  // Token exchange / OAuth failures
  if (/token exchange failed/i.test(msg)) {
    return 'Login failed — the token exchange was rejected. Try again or use an API key instead.';
  }
  // Provider not found
  if (/oauth provider .* not found/i.test(msg)) {
    return 'This provider doesn\'t support browser login. Use an API key instead.';
  }
  // Network errors
  if (/fetch failed|ECONNREFUSED|ETIMEDOUT|network/i.test(msg)) {
    return 'Could not reach the provider — check your internet connection and try again.';
  }
  // Invalid API key format
  if (/invalid.*api.?key|unauthorized|401/i.test(msg)) {
    return 'That API key was rejected. Double-check you copied the full key and try again.';
  }

  // Strip the noisy "Error: Error invoking remote method '...': Error:" wrapper
  return msg
    .replace(/^Error:\s*/i, '')
    .replace(/Error invoking remote method '[^']+':?\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim() || 'Something went wrong. Please try again.';
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  providers: [],
  hasAnyAuth: false,
  isLoading: false,
  error: null,
  oauthInProgress: null,
  oauthMessage: null,
  oauthPrompt: null,

  loadStatus: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await invoke(IPC.AUTH_GET_STATUS) as {
        providers: ProviderAuthInfo[];
        hasAnyAuth: boolean;
      };
      set({
        providers: result.providers,
        hasAnyAuth: result.hasAnyAuth,
        isLoading: false,
      });
    } catch (error) {
      set({ error: friendlyAuthError(error), isLoading: false });
    }
  },

  setApiKey: async (provider: string, apiKey: string) => {
    set({ isLoading: true, error: null });
    try {
      await invoke(IPC.AUTH_SET_API_KEY, provider, apiKey);
      await get().loadStatus();
      return true;
    } catch (error) {
      set({ error: friendlyAuthError(error), isLoading: false });
      return false;
    }
  },

  loginOAuth: async (providerId: string) => {
    set({ oauthInProgress: providerId, oauthMessage: 'Starting login…', oauthPrompt: null, error: null });
    try {
      await invoke(IPC.AUTH_LOGIN_OAUTH, providerId);
      set({ oauthInProgress: null, oauthMessage: null, oauthPrompt: null });
      await get().loadStatus();
    } catch (error) {
      set({
        oauthInProgress: null,
        oauthMessage: null,
        oauthPrompt: null,
        error: friendlyAuthError(error),
      });
    }
  },

  submitOAuthPrompt: async (value: string) => {
    set({ oauthPrompt: null, oauthMessage: 'Completing login…' });
    await invoke(IPC.AUTH_OAUTH_PROMPT_REPLY, value);
  },

  cancelOAuthPrompt: () => {
    // Send empty to unblock the main process, which will likely cause a login error
    set({ oauthPrompt: null });
    invoke(IPC.AUTH_OAUTH_PROMPT_REPLY, '');
  },

  logout: async (provider: string) => {
    try {
      await invoke(IPC.AUTH_LOGOUT, provider);
      await get().loadStatus();
    } catch (error) {
      set({ error: friendlyAuthError(error) });
    }
  },

  clearError: () => set({ error: null }),
}));
