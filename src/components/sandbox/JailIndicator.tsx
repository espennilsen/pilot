import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useSandboxStore } from '../../stores/sandbox-store';

export function JailIndicator() {
  const { jailEnabled, setJailEnabled } = useSandboxStore();
  const [showConfirm, setShowConfirm] = useState(false);

  const handleToggle = () => {
    if (jailEnabled) {
      // Disabling jail requires confirmation
      setShowConfirm(true);
    } else {
      // Enabling jail is safe
      setJailEnabled(true);
    }
  };

  const handleConfirmDisable = () => {
    setJailEnabled(false);
    setShowConfirm(false);
  };

  const handleCancelDisable = () => {
    setShowConfirm(false);
  };

  return (
    <>
      <button
        onClick={handleToggle}
        className={`px-3 py-1 rounded-md transition-colors text-sm font-medium flex items-center gap-1.5 ${
          jailEnabled
            ? 'bg-bg-surface hover:bg-bg-elevated text-text-secondary'
            : 'bg-warning/20 hover:bg-warning/30 text-warning'
        }`}
        title={jailEnabled ? 'Sandbox Jailed (Safe)' : 'Sandbox Unrestricted (Danger)'}
      >
        <span>{jailEnabled ? '🔒' : '🔓'}</span>
        <span>{jailEnabled ? 'Jailed' : 'Open'}</span>
      </button>

      {/* Confirmation Dialog */}
      {showConfirm && createPortal(
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[100]"
            onClick={handleCancelDisable}
          />
          <div className="fixed z-[101] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 bg-bg-elevated border border-border rounded-lg shadow-xl p-4">
            <h4 className="text-sm font-semibold text-text-primary mb-2">
              Disable Sandbox Jail?
            </h4>
            <p className="text-xs text-text-secondary mb-4">
              This will allow the agent to access files outside the allowed paths. Only
              disable if you trust the agent completely.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleConfirmDisable}
                className="flex-1 px-3 py-1.5 bg-error/20 hover:bg-error/30 text-error rounded-md transition-colors text-sm font-medium"
              >
                Disable
              </button>
              <button
                onClick={handleCancelDisable}
                className="flex-1 px-3 py-1.5 bg-bg-base hover:bg-bg-surface text-text-primary rounded-md transition-colors text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
