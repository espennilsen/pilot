import { useEffect } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { on } from '../lib/ipc-client';
import { IPC } from '../../shared/ipc';
import type { OAuthEventPayload } from '../../shared/types';

/**
 * Listens for OAuth authentication events from the main process.
 * 
 * Handles OAuth flow state changes (success, prompt, progress) and updates
 * the auth store accordingly. Automatically refreshes auth status when login
 * completes. Shows OAuth prompts when the user needs to paste a code or token.
 * 
 * Should be mounted once at the app root level.
 */
export function useAuthEvents() {
  const loadStatus = useAuthStore(s => s.loadStatus);

  useEffect(() => {
    const unsub = on(IPC.AUTH_LOGIN_OAUTH_EVENT, (payload: OAuthEventPayload) => {
      if (payload.type === 'success') {
        // Refresh auth status when OAuth login completes
        loadStatus();
      } else if (payload.type === 'prompt') {
        // OAuth flow is asking the user to paste a code/token
        useAuthStore.setState({
          oauthPrompt: payload.message || 'Paste the code from your browser:',
          oauthMessage: null,
        });
      } else if (payload.type === 'progress') {
        useAuthStore.setState({ oauthMessage: payload.message });
      }
    });
    return unsub;
  }, [loadStatus]);
}
