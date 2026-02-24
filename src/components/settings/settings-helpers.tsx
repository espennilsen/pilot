import { RotateCcw } from 'lucide-react';
import { useAppSettingsStore } from '../../stores/app-settings-store';
import React from 'react';

/**
 * Checks if the current platform is macOS.
 */
export function isMac(): boolean {
  return typeof window !== 'undefined' && window.api?.platform === 'darwin';
}

/**
 * Standard settings row layout: icon + label/description + control.
 */
export function SettingRow({
  icon,
  label,
  description,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-primary">{label}</span>
          {children}
        </div>
        <p className="text-xs text-text-secondary mt-1">{description}</p>
      </div>
    </div>
  );
}

/**
 * Button to reopen the welcome wizard.
 */
export function ReopenWelcomeButton({ onDone }: { onDone: () => void }) {
  const { update } = useAppSettingsStore();

  const handleClick = async () => {
    await update({ onboardingComplete: false });
    onDone();
  };

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2 w-full px-4 py-2 rounded-md text-xs text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors"
    >
      <RotateCcw className="w-3.5 h-3.5" />
      Setup Wizard
    </button>
  );
}

/**
 * Toggle switch component.
 */
export function Toggle({
  checked,
  onChange,
  activeColor = 'bg-accent',
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  activeColor?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
        checked ? activeColor : 'bg-border'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  );
}
