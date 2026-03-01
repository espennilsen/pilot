/**
 * @file Desktop header — status badge, start/stop/rebuild buttons, agent tools toggle.
 */
import { ExternalLink, Play, RefreshCw, Square, ToggleLeft, ToggleRight } from 'lucide-react';
import { useDesktopStore } from '../../stores/desktop-store';
import { useTabStore } from '../../stores/tab-store';

interface DesktopHeaderProps {
  projectPath: string;
}

const statusConfig = {
  running: { label: 'Running', dot: 'bg-success', text: 'text-success' },
  starting: { label: 'Starting…', dot: 'bg-warning animate-pulse', text: 'text-warning' },
  stopping: { label: 'Stopping…', dot: 'bg-warning animate-pulse', text: 'text-warning' },
  stopped: { label: 'Stopped', dot: 'bg-text-secondary', text: 'text-text-secondary' },
  error: { label: 'Error', dot: 'bg-error', text: 'text-error' },
} as const;

export default function DesktopHeader({ projectPath }: DesktopHeaderProps) {
  const desktopState = useDesktopStore((s) => s.stateByProject[projectPath]);
  const toolsEnabled = useDesktopStore((s) => s.toolsEnabledByProject[projectPath] ?? false);
  const isLoading = useDesktopStore((s) => s.loadingByProject[projectPath] ?? false);
  const { startDesktop, stopDesktop, rebuildDesktop, setToolsEnabled } = useDesktopStore();

  const status = desktopState?.status ?? 'stopped';
  const config = statusConfig[status] ?? statusConfig.stopped;
  const isRunning = status === 'running';
  const isStopped = status === 'stopped' && !!desktopState?.containerId;
  const isBusy = status === 'starting' || status === 'stopping' || isLoading;

  return (
    <div className="px-3 py-2 border-b border-border bg-bg-elevated flex items-center justify-between gap-2">
      {/* Status badge */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-text-primary">Desktop</span>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${config.dot}`} />
          <span className={`text-xs font-medium ${config.text}`}>{config.label}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Open in web tab */}
        {isRunning && desktopState && (
          <button
            onClick={() => {
              const url = `http://localhost:${desktopState.wsPort}/vnc.html?autoconnect=true&resize=scale&toolbar=0&view_only=false`;
              useTabStore.getState().addWebTab(url, projectPath, 'Desktop');
            }}
            className="p-1.5 hover:bg-bg-surface rounded transition-colors"
            title="Open desktop in a tab"
          >
            <ExternalLink className="w-3.5 h-3.5 text-text-secondary" />
          </button>
        )}

        {/* Rebuild button */}
        <button
          onClick={() => rebuildDesktop(projectPath)}
          disabled={isBusy}
          className="p-1.5 hover:bg-bg-surface rounded transition-colors disabled:opacity-40"
          title="Rebuild — removes container and image, rebuilds from Dockerfile"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-text-secondary ${isBusy ? 'animate-spin' : ''}`} />
        </button>

        {/* Agent tools toggle */}
        <button
          onClick={() => setToolsEnabled(projectPath, !toolsEnabled)}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors hover:bg-bg-surface"
          title={toolsEnabled
            ? 'Agent desktop tools enabled — click to disable (takes effect next conversation)'
            : 'Agent desktop tools disabled — click to enable (takes effect next conversation)'}
        >
          {toolsEnabled ? (
            <ToggleRight className="w-4 h-4 text-accent" />
          ) : (
            <ToggleLeft className="w-4 h-4 text-text-secondary" />
          )}
          <span className={toolsEnabled ? 'text-accent' : 'text-text-secondary'}>
            Tools
          </span>
        </button>

        {/* Start/Stop button */}
        {isRunning ? (
          <button
            onClick={() => stopDesktop(projectPath)}
            disabled={isBusy}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded
              bg-error/20 text-error hover:bg-error/30 transition-colors disabled:opacity-40"
          >
            <Square className="w-3.5 h-3.5" />
            Stop
          </button>
        ) : (
          <button
            onClick={() => startDesktop(projectPath)}
            disabled={isBusy}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded
              bg-success/20 text-success hover:bg-success/30 transition-colors disabled:opacity-40"
          >
            <Play className="w-3.5 h-3.5" />
            {isStopped ? 'Resume' : 'Start'}
          </button>
        )}
      </div>
    </div>
  );
}
