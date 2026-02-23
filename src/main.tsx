import React, { useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import App from './app';
import { CompanionPairingScreen } from './components/companion/CompanionPairingScreen';
import { initCompanionPolyfill, isCompanionMode, isCompanionConnected } from './lib/ipc-client';
import './styles/globals.css';

// In companion mode (browser / WKWebView), polyfill window.api
// before any React components try to use IPC
initCompanionPolyfill();

/**
 * Root component that gates the app behind companion pairing.
 * In Electron: renders App directly.
 * In companion mode with token: renders App (WS connected).
 * In companion mode without token: renders pairing screen only.
 */
function Root() {
  const [paired, setPaired] = useState(() => !isCompanionMode() || isCompanionConnected());

  const handlePaired = useCallback(() => {
    // Re-run polyfill now that we have a token in sessionStorage
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
