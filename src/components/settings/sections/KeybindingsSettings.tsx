import { useAppSettingsStore } from '../../../stores/app-settings-store';
import { useEffect, useState } from 'react';
import { RotateCw, XCircle } from 'lucide-react';
import { DEFAULT_KEYBINDINGS, getEffectiveCombo, comboToParts } from '../../../lib/keybindings';
import { isMac } from '../settings-helpers';

export function KeybindingsSettings() {
  const { keybindOverrides, setKeybindOverride, clearKeybindOverride, load: loadSettings } = useAppSettingsStore();
  const [recordingId, setRecordingId] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Capture keys when recording
  useEffect(() => {
    if (!recordingId) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Ignore bare modifier keys
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return;

      const mods: string[] = [];
      if (e.metaKey || (!isMac() && e.ctrlKey)) mods.push('meta');
      if (isMac() && e.ctrlKey) mods.push('ctrl');
      if (e.altKey) mods.push('alt');
      if (e.shiftKey) mods.push('shift');

      // Escape cancels recording
      if (e.key === 'Escape' && mods.length === 0) {
        setRecordingId(null);
        return;
      }

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const combo = [...mods, key].join('+');
      setKeybindOverride(recordingId, combo);
      setRecordingId(null);
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [recordingId, setKeybindOverride]);

  const hasAnyOverrides = Object.keys(keybindOverrides).length > 0;

  // Group by category
  const grouped = DEFAULT_KEYBINDINGS.reduce<Record<string, typeof DEFAULT_KEYBINDINGS>>((acc, def) => {
    (acc[def.category] ??= []).push(def);
    return acc;
  }, {});

  return (
    <div className="p-5 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-secondary">
          Click a shortcut to rebind. Press <kbd className="px-1.5 py-0.5 bg-bg-elevated border border-border rounded text-[10px] font-mono">Esc</kbd> to cancel.
        </p>
        {hasAnyOverrides && (
          <button
            onClick={async () => {
              const { update } = useAppSettingsStore.getState();
              await update({ keybindOverrides: {} });
            }}
            className="flex items-center gap-1.5 text-xs text-warning hover:text-warning/80 transition-colors"
            title="Reset all keybindings to defaults"
          >
            <RotateCw className="w-3 h-3" />
            Reset All
          </button>
        )}
      </div>

      {/* Keybinding groups */}
      {Object.entries(grouped).map(([category, defs]) => (
        <div key={category}>
          <h4 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1 px-3">{category}</h4>
          <div className="bg-bg-surface rounded-lg border border-border divide-y divide-border">
            {defs.map(def => {
              const isOverridden = def.id in keybindOverrides;
              const effectiveCombo = getEffectiveCombo(def.id, keybindOverrides);
              const isDisabled = effectiveCombo === null;
              const isRecording = recordingId === def.id;

              return (
                <div
                  key={def.id}
                  className={`flex items-center h-10 px-3 transition-colors ${
                    isRecording ? 'bg-accent/5' : 'hover:bg-bg-elevated/50'
                  }`}
                >
                  {/* Label — left aligned, fixed width */}
                  <span className={`flex-1 text-[13px] ${isDisabled ? 'text-text-secondary line-through' : 'text-text-primary'}`}>
                    {def.label}
                  </span>

                  {/* Shortcut + actions — right aligned */}
                  <div className="flex items-center gap-2 ml-4">
                    {isRecording ? (
                      <span className="text-xs text-accent animate-pulse font-mono px-2 py-1 bg-accent/10 border border-accent/30 rounded">
                        Press keys…
                      </span>
                    ) : (
                      <button
                        onClick={() => setRecordingId(def.id)}
                        className={`flex items-center gap-1 px-1.5 py-1 rounded transition-colors ${
                          isDisabled
                            ? 'hover:border-accent/30'
                            : isOverridden
                              ? 'hover:bg-accent/5'
                              : 'hover:bg-bg-elevated/50'
                        }`}
                        title="Click to record new shortcut"
                      >
                        {isDisabled ? (
                          <span className="text-xs text-text-secondary/50 italic px-1">none</span>
                        ) : (
                          comboToParts(effectiveCombo!).map((part, i, arr) => (
                            <span key={i} className="flex items-center gap-1">
                              <kbd className={`inline-block px-1.5 py-0.5 text-[11px] font-mono rounded border shadow-[0_1px_0_0] ${
                                isOverridden
                                  ? 'bg-accent/10 text-accent border-accent/20 shadow-accent/10'
                                  : 'bg-bg-elevated text-text-primary border-border shadow-border/50'
                              }`}>
                                {part}
                              </kbd>
                              {i < arr.length - 1 && <span className="text-[10px] text-text-secondary">+</span>}
                            </span>
                          ))
                        )}
                      </button>
                    )}

                    {/* Action buttons — fixed width slot to prevent layout shift */}
                    <div className="flex items-center gap-0.5 w-[48px] justify-end">
                      {isOverridden && !isRecording && (
                        <button
                          onClick={() => clearKeybindOverride(def.id)}
                          className="p-1 hover:bg-bg-base rounded transition-colors"
                          title="Reset to default"
                        >
                          <RotateCw className="w-3.5 h-3.5 text-text-secondary" />
                        </button>
                      )}
                      {!isDisabled && !isRecording && (
                        <button
                          onClick={() => setKeybindOverride(def.id, null)}
                          className="p-1 hover:bg-bg-base rounded transition-colors"
                          title="Disable shortcut"
                        >
                          <XCircle className="w-3.5 h-3.5 text-text-secondary hover:text-error" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
