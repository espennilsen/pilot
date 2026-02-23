import {
  Bot,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  StopCircle,
  Zap,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';
import { useSubagentStore } from '../../stores/subagent-store';
import { useTabStore } from '../../stores/tab-store';
import { IPC } from '../../../shared/ipc';
import { invoke } from '../../lib/ipc-client';
import type { SubagentRecord } from '../../../shared/types';

const EMPTY_SUBAGENTS: SubagentRecord[] = [];

function formatElapsed(ms: number): string {
  if (ms < 1000) return '<1s';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

const statusIcon: Record<string, React.ReactNode> = {
  queued: <Clock className="w-3.5 h-3.5 text-text-secondary" />,
  running: <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />,
  completed: <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />,
  failed: <XCircle className="w-3.5 h-3.5 text-red-400" />,
  aborted: <StopCircle className="w-3.5 h-3.5 text-yellow-400" />,
};

const statusLabel: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  aborted: 'Aborted',
};

function SubagentItem({ sub }: { sub: SubagentRecord }) {
  const [expanded, setExpanded] = useState(false);
  const elapsed = (sub.completedAt || Date.now()) - sub.createdAt;
  const totalTokens = sub.tokenUsage.input + sub.tokenUsage.output;

  const handleAbort = (e: React.MouseEvent) => {
    e.stopPropagation();
    invoke(IPC.SUBAGENT_ABORT, sub.id);
  };

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-bg-base/50 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-text-secondary flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-text-secondary flex-shrink-0" />
        )}
        {statusIcon[sub.status] || statusIcon.queued}
        <span className="text-sm font-medium text-text-primary truncate flex-1">
          {sub.role}
        </span>
        <span className="text-xs text-text-secondary flex-shrink-0">
          {formatElapsed(elapsed)}
        </span>
        {(sub.status === 'running' || sub.status === 'queued') && (
          <button
            onClick={handleAbort}
            className="p-0.5 hover:bg-bg-elevated rounded transition-colors flex-shrink-0"
            title="Abort"
          >
            <StopCircle className="w-3 h-3 text-text-secondary hover:text-red-400" />
          </button>
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-2 pl-8 space-y-1">
          <div className="text-xs text-text-secondary">
            {statusLabel[sub.status]} · {formatTokens(totalTokens)} tokens
            {sub.modifiedFiles.length > 0 && (
              <> · {sub.modifiedFiles.length} file{sub.modifiedFiles.length !== 1 ? 's' : ''}</>
            )}
          </div>
          {sub.error && (
            <div className="text-xs text-red-400 bg-red-400/10 rounded px-2 py-1">
              {sub.error}
            </div>
          )}
          {sub.result && (
            <div className="text-xs text-text-secondary bg-bg-base rounded px-2 py-1 max-h-32 overflow-y-auto whitespace-pre-wrap">
              {sub.result.slice(0, 500)}
              {sub.result.length > 500 && '…'}
            </div>
          )}
          {sub.modifiedFiles.length > 0 && (
            <div className="text-xs text-text-secondary">
              <span className="text-text-primary">Files:</span>{' '}
              {sub.modifiedFiles.join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AgentsPanel() {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const subagentsByTab = useSubagentStore((s) => s.subagentsByTab);
  const subagents = (activeTabId ? subagentsByTab[activeTabId] : null) ?? EMPTY_SUBAGENTS;

  if (subagents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 gap-3">
        <Bot className="w-10 h-10 text-text-secondary" />
        <p className="text-sm text-text-secondary text-center">
          No subagents active
        </p>
        <p className="text-xs text-text-secondary text-center max-w-[200px]">
          The agent can spawn subagents to work on tasks in parallel. They'll appear here.
        </p>
      </div>
    );
  }

  // Group by pool
  const pooled = new Map<string, SubagentRecord[]>();
  const standalone: SubagentRecord[] = [];

  for (const sub of subagents) {
    if (sub.poolId) {
      const existing = pooled.get(sub.poolId) || [];
      existing.push(sub);
      pooled.set(sub.poolId, existing);
    } else {
      standalone.push(sub);
    }
  }

  // Calculate totals
  const totalTokens = subagents.reduce(
    (acc, s) => acc + s.tokenUsage.input + s.tokenUsage.output,
    0
  );
  const activeCount = subagents.filter(
    (s) => s.status === 'running' || s.status === 'queued'
  ).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-text-primary">
            Agents
          </span>
          {activeCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-accent/20 text-accent rounded-full">
              {activeCount} active
            </span>
          )}
        </div>
      </div>

      {/* Subagent list */}
      <div className="flex-1 overflow-y-auto">
        {/* Standalone subagents */}
        {standalone.map((sub) => (
          <SubagentItem key={sub.id} sub={sub} />
        ))}

        {/* Pool groups */}
        {[...pooled.entries()].map(([poolId, subs]) => (
          <PoolGroup key={poolId} poolId={poolId} subagents={subs} />
        ))}
      </div>

      {/* Footer with totals */}
      <div className="px-3 py-1.5 border-t border-border text-xs text-text-secondary flex items-center justify-between">
        <span>
          {subagents.length} subagent{subagents.length !== 1 ? 's' : ''}
        </span>
        <span>{formatTokens(totalTokens)} tokens</span>
      </div>
    </div>
  );
}

function PoolGroup({
  poolId,
  subagents,
}: {
  poolId: string;
  subagents: SubagentRecord[];
}) {
  const [expanded, setExpanded] = useState(true);
  const completed = subagents.filter(
    (s) => s.status === 'completed' || s.status === 'failed' || s.status === 'aborted'
  ).length;
  const failed = subagents.filter((s) => s.status === 'failed').length;

  return (
    <div className="border-b border-border/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-1.5 flex items-center gap-2 bg-bg-elevated/50 hover:bg-bg-elevated transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-text-secondary" />
        ) : (
          <ChevronRight className="w-3 h-3 text-text-secondary" />
        )}
        <Zap className="w-3.5 h-3.5 text-accent" />
        <span className="text-xs font-medium text-text-primary">
          Pool: {subagents.length} tasks
        </span>
        <span className="text-xs text-text-secondary ml-auto">
          {completed}/{subagents.length}
          {failed > 0 && (
            <span className="text-red-400"> ({failed} failed)</span>
          )}
        </span>
      </button>
      {expanded && (
        <div className="pl-2">
          {subagents.map((sub) => (
            <SubagentItem key={sub.id} sub={sub} />
          ))}
        </div>
      )}
    </div>
  );
}
