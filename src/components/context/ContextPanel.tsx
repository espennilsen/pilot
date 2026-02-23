import { FolderOpen, PanelRightClose } from 'lucide-react';
import { useUIStore } from '../../stores/ui-store';
import Tooltip from '../shared/Tooltip';
import { useProjectStore } from '../../stores/project-store';
import { useSandboxStore } from '../../stores/sandbox-store';
import { useTabStore } from '../../stores/tab-store';
import { useSubagentStore } from '../../stores/subagent-store';
import FileTree from './FileTree';
import { StagedDiffQueue } from '../sandbox/StagedDiffQueue';
import GitPanel from '../git/GitPanel';
import AgentsPanel from '../subagents/AgentsPanel';

export default function ContextPanel() {
  const { contextPanelVisible, contextPanelWidth, contextPanelTab, setContextPanelTab, toggleContextPanel } = useUIStore();
  const { projectPath, openProjectDialog } = useProjectStore();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const getPendingDiffs = useSandboxStore((s) => s.getPendingDiffs);

  const pendingCount = activeTabId ? getPendingDiffs(activeTabId).length : 0;
  const subagentsByTab = useSubagentStore((s) => s.subagentsByTab);
  const agentCount = activeTabId
    ? (subagentsByTab[activeTabId] || []).filter(
        (a) => a.status === 'running' || a.status === 'queued'
      ).length
    : 0;

  // If the active tab was 'tasks', fall back to 'files'
  const effectiveTab = contextPanelTab === 'tasks' ? 'files' : contextPanelTab;

  return (
    <div
      className="bg-bg-surface border-l border-border transition-[width] duration-200 ease-in-out overflow-hidden flex flex-col"
      style={{ width: contextPanelVisible ? `${contextPanelWidth}px` : '0' }}
    >
      {/* Tab Switcher Header */}
      <div className="h-9 bg-bg-elevated border-b border-border flex items-center px-2 gap-1">
        <button
          onClick={() => setContextPanelTab('files')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors rounded-sm ${
            effectiveTab === 'files'
              ? 'text-accent bg-bg-base border-b-2 border-accent'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-base/50'
          }`}
        >
          Files
        </button>
        <button
          onClick={() => setContextPanelTab('git')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors rounded-sm ${
            effectiveTab === 'git'
              ? 'text-accent bg-bg-base border-b-2 border-accent'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-base/50'
          }`}
        >
          Git
        </button>
        <button
          onClick={() => setContextPanelTab('changes')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors rounded-sm relative ${
            effectiveTab === 'changes'
              ? 'text-accent bg-bg-base border-b-2 border-accent'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-base/50'
          }`}
        >
          Changes
          {pendingCount > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-warning text-bg-base rounded-full font-semibold">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setContextPanelTab('agents')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors rounded-sm relative ${
            effectiveTab === 'agents'
              ? 'text-accent bg-bg-base border-b-2 border-accent'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-base/50'
          }`}
        >
          Agents
          {agentCount > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-accent text-bg-base rounded-full font-semibold">
              {agentCount}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {effectiveTab === 'files' ? (
          !projectPath ? (
            <div className="flex flex-col items-center justify-center h-full p-4 gap-4">
              <FolderOpen className="w-12 h-12 text-text-secondary" />
              <p className="text-sm text-text-secondary text-center">
                No project selected
              </p>
              <button
                onClick={openProjectDialog}
                className="px-4 py-2 bg-accent text-bg-base rounded hover:bg-accent/90 transition-colors text-sm font-medium"
              >
                Open Project
              </button>
            </div>
          ) : (
            <FileTree />
          )
        ) : effectiveTab === 'git' ? (
          <GitPanel />
        ) : effectiveTab === 'agents' ? (
          <AgentsPanel />
        ) : (
          <StagedDiffQueue />
        )}
      </div>

      {/* Collapse button */}
      <div className="h-9 border-t border-border flex items-center px-2">
        <Tooltip content="Collapse panel" position="left">
          <button
            className="p-1.5 hover:bg-bg-elevated rounded-md transition-colors text-text-secondary"
            onClick={toggleContextPanel}
          >
            <PanelRightClose className="w-4 h-4" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
