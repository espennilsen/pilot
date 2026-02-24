import { useProjectStore } from '../../../stores/project-store';
import { FolderOpen, CheckCircle } from 'lucide-react';
import { shortcutLabel } from '../../../lib/keybindings';

// ─── ProjectStep Component ───────────────────────────────────────────────

export default function ProjectStep() {
  const { projectPath, openProjectDialog } = useProjectStore();

  return (
    <div className="space-y-6">
      <p className="text-xs text-text-secondary">
        Open a project to start working. The agent will have access to files and can run commands within the project directory.
      </p>

      <div className="flex flex-col items-center gap-4 py-8">
        {projectPath ? (
          <>
            <div className="w-14 h-14 rounded-xl bg-success/20 flex items-center justify-center">
              <CheckCircle className="w-7 h-7 text-success" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-text-primary">Project opened</p>
              <p className="text-xs text-text-secondary font-mono mt-1">{projectPath}</p>
            </div>
            <button
              onClick={openProjectDialog}
              className="text-xs text-accent hover:text-accent/80 transition-colors"
            >
              Choose a different project
            </button>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-xl bg-bg-surface border-2 border-dashed border-border flex items-center justify-center">
              <FolderOpen className="w-7 h-7 text-text-secondary" />
            </div>
            <button
              onClick={openProjectDialog}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-accent hover:bg-accent/90 rounded-md transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              Open Project
            </button>
            <p className="text-[10px] text-text-secondary/40">
              You can also use {shortcutLabel('N', true)} to open a project anytime
            </p>
          </>
        )}
      </div>
    </div>
  );
}
