/**
 * @file Main desktop panel — shows Desktop state per project.
 * Displays different views depending on status: stopped, starting, running, error, no Desktop.
 */
import { useEffect } from 'react';
import { Monitor, AlertCircle } from 'lucide-react';
import { useProjectStore } from '../../stores/project-store';
import { useDesktopStore } from '../../stores/desktop-store';
import DesktopHeader from './DesktopHeader';
import DesktopViewer from './DesktopViewer';

export default function DesktopPanel() {
  const { projectPath } = useProjectStore();
  const { loadStatus, loadToolsEnabled, checkDesktopAvailable, isDesktopAvailable, desktopUnavailableMessage } = useDesktopStore();
  const desktopState = useDesktopStore(
    (s) => projectPath ? s.stateByProject[projectPath] ?? null : null
  );
  const isLoading = useDesktopStore(
    (s) => projectPath ? s.loadingByProject[projectPath] ?? false : false
  );

  // Check Desktop availability and load desktop status when project changes
  useEffect(() => {
    if (projectPath) {
      checkDesktopAvailable();
      loadStatus(projectPath);
      loadToolsEnabled(projectPath);
    }
  }, [projectPath, checkDesktopAvailable, loadStatus, loadToolsEnabled]);

  // No project selected
  if (!projectPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 gap-4">
        <Monitor className="w-12 h-12 text-text-secondary" />
        <p className="text-sm text-text-secondary text-center">
          Open a project to use Desktop
        </p>
      </div>
    );
  }

  // Desktop availability not yet checked — show spinner
  if (isDesktopAvailable === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Desktop not available
  if (isDesktopAvailable === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 gap-4">
        <AlertCircle className="w-12 h-12 text-warning" />
        <div className="text-center">
          <p className="text-sm font-medium text-text-primary mb-1">Desktop not available</p>
          <p className="text-xs text-text-secondary max-w-xs">
            {desktopUnavailableMessage ?? 'Install Docker Desktop to use desktop environments.'}
          </p>
        </div>
        <button
          onClick={() => checkDesktopAvailable()}
          className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary border border-border rounded hover:bg-bg-surface transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const status = desktopState?.status;

  return (
    <div className="flex flex-col h-full">
      <DesktopHeader projectPath={projectPath} />

      <div className="flex-1 overflow-hidden">
        {/* Running — show noVNC viewer */}
        {status === 'running' && desktopState && (
          <DesktopViewer wsPort={desktopState.wsPort} vncPassword={desktopState.vncPassword} />
        )}

        {/* Starting — show spinner */}
        {status === 'starting' && (
          <div className="flex flex-col items-center justify-center h-full p-4 gap-3">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-text-secondary">Starting desktop…</p>
          </div>
        )}

        {/* Stopping */}
        {status === 'stopping' && (
          <div className="flex flex-col items-center justify-center h-full p-4 gap-3">
            <div className="w-8 h-8 border-2 border-text-secondary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-text-secondary">Stopping desktop…</p>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="flex flex-col items-center justify-center h-full p-4 gap-3">
            <AlertCircle className="w-10 h-10 text-error" />
            <p className="text-sm font-medium text-error">Desktop error</p>
            {desktopState?.error && (
              <p className="text-xs text-error/70 text-center max-w-sm">{desktopState.error}</p>
            )}
          </div>
        )}

        {/* Stopped container — can resume */}
        {status === 'stopped' && desktopState?.containerId && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full p-4 gap-4">
            <Monitor className="w-12 h-12 text-text-secondary" />
            <div className="text-center">
              <p className="text-sm font-medium text-text-primary mb-1">Desktop stopped</p>
              <p className="text-xs text-text-secondary max-w-xs">
                The container is preserved. Resume to continue where you left off,
                or rebuild to start fresh from the Dockerfile.
              </p>
            </div>
            <button
              onClick={() => useDesktopStore.getState().startDesktop(projectPath)}
              className="px-4 py-2 bg-accent text-bg-base rounded hover:bg-accent/90 transition-colors text-sm font-medium"
            >
              Resume Desktop
            </button>
          </div>
        )}

        {/* No container at all — show start prompt */}
        {(!status || (status === 'stopped' && !desktopState?.containerId)) && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full p-4 gap-4">
            <Monitor className="w-12 h-12 text-text-secondary" />
            <div className="text-center">
              <p className="text-sm font-medium text-text-primary mb-1">No desktop running</p>
              <p className="text-xs text-text-secondary max-w-xs">
                Desktop provides a virtual display the agent can control —
                useful for browser testing, GUI automation, and visual verification.
              </p>
            </div>
            <button
              onClick={() => useDesktopStore.getState().startDesktop(projectPath)}
              className="px-4 py-2 bg-accent text-bg-base rounded hover:bg-accent/90 transition-colors text-sm font-medium"
            >
              Start Desktop
            </button>
          </div>
        )}

        {/* Loading initial status */}
        {isLoading && !status && (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
