import {
  Bot,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  FileText,
} from 'lucide-react';
import { useState } from 'react';

interface SubagentActivityBlockProps {
  subId: string;
  role: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'aborted';
  result?: string | null;
  error?: string | null;
  elapsed?: number;
  tokenUsage?: { input: number; output: number };
  modifiedFiles?: string[];
}

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

export function SubagentActivityBlock({
  subId: _subId,
  role,
  status,
  result,
  error,
  elapsed,
  tokenUsage,
  modifiedFiles,
}: SubagentActivityBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const totalTokens = (tokenUsage?.input || 0) + (tokenUsage?.output || 0);

  const isRunning = status === 'running' || status === 'queued';
  const isCompleted = status === 'completed';
  const isFailed = status === 'failed' || status === 'aborted';

  return (
    <div
      className={`my-2 rounded-lg border ${
        isRunning
          ? 'border-accent/30 bg-accent/5'
          : isCompleted
          ? 'border-green-500/30 bg-green-500/5'
          : 'border-red-500/30 bg-red-500/5'
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center gap-2 text-left"
      >
        {isRunning ? (
          <Loader2 className="w-4 h-4 text-accent animate-spin flex-shrink-0" />
        ) : isCompleted ? (
          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
        ) : (
          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
        )}

        <Bot className="w-4 h-4 text-text-secondary flex-shrink-0" />

        <span className="text-sm font-medium text-text-primary">
          Subagent: {role}
        </span>

        <span className="text-xs text-text-secondary ml-auto flex items-center gap-2">
          {elapsed !== undefined && (
            <span>⏱ {isRunning ? `${formatElapsed(elapsed)}...` : formatElapsed(elapsed)}</span>
          )}
          {totalTokens > 0 && <span>📊 {formatTokens(totalTokens)}</span>}
          {modifiedFiles && modifiedFiles.length > 0 && (
            <span className="flex items-center gap-0.5">
              <FileText className="w-3 h-3" />
              {modifiedFiles.length}
            </span>
          )}
        </span>

        {!isRunning && (
          expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-text-secondary flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-text-secondary flex-shrink-0" />
          )
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-2 space-y-1 border-t border-border/30">
          {error && (
            <div className="mt-1 text-xs text-red-400 bg-red-400/10 rounded px-2 py-1">
              {error}
            </div>
          )}
          {result && (
            <div className="mt-1 text-xs text-text-secondary bg-bg-base/50 rounded px-2 py-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap">
              {result.slice(0, 2000)}
              {result.length > 2000 && '\n…(truncated)'}
            </div>
          )}
          {modifiedFiles && modifiedFiles.length > 0 && (
            <div className="mt-1 text-xs text-text-secondary">
              <span className="text-text-primary">Modified files:</span>{' '}
              {modifiedFiles.join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ParallelPoolBlockProps {
  poolId: string;
  tasks: Array<{
    subId: string;
    role: string;
    status: 'queued' | 'running' | 'completed' | 'failed' | 'aborted';
    elapsed?: number;
    tokenUsage?: { input: number; output: number };
  }>;
  totalTokens: number;
}

export function ParallelPoolBlock({
  poolId: _poolId,
  tasks,
  totalTokens,
}: ParallelPoolBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const completed = tasks.filter(
    (t) => t.status === 'completed' || t.status === 'failed' || t.status === 'aborted'
  ).length;
  const failed = tasks.filter((t) => t.status === 'failed').length;
  const allDone = completed >= tasks.length;

  return (
    <div
      className={`my-2 rounded-lg border ${
        allDone
          ? failed > 0
            ? 'border-yellow-500/30 bg-yellow-500/5'
            : 'border-green-500/30 bg-green-500/5'
          : 'border-accent/30 bg-accent/5'
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center gap-2 text-left"
      >
        <span className="text-sm">⚡</span>
        <span className="text-sm font-medium text-text-primary">
          Parallel: {tasks.length} tasks
        </span>
        <span className="text-xs text-text-secondary ml-auto">
          {completed}/{tasks.length} complete
          {failed > 0 && <span className="text-red-400"> ({failed} failed)</span>}
          {totalTokens > 0 && <span> · 📊 {formatTokens(totalTokens)}</span>}
        </span>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-text-secondary" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-text-secondary" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-2 border-t border-border/30 space-y-0.5 mt-1">
          {tasks.map((task) => {
            const tokens = (task.tokenUsage?.input || 0) + (task.tokenUsage?.output || 0);
            return (
              <div
                key={task.subId}
                className="flex items-center gap-2 text-xs py-0.5"
              >
                {task.status === 'running' ? (
                  <Loader2 className="w-3 h-3 text-accent animate-spin" />
                ) : task.status === 'completed' ? (
                  <CheckCircle2 className="w-3 h-3 text-green-400" />
                ) : task.status === 'failed' || task.status === 'aborted' ? (
                  <XCircle className="w-3 h-3 text-red-400" />
                ) : (
                  <span className="w-3 h-3 text-text-secondary">⏳</span>
                )}
                <span className="text-text-primary">{task.role}</span>
                {task.elapsed !== undefined && (
                  <span className="text-text-secondary">
                    ({formatElapsed(task.elapsed)})
                  </span>
                )}
                {tokens > 0 && (
                  <span className="text-text-secondary ml-auto">
                    {formatTokens(tokens)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
