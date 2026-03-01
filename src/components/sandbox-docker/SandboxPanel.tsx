/**
 * @file Main sandbox panel — shows Docker sandbox state per project.
 * Displays different views depending on status: stopped, starting, running, error, no Docker.
 */
import { useEffect } from 'react';
import { Monitor, AlertCircle } from 'lucide-react';
import { useProjectStore } from '../../stores/project-store';
import { useSandboxDockerStore } from '../../stores/sandbox-docker-store';
import SandboxHeader from './SandboxHeader';
import SandboxViewer from './SandboxViewer';

export default function SandboxPanel() {
  const { projectPath } = useProjectStore();
  const { loadStatus, loadToolsEnabled, isDockerAvailable } = useSandboxDockerStore();
  const sandboxState = useSandboxDockerStore(
    (s) => projectPath ? s.stateByProject[projectPath] ?? null : null
  );
  const isLoading = useSandboxDockerStore(
    (s) => projectPath ? s.loadingByProject[projectPath] ?? false : false
  );

  // Load sandbox status when project changes
  useEffect(() => {
    if (projectPath) {
      loadStatus(projectPath);
      loadToolsEnabled(projectPath);
    }
  }, [projectPath, loadStatus, loadToolsEnabled]);

  // No project selected
  if (!projectPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 gap-4">
        <Monitor className="w-12 h-12 text-text-secondary" />
        <p className="text-sm text-text-secondary text-center">
          Open a project to use Docker sandbox
        </p>
      </div>
    );
  }

  // Docker not available
  if (isDockerAvailable === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 gap-4">
        <AlertCircle className="w-12 h-12 text-warning" />
        <div className="text-center">
          <p className="text-sm font-medium text-text-primary mb-1">Docker not found</p>
          <p className="text-xs text-text-secondary">
            Install Docker Desktop to use sandboxes.
          </p>
        </div>
      </div>
    );
  }

  const status = sandboxState?.status;

  return (
    <div className="flex flex-col h-full">
      <SandboxHeader projectPath={projectPath} />

      <div className="flex-1 overflow-hidden">
        {/* Running — show noVNC viewer */}
        {status === 'running' && sandboxState && (
          <SandboxViewer wsPort={sandboxState.wsPort} />
        )}

        {/* Starting — show spinner */}
        {status === 'starting' && (
          <div className="flex flex-col items-center justify-center h-full p-4 gap-3">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-text-secondary">Starting sandbox…</p>
          </div>
        )}

        {/* Stopping */}
        {status === 'stopping' && (
          <div className="flex flex-col items-center justify-center h-full p-4 gap-3">
            <div className="w-8 h-8 border-2 border-text-secondary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-text-secondary">Stopping sandbox…</p>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="flex flex-col items-center justify-center h-full p-4 gap-3">
            <AlertCircle className="w-10 h-10 text-error" />
            <p className="text-sm font-medium text-error">Sandbox error</p>
            {sandboxState?.error && (
              <p className="text-xs text-error/70 text-center max-w-sm">{sandboxState.error}</p>
            )}
          </div>
        )}

        {/* Stopped / no sandbox — show start prompt */}
        {(!status || status === 'stopped') && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full p-4 gap-4">
            <Monitor className="w-12 h-12 text-text-secondary" />
            <div className="text-center">
              <p className="text-sm font-medium text-text-primary mb-1">No sandbox running</p>
              <p className="text-xs text-text-secondary max-w-xs">
                Docker sandbox provides a virtual display the agent can control —
                useful for browser testing, GUI automation, and visual verification.
              </p>
            </div>
            <button
              onClick={() => useSandboxDockerStore.getState().startSandbox(projectPath)}
              className="px-4 py-2 bg-accent text-bg-base rounded hover:bg-accent/90 transition-colors text-sm font-medium"
            >
              Start Sandbox
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
