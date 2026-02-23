import { useUIStore } from '../../stores/ui-store';
import { useProjectStore } from '../../stores/project-store';
import { Icon } from '../shared/Icon';
import appIcon from '../../assets/icon-48.png';

/**
 * Companion-mode title bar — slim bar with app title and project name.
 * The hamburger menu has moved to the Sidebar activity bar.
 */
export function CompanionTitleBar() {
  const { openSettings } = useUIStore();
  const { projectPath } = useProjectStore();

  const projectName = projectPath ? projectPath.split('/').pop() : null;

  return (
    <div className="bg-bg-surface border-b border-border flex items-center px-2 select-none relative h-[38px] pt-[env(safe-area-inset-top)]" style={{ minHeight: 'calc(38px + env(safe-area-inset-top, 0px))' }}>
      {/* Left spacer to keep center alignment */}
      <div className="w-8" />

      {/* Center - app title + project */}
      <div className="flex-1 flex items-center justify-center gap-1.5">
        <img src={appIcon} alt="" className="w-4 h-4" draggable={false} />
        <span className="text-text-secondary text-xs font-medium">Pilot</span>
        {projectName && (
          <>
            <span className="text-text-secondary/40 text-xs">—</span>
            <span className="text-text-primary text-xs font-medium truncate max-w-[200px]">{projectName}</span>
          </>
        )}
      </div>

      {/* Right side - quick actions */}
      <button
        onClick={() => openSettings()}
        className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-bg-elevated transition-colors"
        aria-label="Settings"
      >
        <Icon name="Settings" className="w-4 h-4 text-text-secondary" />
      </button>
    </div>
  );
}
