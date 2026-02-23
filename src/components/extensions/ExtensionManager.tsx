import { useEffect } from 'react';
import { Puzzle, AlertTriangle } from 'lucide-react';
import { useExtensionStore } from '../../stores/extension-store';
import ExtensionItem from './ExtensionItem';

export default function ExtensionManager() {
  const { extensions, loadExtensions, toggleExtension, removeExtension } = useExtensionStore();

  useEffect(() => {
    loadExtensions();
  }, [loadExtensions]);

  const handleToggle = async (extensionId: string) => {
    await toggleExtension(extensionId);
  };

  const handleRemove = async (extensionId: string) => {
    if (confirm('Are you sure you want to remove this extension?')) {
      await removeExtension(extensionId);
    }
  };

  const globalExtensions = extensions.filter((e) => e.scope === 'global');
  const projectExtensions = extensions.filter((e) => e.scope === 'project');
  const builtInExtensions = extensions.filter((e) => e.scope === 'built-in');

  return (
    <div className="flex flex-col h-full bg-bg-surface">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-bg-elevated">
        <Puzzle className="w-5 h-5 text-accent" />
        <h2 className="text-sm font-semibold text-text-primary">Extensions</h2>
        <span className="text-xs text-text-secondary ml-auto">
          {extensions.length} installed
        </span>
      </div>

      {/* Security Notice */}
      <div className="mx-4 mt-3 p-3 bg-warning/10 border border-warning/30 rounded flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
        <p className="text-xs text-text-secondary">
          Extensions run with full system access. Only install extensions from trusted sources.
        </p>
      </div>

      {/* Extension List */}
      <div className="flex-1 overflow-y-auto">
        {extensions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
            <Puzzle className="w-12 h-12 text-text-secondary" />
            <p className="text-sm text-text-secondary text-center">
              No extensions installed
            </p>
            <p className="text-xs text-text-secondary text-center max-w-md">
              Extensions can add custom tools, providers, and functionality to Pilot.
            </p>
          </div>
        ) : (
          <>
            {/* Built-in Extensions */}
            {builtInExtensions.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-bg-base sticky top-0">
                  <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                    Built-in
                  </h3>
                </div>
                {builtInExtensions.map((ext) => (
                  <ExtensionItem
                    key={ext.id}
                    extension={ext}
                    onToggle={handleToggle}
                    onRemove={handleRemove}
                  />
                ))}
              </div>
            )}

            {/* Global Extensions */}
            {globalExtensions.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-bg-base sticky top-0">
                  <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                    Global
                  </h3>
                </div>
                {globalExtensions.map((ext) => (
                  <ExtensionItem
                    key={ext.id}
                    extension={ext}
                    onToggle={handleToggle}
                    onRemove={handleRemove}
                  />
                ))}
              </div>
            )}

            {/* Project Extensions */}
            {projectExtensions.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-bg-base sticky top-0">
                  <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                    Project
                  </h3>
                </div>
                {projectExtensions.map((ext) => (
                  <ExtensionItem
                    key={ext.id}
                    extension={ext}
                    onToggle={handleToggle}
                    onRemove={handleRemove}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
