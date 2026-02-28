import { useGitStore } from '../../stores/git-store';
import { useSandboxStore } from '../../stores/sandbox-store';
import { useChatStore } from '../../stores/chat-store';
import { useTabStore } from '../../stores/tab-store';
import { useAuthStore } from '../../stores/auth-store';
import { useAppSettingsStore } from '../../stores/app-settings-store';
import { useDevCommandStore } from '../../stores/dev-command-store';
import { useMcpStore } from '../../stores/mcp-store';
import { useUIStore } from '../../stores/ui-store';
import { MemoryIndicator } from '../memory/MemoryIndicator';

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function ContextWindowBar({ percent }: { percent: number }) {
  const color = percent > 90 ? 'bg-error' : percent > 70 ? 'bg-warning' : 'bg-accent';
  return (
    <div className="w-14 h-1.5 bg-bg-base rounded-full overflow-hidden" title={`Context: ${percent.toFixed(0)}%`}>
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  );
}

export default function StatusBar() {
  const { status } = useGitStore();
  const { yoloMode, getAutoAcceptedTools } = useSandboxStore();
  const { activeTabId } = useTabStore();
  const { tokensByTab, contextUsageByTab, costByTab } = useChatStore();
  const developerMode = useAppSettingsStore(s => s.developerMode);
  const { states: devCommandStates } = useDevCommandStore();

  const { hasAnyAuth } = useAuthStore();
  const isConnected = hasAnyAuth;
  const mcpStatuses = useMcpStore(s => s.statuses);
  const mcpConnected = mcpStatuses.filter(s => s.status === 'connected').length;
  const mcpErrors = mcpStatuses.filter(s => s.status === 'error').length;
  const mcpTotal = mcpStatuses.length;
  const openSettings = useUIStore(s => s.openSettings);

  const autoAccepted = activeTabId ? getAutoAcceptedTools(activeTabId) : [];
  const hasRunningDevCommand = Object.values(devCommandStates).some(state => state.status === 'running');



  // Token usage
  const tokens = activeTabId ? tokensByTab[activeTabId] : undefined;
  const cost = activeTabId ? costByTab[activeTabId] : undefined;

  // Context window usage
  const contextUsage = activeTabId ? contextUsageByTab[activeTabId] : undefined;

  return (
    <div className="h-6 bg-bg-surface border-t border-border flex items-center justify-between px-3 text-xs text-text-secondary flex-shrink-0">
      {/* Left side */}
      <div className="flex items-center gap-4">
        {/* Connection indicator */}
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-success' : 'bg-error'}`} />
          <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>

        {/* Yolo mode indicator */}
        {yoloMode && (
          <div className="flex items-center gap-1.5 text-warning" title="YOLO mode active - changes applied automatically">
            <span>🟡</span>
            <span>YOLO</span>
          </div>
        )}

        {/* Auto-accept indicators */}
        {autoAccepted.length > 0 && (
          <div className="flex items-center gap-1.5 text-warning" title={`Auto-accepting: ${autoAccepted.join(', ')}`}>
            <span>⚡</span>
            <span>Auto: {autoAccepted.join(', ')}</span>
          </div>
        )}

        {/* Dev commands running indicator */}
        {hasRunningDevCommand && (
          <div className="flex items-center gap-1.5 text-success" title="Dev command running">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span>Running</span>
          </div>
        )}

        {/* Developer mode indicator */}
        {developerMode && (
          <div className="flex items-center gap-1.5 text-warning" title="Developer mode active">
            <span>⚡</span>
            <span>Dev</span>
          </div>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* MCP indicator */}
        {mcpTotal > 0 && (
          <button
            onClick={() => openSettings('mcp')}
            className="flex items-center gap-1.5 hover:text-text-primary transition-colors"
            title={`MCP: ${mcpConnected}/${mcpTotal} servers connected${mcpErrors > 0 ? ` (${mcpErrors} error${mcpErrors > 1 ? 's' : ''})` : ''}\nClick to manage`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${mcpErrors > 0 ? 'bg-error' : mcpConnected > 0 ? 'bg-success' : 'bg-text-tertiary'}`} />
            <span className="font-mono">MCP {mcpConnected}/{mcpTotal}</span>
          </button>
        )}

        {/* Memory indicator */}
        <MemoryIndicator />

        {/* Git branch and status */}
        {status && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span>🔀</span>
              <span className="font-mono">{status.branch}</span>
            </div>
            {(status.ahead > 0 || status.behind > 0) && (
              <span className="text-text-secondary/70">
                {status.ahead > 0 && `↑${status.ahead}`}
                {status.ahead > 0 && status.behind > 0 && ' '}
                {status.behind > 0 && `↓${status.behind}`}
              </span>
            )}
          </div>
        )}

        {/* Context window usage bar */}
        {contextUsage && contextUsage.percent != null && (
          <div className="flex items-center gap-1.5" title={`Context: ${contextUsage.tokens != null ? formatTokenCount(contextUsage.tokens) : '?'} / ${formatTokenCount(contextUsage.contextWindow)} tokens (${contextUsage.percent.toFixed(0)}%)`}>
            <span className="text-[10px]">Ctx</span>
            <ContextWindowBar percent={contextUsage.percent} />
            <span className="font-mono text-[10px]">{contextUsage.percent.toFixed(0)}%</span>
          </div>
        )}

        {/* Token count — input / output */}
        <div
          className="flex items-center gap-1.5"
          title={tokens ? `Input: ${tokens.input.toLocaleString()}\nOutput: ${tokens.output.toLocaleString()}\nCache read: ${tokens.cacheRead.toLocaleString()}\nCache write: ${tokens.cacheWrite.toLocaleString()}\nTotal: ${tokens.total.toLocaleString()}` : 'No token data yet'}
        >
          <span className="font-mono">{tokens ? `↑${formatTokenCount(tokens.input)}` : '↑--'}</span>
          <span className="text-text-tertiary">/</span>
          <span className="font-mono">{tokens ? `↓${formatTokenCount(tokens.output)}` : '↓--'}</span>
        </div>

        {/* Cost */}
        {cost != null && cost > 0 && (
          <div className="flex items-center gap-1.5" title={`Session cost: ${formatCost(cost)}`}>
            <span className="font-mono">{formatCost(cost)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
