/**
 * @file noVNC iframe wrapper — displays the desktop virtual display.
 *
 * The container's noVNC HTTP server may take a moment to serve pages after
 * the TCP port is open. If the iframe fails to load, we retry automatically
 * with exponential back-off until the page is ready.
 */
import { useEffect, useRef, useState } from 'react';

interface DesktopViewerProps {
  wsPort: number;
}

/** Max number of reload attempts before giving up */
const MAX_RETRIES = 10;

/** Initial retry delay (ms) — doubles each attempt, capped at 4s */
const INITIAL_DELAY_MS = 500;
const MAX_DELAY_MS = 4000;

export default function DesktopViewer({ wsPort }: DesktopViewerProps) {
  const noVncUrl = `http://localhost:${wsPort}/vnc.html?autoconnect=true&resize=scale&toolbar=0&view_only=false`;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [retries, setRetries] = useState(0);
  const [ready, setReady] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Reset state when port changes (new container)
  useEffect(() => {
    setRetries(0);
    setReady(false);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [wsPort]);

  const handleLoad = () => {
    // The iframe loaded something — if it was an error page the src would
    // have been reset to about:blank by the browser. A successful load means
    // noVNC responded with actual content.
    setReady(true);
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handleError = () => {
    if (retries >= MAX_RETRIES) return;

    const delay = Math.min(INITIAL_DELAY_MS * Math.pow(2, retries), MAX_DELAY_MS);
    timerRef.current = setTimeout(() => {
      setRetries((r) => r + 1);
      // Force iframe to retry by cycling the src
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
