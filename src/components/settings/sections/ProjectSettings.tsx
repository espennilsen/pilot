import { useState } from 'react';
import { useSandboxStore } from '../../../stores/sandbox-store';
import { useTabStore } from '../../../stores/tab-store';
import { useProjectStore } from '../../../stores/project-store';
import { Shield, Zap, FolderPlus, X } from 'lucide-react';
import { SettingRow, Toggle } from '../settings-helpers';

export function ProjectSettings() {
  const { jailEnabled, yoloMode, allowedPaths, updateSettings } = useSandboxStore();
  const activeTab = useTabStore((s) => s.tabs.find(t => t.id === s.activeTabId));
  const projectPath = useProjectStore((s) => s.projectPath);
  const [newPath, setNewPath] = useState('');

  const tabId = activeTab?.id ?? '';
  const pp = activeTab?.projectPath ?? projectPath ?? '';

  const handleJailToggle = (enabled: boolean) => {
    if (pp) updateSettings(pp, tabId, { jail: { enabled } });
  };

  const handleYoloToggle = (enabled: boolean) => {
    if (pp) updateSettings(pp, tabId, { yoloMode: enabled });
  };

  const handleAddPath = () => {
    const trimmed = newPath.trim();
    if (!trimmed || !pp) return;
    if (allowedPaths.includes(trimmed)) {
      setNewPath('');
      return;
    }
    updateSettings(pp, tabId, { jail: { allowedPaths: [...allowedPaths, trimmed] } });
    setNewPath('');
  };

  const handleRemovePath = (pathToRemove: string) => {
    if (!pp) return;
    updateSettings(pp, tabId, { jail: { allowedPaths: allowedPaths.filter(p => p !== pathToRemove) } });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddPath();
    }
  };

  return (
    <div className="p-5 space-y-6">
      {!pp && (
        <div className="p-3 bg-bg-surface border border-border rounded-md">
          <p className="text-xs text-text-tertiary">
            No project open. Open a project to configure sandbox settings.
          </p>
        </div>
      )}

      <SettingRow
        icon={<Shield className="w-4 h-4 text-success" />}
        label="Project Jail"
        description="Restricts the agent to the project directory. All file reads, writes, and bash commands that reference paths outside the project root are blocked."
      >
        <Toggle checked={jailEnabled} onChange={handleJailToggle} />
      </SettingRow>

      {/* Allowed Paths — only shown when jail is enabled */}
      {jailEnabled && (
        <div className="ml-9 space-y-3">
          <div>
            <p className="text-xs text-text-secondary mb-1">Allowed Paths</p>
            <p className="text-xs text-text-tertiary mb-3">
              External directories the agent is allowed to access when jail is enabled.
              Use ~ for home directory. Stored in <code className="text-text-secondary">.pilot/settings.json</code>.
            </p>
          </div>

          {allowedPaths.length > 0 && (
            <div className="space-y-1">
              {allowedPaths.map((path) => (
                <div
                  key={path}
                  className="flex items-center gap-2 px-3 py-1.5 bg-bg-surface border border-border rounded-md group"
                >
                  <code className="flex-1 text-xs text-text-secondary truncate" title={path}>
                    {path}
                  </code>
                  <button
                    onClick={() => handleRemovePath(path)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-text-tertiary hover:text-error transition-all"
                    title="Remove path"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="~/shared-libs or /data/datasets"
              className="flex-1 px-3 py-1.5 bg-bg-base border border-border rounded-md text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent"
            />
            <button
              onClick={handleAddPath}
              disabled={!newPath.trim()}
              className="flex items-center gap-1 px-3 py-1.5 bg-bg-surface hover:bg-bg-elevated border border-border rounded-md text-xs text-text-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>
        </div>
      )}

      <SettingRow
        icon={<Zap className="w-4 h-4 text-warning" />}
        label="Yolo Mode"
        description="When enabled, file changes are applied immediately without review. Use with caution."
      >
        <Toggle
          checked={yoloMode}
          onChange={handleYoloToggle}
          activeColor="bg-warning"
        />
      </SettingRow>

      {yoloMode && (
        <div className="ml-9 p-3 bg-warning/10 border border-warning/30 rounded-md">
          <p className="text-xs text-warning">
            ⚠ Changes will be applied immediately without review. Make sure you have version control enabled.
          </p>
        </div>
      )}
    </div>
  );
}
