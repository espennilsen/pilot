/**
 * @file noVNC iframe wrapper — displays the desktop virtual display.
 *
 * By default the viewer is in "observe" mode: a transparent overlay blocks
 * pointer events so the user can scroll, click, and hover in Pilot without
 * accidentally interacting with the virtual desktop. A toggle lets the user
 * take control when they need to interact directly.
 *
 * The container's noVNC HTTP server may take a moment to serve pages after
 * the TCP port is open. If the iframe fails to load, we retry automatically
 * with exponential back-off until the page is ready.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, MousePointerClick } from 'lucide-react';

interface DesktopViewerProps {
  wsPort: number;
  vncPassword?: string;
}

/** Max number of reload attempts before giving up */
const MAX_RETRIES = 10;

/** Initial retry delay (ms) — doubles each attempt, capped at 4s */
const INITIAL_DELAY_MS = 500;
const MAX_DELAY_MS = 4000;

export default function DesktopViewer({ wsPort, vncPassword }: DesktopViewerProps) {
  // Use pilot-vnc.html — a custom minimal noVNC client that receives VNC
  // credentials via postMessage instead of URL query parameters, keeping
  // the password out of the address bar and Electron DevTools Frames panel.
  // Pass the parent origin so the iframe can validate message senders and
  // target its vnc-ready signal precisely.
  const parentOrigin = window.location.origin;

  // Generate a one-time token per mount. The token is embedded in the iframe
  // URL and must be echoed back in vnc-ready messages — this authenticates the
  // sender even when origin comparison is unavailable (file:// / opaque origins).
  const postMessageToken = useMemo(
    () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''),
    // Regenerate when the port changes (new container session)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wsPort],
  );

  const noVncUrl = `http://localhost:${wsPort}/pilot-vnc.html?parentOrigin=${encodeURIComponent(parentOrigin)}&token=${postMessageToken}`;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [retries, setRetries] = useState(0);
  const [ready, setReady] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const retriesRef = useRef(retries);
  retriesRef.current = retries;

  // Reset state when port changes (new container)
  useEffect(() => {
    setRetries(0);
    setReady(false);
    setInteractive(false);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [wsPort]);

  // Send VNC credentials to the iframe via postMessage after it signals readiness.
  // This avoids putting the password in the URL where it would be visible in
  // DevTools and URL-capturing logs.
  useEffect(() => {
    const origin = `http://localhost:${wsPort}`;
    const handler = (event: MessageEvent) => {
      if (event.origin !== origin || event.data?.type !== 'vnc-ready') return;
      // Verify the iframe echoed back our one-time token — this authenticates
      // the sender even when origin comparison is unavailable (file:// origins).
      if (event.data?.token !== postMessageToken) return;
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'vnc-connect', password: vncPassword, token: postMessageToken },
        origin,
      );
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [wsPort, vncPassword, postMessageToken]);

  const handleLoad = () => {
    setReady(true);
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  // Store wsPort in a ref so the retry timer callback always uses the
  // current value rather than a stale closure from a previous render.
  const wsPortRef = useRef(wsPort);
  wsPortRef.current = wsPort;

  const handleError = () => {
    // Clear any existing timer to prevent duplicate retry loops when
    // onError fires multiple times before the first timer executes.
    if (timerRef.current) clearTimeout(timerRef.current);

    // Use a ref to read the current retry count without depending on the
    // render-time closure — avoids scheduling a retry past MAX_RETRIES
    // when multiple onError events fire between renders.
    const currentRetries = retriesRef.current;
    if (currentRetries >= MAX_RETRIES) return;

    const delay = Math.min(INITIAL_DELAY_MS * Math.pow(2, currentRetries), MAX_DELAY_MS);
    timerRef.current = setTimeout(() => {
      // Re-derive the URL from the ref so a port change during the delay
      // doesn't cause the iframe to reload the previous container's page.
      const currentUrl = `http://localhost:${wsPortRef.current}/pilot-vnc.html?parentOrigin=${encodeURIComponent(parentOrigin)}&token=${postMessageToken}`;
      setRetries((r) => {
        if (r >= MAX_RETRIES) return r; // race-proof guard
        return r + 1;
      });
      if (iframeRef.current) {
        iframeRef.current.src = '';
        requestAnimationFrame(() => {
          if (iframeRef.current) iframeRef.current.src = currentUrl;
        });
      }
    }, delay);
  };

  return (
    <div className="h-full w-full bg-black relative">
      <iframe
        ref={iframeRef}
        src={noVncUrl}
        className="w-full h-full border-0"
        title="Desktop Virtual Display"
        // allow-scripts is required for the noVNC client. allow-same-origin is
        // intentionally omitted: noVNC's WebSocket connection and the
        // postMessage credential flow work without it, and the allow-scripts +
        // allow-same-origin combination lets the framed document escape sandbox
        // isolation per the HTML spec.
        sandbox="allow-scripts allow-forms"
        allow="clipboard-read; clipboard-write"
        onLoad={handleLoad}
        onError={handleError}
      />

      {/* Pointer-blocking overlay — prevents accidental interaction in observe mode */}
      {ready && !interactive && (
        <div
          className="absolute inset-0 cursor-default"
          title="Click 'Take Control' to interact with the desktop"
        />
      )}

      {/* Mode toggle — bottom-right corner */}
      {ready && (
        <div className="absolute bottom-2 right-2 z-10">
          {interactive ? (
            <button
              onClick={() => setInteractive(false)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md
                bg-accent text-bg-base shadow-lg hover:bg-accent/90 transition-colors"
              title="Switch to observe mode — block mouse interaction with the desktop"
            >
              <Eye className="w-3.5 h-3.5" />
              Observe
            </button>
          ) : (
            <button
              onClick={() => setInteractive(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md
                bg-bg-elevated/90 text-text-primary shadow-lg border border-border
                hover:bg-bg-surface transition-colors backdrop-blur-sm"
              title="Take control — interact with the desktop using mouse and keyboard"
            >
              <MousePointerClick className="w-3.5 h-3.5" />
              Take Control
            </button>
          )}
        </div>
      )}

      {/* Connection spinner / error with retry */}
      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-3">
          {retries >= MAX_RETRIES ? (
            <>
              <p className="text-sm text-text-secondary">
                Could not connect to desktop display
              </p>
              <button
                onClick={() => {
                  setRetries(0);
                  if (iframeRef.current) {
                    iframeRef.current.src = '';
                    requestAnimationFrame(() => {
                      if (iframeRef.current) iframeRef.current.src = noVncUrl;
                    });
                  }
                }}
                className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary
                  border border-border rounded hover:bg-bg-surface transition-colors"
              >
                Retry Connection
              </button>
            </>
          ) : (
            <>
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-text-secondary">
                Connecting to desktop display…
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
