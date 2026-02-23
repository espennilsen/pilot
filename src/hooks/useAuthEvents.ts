import { useEffect } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { on } from '../lib/ipc-client';
import { IPC } from '../../shared/ipc';

export function useAuthEvents() {
  const loadStatus = useAuthStore(s => s.loadStatus);

  useEffect(() => {
    const unsub = on(IPC.AUTH_LOGIN_OAUTH_EVENT, (payload: any) => {
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
