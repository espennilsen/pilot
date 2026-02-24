import { useDevCommandStore } from '../../stores/dev-command-store';
import { useOutputWindowStore } from '../../stores/output-window-store';
import { Icon } from '../shared/Icon';
import type { DevCommand } from '../../../shared/types';
import { IPC } from '../../../shared/ipc';
import { invoke } from '../../lib/ipc-client';

interface CommandButtonProps {
  command: DevCommand;
}

export function CommandButton({ command }: CommandButtonProps) {
  const { states, tunnelUrls, runCommand, stopCommand } = useDevCommandStore();
  const { openOutput } = useOutputWindowStore();
  const state = states[command.id] || { status: 'idle' };
  const detectedUrl = state.detectedUrl;
  const tunnelUrl = tunnelUrls[command.id];

  const handleClick = async () => {
    if (state.status === 'running') {
      await stopCommand(command.id);
    } else {
      await runCommand(command.id);
      openOutput(command.id);
    }
  };

  const handleOpenOutput = () => {
    openOutput(command.id);
  };

  const handleOpenUrl = async (url: string) => {
    try {
      await invoke(IPC.COMPANION_OPEN_TUNNEL, url);
    } catch { /* Expected: primary open method may not be available */
      // Fallback: use shell:open-external or window.open
      try {
        await invoke('shell:open-external', url);
      } catch { /* Expected: fallback open method may also fail */
        window.open(url, '_blank');
      }
    }
  };

  return (
    <div className="rounded-sm overflow-hidden">
      <div className="flex items-center gap-1">
        {/* Main button */}
        <button
          onClick={handleClick}
          className="flex-1 px-3 py-2 flex items-center gap-2 hover:bg-bg-elevated transition-colors rounded-sm"
        >
          <Icon name={command.icon} className="w-4 h-4 text-text-secondary" />
          <span className="text-sm text-text-primary flex-1 text-left">{command.label}</span>
          <StatusBadge status={state.status} />
        </button>

        {/* Open detected URL */}
        {state.status === 'running' && detectedUrl && (
          <button
            onClick={() => handleOpenUrl(tunnelUrl || detectedUrl)}
            className="px-2 py-2 hover:bg-bg-elevated transition-colors rounded-sm group"
            title={tunnelUrl ? `Open tunnel: ${tunnelUrl}` : `Open: ${detectedUrl}`}
          >
            <Icon
              name="Globe"
              className="w-3.5 h-3.5 text-accent group-hover:text-accent-hover"
            />
          </button>
        )}

        {/* Open output button */}
        {(state.status !== 'idle' || state.output) && (
          <button
            onClick={handleOpenOutput}
            className="px-2 py-2 hover:bg-bg-elevated transition-colors rounded-sm"
            title="Open output window"
          >
            <Icon
              name="ExternalLink"
              className="w-3 h-3 text-text-secondary"
            />
          </button>
        )}
      </div>

      {/* Tunnel URL badge */}
      {state.status === 'running' && tunnelUrl && (
        <div className="px-3 pb-1.5">
          <button
            onClick={() => handleOpenUrl(tunnelUrl)}
            className="text-xs text-accent hover:text-accent-hover hover:underline truncate block max-w-full text-left"
            title={`Open in browser: ${tunnelUrl}`}
          >
            🌐 {tunnelUrl}
          </button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'running':
      return (
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-xs text-success">Running</span>
        </div>
      );
    case 'passed':
      return (
        <div className="flex items-center gap-1">
          <Icon name="CheckCircle" className="w-3 h-3 text-success" />
          <span className="text-xs text-success">Passed</span>
        </div>
      );
    case 'failed':
      return (
        <div className="flex items-center gap-1">
          <Icon name="XCircle" className="w-3 h-3 text-error" />
          <span className="text-xs text-error">Failed</span>
        </div>
      );
    default:
      return (
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-text-secondary opacity-30" />
          <span className="text-xs text-text-secondary">Idle</span>
        </div>
      );
  }
}
