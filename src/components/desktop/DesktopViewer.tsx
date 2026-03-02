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
import { useEffect, useRef, useState } from 'react';
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
  // TODO: The VNC password is currently passed as a URL query parameter, making it visible
  // in Electron DevTools (Network tab) and `iframe.src` reads. Consider injecting it after
  // load via noVNC's JS API (rfb.sendCredentials) using postMessage to keep it out of the URL.
  // Risk is low (local-only Docker VNC), but would be cleaner. See PR #5 review thread 4.
  const passwordParam = vncPassword ? `&password=${encodeURIComponent(vncPassword)}` : '';
  const noVncUrl = `http://localhost:${wsPort}/vnc.html?autoconnect=true&resize=scale&toolbar=0&view_only=false${passwordParam}`;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [retries, setRetries] = useState(0);
  const [ready, setReady] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Reset state when port changes (new container)
  useEffect(() => {
    setRetries(0);
    setReady(false);
    setInteractive(false);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [wsPort]);

  const handleLoad = () => {
    setReady(true);
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handleError = () => {
    if (retries >= MAX_RETRIES) return;

    const delay = Math.min(INITIAL_DELAY_MS * Math.pow(2, retries), MAX_DELAY_MS);
    timerRef.current = setTimeout(() => {
      setRetries((r) => r + 1);
      if (iframeRef.current) {
        iframeRef.current.src = '';
        requestAnimationFrame(() => {
          if (iframeRef.current) iframeRef.current.src = noVncUrl;
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
        sandbox="allow-scripts allow-same-origin allow-forms"
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

      {/* Connection spinner */}
      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-3">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-text-secondary">
            {retries >= MAX_RETRIES
              ? 'Could not connect to desktop display'
              : 'Connecting to desktop display…'}
          </p>
        </div>
      )}
    </div>
  );
}
