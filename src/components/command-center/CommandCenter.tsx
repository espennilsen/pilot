import { useState, useEffect } from 'react';
import { useDevCommandStore } from '../../stores/dev-command-store';
import { useAppSettingsStore } from '../../stores/app-settings-store';
import { useProjectStore } from '../../stores/project-store';
import { Icon } from '../shared/Icon';
import { CommandButton } from './CommandButton';

export function CommandCenter() {
  const { commands, loadCommands } = useDevCommandStore();
  const developerMode = useAppSettingsStore(s => s.developerMode);
  const projectPath = useProjectStore(s => s.projectPath);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (developerMode && projectPath) {
      loadCommands(projectPath);
    }
  }, [developerMode, projectPath, loadCommands]);

  if (!developerMode) return null;

  return (
    <div className="border-t border-border">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-4 py-2 flex items-center justify-between hover:bg-bg-elevated transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon name="Zap" className="w-4 h-4 text-accent" />
          <span className="text-sm font-semibold text-text-primary">Command Center</span>
        </div>
        <Icon
          name={collapsed ? 'ChevronDown' : 'ChevronUp'}
          className="w-4 h-4 text-text-secondary"
        />
      </button>

      {/* Commands List */}
      {!collapsed && (
        <div className="px-2 py-2 space-y-1">
          {commands.map((command) => (
            <CommandButton key={command.id} command={command} />
          ))}
        </div>
      )}
    </div>
  );
}
