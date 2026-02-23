import { useState } from 'react';
import { useSandboxStore } from '../../stores/sandbox-store';
import { useTabStore } from '../../stores/tab-store';
import { useProjectStore } from '../../stores/project-store';
import { StagedDiffItem } from './StagedDiffItem';
import { FolderOpen, History } from 'lucide-react';

export function StagedDiffQueue() {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const { projectPath, openProjectDialog } = useProjectStore();
  const { diffsByTab, getPendingDiffs, acceptAll, getAutoAcceptedTools, setAutoAcceptTool } = useSandboxStore();
  const [showHistory, setShowHistory] = useState(false);

  if (!activeTabId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-text-secondary">No active tab</p>
      </div>
    );
  }

  if (!projectPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 gap-4">
        <FolderOpen className="w-12 h-12 text-text-secondary" />
        <p className="text-sm text-text-secondary text-center">
          Open a project to see changes history
        </p>
        <button
          onClick={openProjectDialog}
          className="px-4 py-2 bg-accent text-bg-base rounded hover:bg-accent/90 transition-colors text-sm font-medium"
        >
          Open Project
        </button>
      </div>
    );
  }

  const allDiffs = diffsByTab[activeTabId] || [];
  const pendingDiffs = getPendingDiffs(activeTabId);
  const historyDiffs = allDiffs.filter(d => d.status !== 'pending');
  const autoAccepted = getAutoAcceptedTools(activeTabId);

  const handleAcceptAll = async () => {
    await acceptAll(activeTabId);
  };

  const isEmpty = pendingDiffs.length === 0 && (!showHistory || historyDiffs.length === 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-elevated">
        <h3 className="text-sm font-semibold text-text-primary">
          Changes{' '}
          {pendingDiffs.length > 0 && (
            <span className="text-warning">({pendingDiffs.length} pending)</span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          {pendingDiffs.length > 0 && (
            <button
              onClick={handleAcceptAll}
              className="px-2.5 py-1 bg-success/20 hover:bg-success/30 text-success rounded-md transition-colors font-medium text-xs"
            >
              Accept All
            </button>
          )}
          <AutoAcceptTools tabId={activeTabId} autoAccepted={autoAccepted} onToggle={setAutoAcceptTool} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Empty state */}
        {isEmpty && (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-text-secondary">No pending changes</p>
          </div>
        )}

        {/* Pending diffs */}
        {pendingDiffs.map((diff) => (
          <StagedDiffItem key={diff.id} diff={diff} tabId={activeTabId} defaultExpanded />
        ))}

        {/* History items (when toggled on) */}
        {showHistory && historyDiffs.map((diff) => (
          <StagedDiffItem key={diff.id} diff={diff} tabId={activeTabId} defaultExpanded={false} />
        ))}
      </div>

      {/* Footer: history toggle */}
      {historyDiffs.length > 0 && (
        <div className="border-t border-border bg-bg-elevated px-4 py-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`flex items-center justify-center gap-2 w-full px-3 py-1.5 text-xs rounded-md transition-colors ${
              showHistory
                ? 'bg-accent/15 text-accent hover:bg-accent/20'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-base'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>History ({historyDiffs.length})</span>
          </button>
        </div>
      )}
    </div>
  );
}

const TOOL_NAMES = ['write', 'edit', 'bash'] as const;

function AutoAcceptTools({
  tabId,
  autoAccepted,
  onToggle,
}: {
  tabId: string;
  autoAccepted: string[];
  onToggle: (tabId: string, toolName: string, enabled: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-text-secondary/50 mr-0.5">Auto:</span>
      {TOOL_NAMES.map((tool) => {
        const enabled = autoAccepted.includes(tool);
        return (
          <button
            key={tool}
            onClick={() => onToggle(tabId, tool, !enabled)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium font-mono transition-colors ${
              enabled
                ? 'bg-warning/20 text-warning hover:bg-warning/30'
                : 'bg-bg-surface text-text-secondary hover:text-text-primary hover:bg-bg-base'
            }`}
            title={enabled ? `Auto-accepting ${tool} — click to disable` : `Click to auto-accept ${tool}`}
          >
            {tool}
          </button>
        );
      })}
    </div>
  );
}
