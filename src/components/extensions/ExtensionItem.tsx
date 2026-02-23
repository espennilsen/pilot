import { Trash2, Power, PowerOff } from 'lucide-react';
import type { InstalledExtension } from '../../../shared/types';

interface ExtensionItemProps {
  extension: InstalledExtension;
  onToggle: (extensionId: string) => void;
  onRemove: (extensionId: string) => void;
}

export default function ExtensionItem({ extension, onToggle, onRemove }: ExtensionItemProps) {
  const getScopeBadgeColor = (scope: string) => {
    switch (scope) {
      case 'built-in':
        return 'bg-accent/20 text-accent';
      case 'global':
        return 'bg-bg-elevated text-text-secondary';
      case 'project':
        return 'bg-warning/20 text-warning';
      default:
        return 'bg-bg-elevated text-text-secondary';
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-bg-base/50 transition-colors">
      {/* Icon/Status */}
      <div className={`w-2 h-2 rounded-full ${extension.enabled ? 'bg-accent' : 'bg-text-secondary/30'}`} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-medium text-text-primary truncate">{extension.name}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full ${getScopeBadgeColor(extension.scope)}`}>
            {extension.scope}
          </span>
          <span className="text-xs text-text-secondary">{extension.version}</span>
        </div>
        <p className="text-xs text-text-secondary truncate">{extension.description}</p>
        {extension.hasErrors && extension.errorMessage && (
          <p className="text-xs text-error mt-1 truncate">{extension.errorMessage}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Toggle Button */}
        <button
          onClick={() => onToggle(extension.id)}
          disabled={extension.hasErrors}
          className={`p-1.5 rounded transition-colors ${
            extension.hasErrors
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:bg-bg-elevated'
          }`}
          title={extension.enabled ? 'Disable extension' : 'Enable extension'}
        >
          {extension.enabled ? (
            <Power className="w-4 h-4 text-accent" />
          ) : (
            <PowerOff className="w-4 h-4 text-text-secondary" />
          )}
        </button>

        {/* Remove Button */}
        <button
          onClick={() => onRemove(extension.id)}
          className="p-1.5 rounded hover:bg-error/20 transition-colors"
          title="Remove extension"
        >
          <Trash2 className="w-4 h-4 text-error" />
        </button>
      </div>
    </div>
  );
}
