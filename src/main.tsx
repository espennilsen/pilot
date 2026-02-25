import React, { useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import App from './app';
import { CompanionPairingScreen } from './components/companion/CompanionPairingScreen';
import { initCompanionPolyfill, isCompanionMode, isCompanionConnected } from './lib/ipc-client';
import { initDevCommandListeners } from './stores/dev-command-store';
import { initTunnelOutputListeners } from './stores/tunnel-output-store';
import './styles/globals.css';
import { applyThemeEarly } from './hooks/useTheme';

// Apply theme before React mounts to prevent a flash of wrong theme
applyThemeEarly();

// In companion mode (browser / WKWebView), polyfill window.api
// before any React components try to use IPC
initCompanionPolyfill();

// Register store-level IPC listeners now that window.api is guaranteed to exist
// (either from Electron preload or the companion polyfill above).
initDevCommandListeners();
initTunnelOutputListeners();

/**
 * Root component that gates the app behind companion pairing.
 * In Electron: renders App directly.
 * In companion mode with token: renders App (WS connected).
 * In companion mode without token: renders pairing screen only.
 */
function Root() {
  const [paired, setPaired] = useState(() => !isCompanionMode() || isCompanionConnected());

  const handlePaired = useCallback(() => {
    // Re-run polyfill now that we have a token in localStorage
    initCompanionPolyfill();
    setPaired(true);
  }, []);

  if (!paired) {
    return <CompanionPairingScreen onPaired={handlePaired} />;
  }

  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
