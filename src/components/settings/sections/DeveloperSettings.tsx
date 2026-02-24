import { useAppSettingsStore } from '../../../stores/app-settings-store';
import { useDevCommandStore } from '../../../stores/dev-command-store';
import { useProjectStore } from '../../../stores/project-store';
import { useEffect, useState } from 'react';
import { Code, Zap, Terminal, Plus, Trash2, Edit3, Check, XCircle } from 'lucide-react';
import { SettingRow, Toggle } from '../settings-helpers';
import type { DevCommand } from '../../../../shared/types';

export function DeveloperSettings() {
  const { developerMode, setDeveloperMode, autoStartDevServer, setAutoStartDevServer } = useAppSettingsStore();
  const { commands, loadCommands, saveCommands } = useDevCommandStore();
  const projectPath = useProjectStore(s => s.projectPath);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ label: string; command: string; icon: string }>({ label: '', command: '', icon: 'Terminal' });
  const [addingNew, setAddingNew] = useState(false);
  const [newForm, setNewForm] = useState<{ label: string; command: string; icon: string }>({ label: '', command: '', icon: 'Terminal' });

  useEffect(() => {
    if (developerMode && projectPath) {
      loadCommands(projectPath);
    }
  }, [developerMode, projectPath, loadCommands]);

  const handleSave = (updated: DevCommand[]) => {
    if (projectPath) {
      saveCommands(projectPath, updated);
    }
  };

  const startEdit = (cmd: DevCommand) => {
    setEditingId(cmd.id);
    setEditForm({ label: cmd.label, command: cmd.command, icon: cmd.icon });
  };

  const saveEdit = () => {
    if (!editingId) return;
    const updated = commands.map(c =>
      c.id === editingId ? { ...c, label: editForm.label, command: editForm.command, icon: editForm.icon } : c
    );
    handleSave(updated);
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  const deleteCommand = (id: string) => {
    handleSave(commands.filter(c => c.id !== id));
  };

  const addCommand = () => {
    if (!newForm.label.trim() || !newForm.command.trim()) return;
    const id = newForm.label.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
    const cmd: DevCommand = {
      id,
      label: newForm.label.trim(),
      command: newForm.command.trim(),
      icon: newForm.icon || 'Terminal',
      cwd: './',
      env: {},
      persistent: false,
    };
    handleSave([...commands, cmd]);
    setNewForm({ label: '', command: '', icon: 'Terminal' });
    setAddingNew(false);
  };

  return (
    <div className="p-5 space-y-6">
      <SettingRow
        icon={<Code className="w-4 h-4 text-accent" />}
        label="Developer Mode"
        description="Show the Command Center in the sidebar for quick access to dev server, tests, and lint commands."
      >
        <Toggle checked={developerMode} onChange={setDeveloperMode} />
      </SettingRow>

      {developerMode && (
        <>
          <SettingRow
            icon={<Zap className="w-4 h-4 text-accent" />}
            label="Auto-start dev server"
            description="Automatically start persistent dev commands when opening a project on launch."
          >
            <Toggle checked={autoStartDevServer} onChange={setAutoStartDevServer} />
          </SettingRow>

          {/* Commands list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-text-primary">Commands</span>
              </div>
              <button
                onClick={() => setAddingNew(true)}
                className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Command
              </button>
            </div>
            <p className="text-xs text-text-secondary ml-6">
              Configure commands shown in the Command Center. Saved per-project in <code className="text-[11px] bg-bg-surface px-1 rounded">.pilot/commands.json</code>.
            </p>

            <div className="ml-6 space-y-1.5">
              {commands.map((cmd) => (
                <div key={cmd.id} className="bg-bg-surface border border-border rounded-md">
                  {editingId === cmd.id ? (
                    /* Edit mode */
                    <div className="p-3 space-y-2">
                      <input
                        type="text"
                        value={editForm.label}
                        onChange={(e) => setEditForm(f => ({ ...f, label: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                        className="w-full text-xs bg-bg-base border border-border rounded px-2 py-1.5 text-text-primary focus:outline-none focus:border-accent"
                        placeholder="Label"
                        autoFocus
                      />
                      <input
                        type="text"
                        value={editForm.command}
                        onChange={(e) => setEditForm(f => ({ ...f, command: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                        className="w-full text-xs font-mono bg-bg-base border border-border rounded px-2 py-1.5 text-text-primary focus:outline-none focus:border-accent"
                        placeholder="Command (e.g. npm run dev)"
                      />
                      <div className="flex justify-end gap-1.5">
                        <button onClick={cancelEdit} className="p-1 hover:bg-bg-elevated rounded transition-colors">
                          <XCircle className="w-3.5 h-3.5 text-text-secondary" />
                        </button>
                        <button onClick={saveEdit} className="p-1 hover:bg-bg-elevated rounded transition-colors">
                          <Check className="w-3.5 h-3.5 text-success" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Display mode */
                    <div className="flex items-center gap-2 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-text-primary">{cmd.label}</div>
                        <div className="text-[11px] font-mono text-text-secondary truncate">{cmd.command}</div>
                      </div>
                      <button onClick={() => startEdit(cmd)} className="p-1 hover:bg-bg-elevated rounded transition-colors">
                        <Edit3 className="w-3 h-3 text-text-secondary" />
                      </button>
                      <button onClick={() => deleteCommand(cmd.id)} className="p-1 hover:bg-bg-elevated rounded transition-colors">
                        <Trash2 className="w-3 h-3 text-error/60 hover:text-error" />
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {/* Add new command form */}
              {addingNew && (
                <div className="bg-bg-surface border border-accent/30 rounded-md p-3 space-y-2">
                  <input
                    type="text"
                    value={newForm.label}
                    onChange={(e) => setNewForm(f => ({ ...f, label: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && addCommand()}
                    className="w-full text-xs bg-bg-base border border-border rounded px-2 py-1.5 text-text-primary focus:outline-none focus:border-accent"
                    placeholder="Label (e.g. Build)"
                    autoFocus
                  />
                  <input
                    type="text"
                    value={newForm.command}
                    onChange={(e) => setNewForm(f => ({ ...f, command: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && addCommand()}
                    className="w-full text-xs font-mono bg-bg-base border border-border rounded px-2 py-1.5 text-text-primary focus:outline-none focus:border-accent"
                    placeholder="Command (e.g. npm run build)"
                  />
                  <div className="flex justify-end gap-1.5">
                    <button
                      onClick={() => { setAddingNew(false); setNewForm({ label: '', command: '', icon: 'Terminal' }); }}
                      className="text-xs px-2 py-1 text-text-secondary hover:text-text-primary transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={addCommand}
                      disabled={!newForm.label.trim() || !newForm.command.trim()}
                      className="text-xs px-2 py-1 bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}

              {commands.length === 0 && !addingNew && (
                <p className="text-xs text-text-secondary italic py-2">No commands configured.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
