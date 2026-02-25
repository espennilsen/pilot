import { useState } from 'react';
import { ExternalLink, Shield } from 'lucide-react';
import { useUIStore } from '../../stores/ui-store';

/**
 * Confirmation dialog shown when the agent wants to open a URL in the browser.
 * Offers "Open", "Always Allow", and "Cancel" options.
 */
export function UrlConfirmDialog() {
  const { urlConfirmation, dismissUrlConfirmation, setUrlAlwaysAllow } = useUIStore();
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);

  if (!urlConfirmation) return null;

  const { url, title } = urlConfirmation;

  const handleOpen = () => {
    window.api?.openExternal?.(url);
    dismissUrlConfirmation();
  };

  const handleAlwaysAllow = () => {
    setUrlAlwaysAllow(true);
    window.api?.openExternal?.(url);
    dismissUrlConfirmation();
  };

  const handleCancel = () => {
    dismissUrlConfirmation();
  };

  // Truncate long URLs for display
  const displayUrl = url.length > 80 ? url.slice(0, 77) + '…' : url;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCancel} />
      <div className="relative bg-bg-elevated border border-border rounded-lg shadow-2xl w-[440px] max-w-[90vw] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center">
            <ExternalLink className="w-4.5 h-4.5 text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Open in Browser</h3>
            <p className="text-xs text-text-secondary">The agent wants to open a link</p>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-3">
          {title && (
            <p className="text-sm text-text-primary">{title}</p>
          )}
          <div className="px-3 py-2 bg-bg-base border border-border rounded text-xs font-mono text-text-secondary break-all">
            {displayUrl}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-bg-surface">
          <button
            onClick={handleAlwaysAllow}
            onMouseEnter={() => setHoveredButton('always')}
            onMouseLeave={() => setHoveredButton(null)}
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            <Shield className="w-3.5 h-3.5" />
            {hoveredButton === 'always' ? 'Auto-open URLs this session' : 'Always allow'}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleOpen}
              className="px-3 py-1.5 text-sm font-medium text-bg-base bg-accent hover:bg-accent/90 rounded transition-colors"
            >
              Open
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
