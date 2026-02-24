import { ipcMain, BrowserWindow, shell } from 'electron';
import { IPC } from '../../shared/ipc';
import type { PilotSessionManager } from '../services/pi-session-manager';
import { companionBridge } from '../services/companion-ipc-bridge';

export interface ProviderAuthInfo {
  provider: string;
  hasAuth: boolean;
  authType: 'api_key' | 'oauth' | 'env' | 'none';
}

export function registerAuthIpc(sessionManager: PilotSessionManager) {
  // List providers and their auth status
  ipcMain.handle(IPC.AUTH_GET_PROVIDERS, async () => {
    const auth = sessionManager.getAuthStorage();
    const providers = auth.list();
    return providers.map((provider) => ({
      provider,
      hasAuth: auth.hasAuth(provider),
    }));
  });

  // Check if any provider has valid auth configured
  ipcMain.handle(IPC.AUTH_GET_STATUS, async () => {
    const auth = sessionManager.getAuthStorage();
    // Check common providers
    const knownProviders = ['anthropic', 'openai', 'google'];
    const statuses: ProviderAuthInfo[] = [];

    for (const provider of knownProviders) {
      const hasAuth = auth.hasAuth(provider);
      const credential = auth.get(provider);
      let authType: ProviderAuthInfo['authType'] = 'none';

      if (credential) {
        authType = credential.type === 'oauth' ? 'oauth' : 'api_key';
      } else if (hasAuth) {
        // hasAuth can be true from env vars even without a stored credential
        authType = 'env';
      }

      statuses.push({ provider, hasAuth, authType });
    }

    // Also include any other stored providers
    const storedProviders = auth.list();
    for (const provider of storedProviders) {
      if (!knownProviders.includes(provider)) {
        const credential = auth.get(provider);
        statuses.push({
          provider,
          hasAuth: auth.hasAuth(provider),
          authType: credential?.type === 'oauth' ? 'oauth' : credential ? 'api_key' : 'none',
        });
      }
    }

    const hasAnyAuth = statuses.some(s => s.hasAuth);
    return { providers: statuses, hasAnyAuth };
  });

  // Set a persistent API key
  ipcMain.handle(IPC.AUTH_SET_API_KEY, async (_event, provider: string, apiKey: string) => {
    const auth = sessionManager.getAuthStorage();
    auth.set(provider, { type: 'api_key', key: apiKey });
    return { success: true };
  });

  // Set a runtime-only API key (not persisted)
  ipcMain.handle(IPC.AUTH_SET_RUNTIME_KEY, async (_event, provider: string, key: string) => {
    const auth = sessionManager.getAuthStorage();
    auth.setRuntimeApiKey(provider, key);
  });

  // OAuth login flow — prompt reply handling
  let pendingPromptResolve: ((value: string) => void) | null = null;

  ipcMain.handle(IPC.AUTH_OAUTH_PROMPT_REPLY, async (_event, value: string) => {
    if (pendingPromptResolve) {
      pendingPromptResolve(value);
      pendingPromptResolve = null;
    }
  });

  ipcMain.handle(IPC.AUTH_LOGIN_OAUTH, async (_event, providerId: string) => {
    const auth = sessionManager.getAuthStorage();
    const oauthProviders = auth.getOAuthProviders();
    const oauthProvider = oauthProviders.find(p => p.id === providerId);

    if (!oauthProvider) {
      throw new Error(`OAuth provider "${providerId}" not found`);
    }

    const sendEvent = (type: string, data: any) => {
      const payload = { type, providerId, ...data };
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        win.webContents.send(IPC.AUTH_LOGIN_OAUTH_EVENT, payload);
      }
      // Forward to companion clients
      try {
        companionBridge.forwardEvent(IPC.AUTH_LOGIN_OAUTH_EVENT, payload);
      } catch { /* Expected: companion bridge not initialized yet during startup */ }
    };

    try {
      await auth.login(providerId, {
        onAuth: (info) => {
          // Open the auth URL in the default browser
          shell.openExternal(info.url);
          sendEvent('auth', {
            url: info.url,
            instructions: info.instructions || 'Complete authentication in your browser.',
          });
        },
        onPrompt: async (prompt) => {
          // Send prompt to renderer and wait for user to paste the code
          sendEvent('prompt', { message: prompt.message });
          return new Promise<string>((resolve) => {
            pendingPromptResolve = resolve;
          });
        },
        onProgress: (message) => {
          sendEvent('progress', { message });
        },
      });

      sendEvent('success', {});
      return { success: true };
    } catch (error) {
      pendingPromptResolve = null;
      sendEvent('error', { message: String(error) });
      throw error;
    }
  });

  // Logout
  ipcMain.handle(IPC.AUTH_LOGOUT, async (_event, provider: string) => {
    const auth = sessionManager.getAuthStorage();
    auth.logout(provider);
    return { success: true };
  });
}
