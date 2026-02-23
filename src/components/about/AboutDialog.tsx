import { useEffect, useCallback, useState } from 'react';
import { X, ExternalLink, Github, Mail } from 'lucide-react';
import { useUIStore } from '../../stores/ui-store';

// App version from package.json (injected by vite)
const APP_VERSION = __APP_VERSION__ ?? '0.1.0';
const GIT_SHA = typeof __GIT_SHA__ !== 'undefined' ? __GIT_SHA__ : '';

export function AboutDialog() {
  const { aboutOpen, closeAbout } = useUIStore();
  const [electronVersion, setElectronVersion] = useState('');
  const [chromeVersion, setChromeVersion] = useState('');
  const [nodeVersion, setNodeVersion] = useState('');

  useEffect(() => {
    if (aboutOpen) {
      // Electron exposes process.versions in renderer
      setElectronVersion(window.electronVersions?.electron ?? '');
      setChromeVersion(window.electronVersions?.chrome ?? '');
      setNodeVersion(window.electronVersions?.node ?? '');
    }
  }, [aboutOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') closeAbout();
    },
    [closeAbout]
  );

  if (!aboutOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeAbout();
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="bg-bg-surface border border-border rounded-lg shadow-xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary">About Pilot</h2>
          <button
            onClick={closeAbout}
            className="p-1 hover:bg-bg-elevated rounded transition-colors"
          >
            <X className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-5 space-y-5">
          {/* App identity */}
          <div className="text-center">
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">Pilot</h1>
            <p className="text-sm text-text-secondary mt-1">
              Interactive Agentic Environment (IAE)
            </p>
            {GIT_SHA ? (
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  window.api?.openExternal?.(`https://github.com/espennilsen/pilot/commit/${GIT_SHA}`);
                }}
                className="inline-block mt-2 px-2.5 py-0.5 text-xs font-mono bg-bg-elevated text-accent rounded-full hover:bg-accent/10 transition-colors cursor-pointer"
                title="View commit on GitHub"
              >
                {GIT_SHA}
              </a>
            ) : (
              <span className="inline-block mt-2 px-2.5 py-0.5 text-xs font-mono bg-bg-elevated text-accent rounded-full">
                v{APP_VERSION}
              </span>
            )}
          </div>

          {/* Author */}
          <div className="bg-bg-base rounded-lg p-3 space-y-1.5">
            <div className="text-xs text-text-secondary uppercase tracking-wider font-medium">Author</div>
            <div className="text-sm font-medium text-text-primary">Espen Nilsen</div>
            <div className="flex items-center gap-3">
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  window.api?.openExternal?.('mailto:hi@e9n.dev');
                }}
                className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
              >
                <Mail className="w-3 h-3" />
                hi@e9n.dev
              </a>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  window.api?.openExternal?.('https://e9n.dev');
                }}
                className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                e9n.dev
              </a>
            </div>
          </div>

          {/* License */}
          <div className="bg-bg-base rounded-lg p-3">
            <div className="text-xs text-text-secondary uppercase tracking-wider font-medium mb-1">License</div>
            <div className="text-sm text-text-primary">MIT License</div>
          </div>

          {/* System info */}
          <div className="bg-bg-base rounded-lg p-3">
            <div className="text-xs text-text-secondary uppercase tracking-wider font-medium mb-1.5">System</div>
            <div className="grid grid-cols-2 gap-y-1 text-xs">
              {electronVersion && (
                <>
                  <span className="text-text-secondary">Electron</span>
                  <span className="text-text-primary font-mono">{electronVersion}</span>
                </>
              )}
              {chromeVersion && (
                <>
                  <span className="text-text-secondary">Chrome</span>
                  <span className="text-text-primary font-mono">{chromeVersion}</span>
                </>
              )}
              {nodeVersion && (
                <>
                  <span className="text-text-secondary">Node.js</span>
                  <span className="text-text-primary font-mono">{nodeVersion}</span>
                </>
              )}
              <span className="text-text-secondary">Platform</span>
              <span className="text-text-primary font-mono">{navigator.platform}</span>
            </div>
          </div>

          {/* Links */}
          <div className="flex items-center justify-center gap-4">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.api?.openExternal?.('https://github.com/espennilsen/pilot');
              }}
              className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              <Github className="w-3.5 h-3.5" />
              GitHub
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border text-center">
          <p className="text-[10px] text-text-secondary">
            MIT License · Built with Pi SDK · Electron · React
          </p>
        </div>
      </div>
    </div>
  );
}
