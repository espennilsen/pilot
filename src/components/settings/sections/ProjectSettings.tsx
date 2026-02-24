import { useSandboxStore } from '../../../stores/sandbox-store';
import { Shield, Zap } from 'lucide-react';
import { SettingRow, Toggle } from '../settings-helpers';

export function ProjectSettings() {
  const { jailEnabled, yoloMode, setJailEnabled, setYoloMode } = useSandboxStore();

  return (
    <div className="p-5 space-y-6">
      <SettingRow
        icon={<Shield className="w-4 h-4 text-success" />}
        label="Project Jail"
        description="When enabled, the agent can only read and write files within the project directory. Paths outside the project root are blocked."
      >
        <Toggle checked={jailEnabled} onChange={setJailEnabled} />
      </SettingRow>

      <SettingRow
        icon={<Zap className="w-4 h-4 text-warning" />}
        label="Yolo Mode"
        description="When enabled, file changes are applied immediately without review. Use with caution."
      >
        <Toggle
          checked={yoloMode}
          onChange={setYoloMode}
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
