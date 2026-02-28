/**
 * MCP Servers settings panel — configure, manage, and monitor MCP server connections.
 */

import { useEffect, useState } from 'react';
import {
  Plus, Trash2, RefreshCw, Play, Square, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, Loader2, Circle, Wrench, TestTube,
} from 'lucide-react';
import { useMcpStore } from '../../../stores/mcp-store';
import { useProjectStore } from '../../../stores/project-store';
import { Toggle } from '../settings-helpers';
import type { McpServerConfig, McpTransportType, McpToolInfo } from '../../../../shared/types';

// ─── Status Badge ──────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'connected':
      return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
    case 'connecting':
      return <Loader2 className="w-3.5 h-3.5 text-yellow-500 animate-spin" />;
    case 'error':
      return <XCircle className="w-3.5 h-3.5 text-red-500" />;
    default:
      return <Circle className="w-3.5 h-3.5 text-text-tertiary" />;
  }
}

// ─── Add/Edit Server Form ──────────────────────────────────────

interface ServerFormProps {
  initial?: McpServerConfig;
  onSave: (config: McpServerConfig) => void;
  onCancel: () => void;
}

function ServerForm({ initial, onSave, onCancel }: ServerFormProps) {
  const [name, setName] = useState(initial?.name || '');
  const [transport, setTransport] = useState<McpTransportType>(initial?.transport || 'stdio');
  const [command, setCommand] = useState(initial?.command || '');
  const [args, setArgs] = useState(initial?.args?.join(' ') || '');
  const [cwd, setCwd] = useState(initial?.cwd || '');
  const [url, setUrl] = useState(initial?.url || '');
  const [headersText, setHeadersText] = useState(
    initial?.headers ? Object.entries(initial.headers).map(([k, v]) => `${k}: ${v}`).join('\n') : ''
  );
  const [envText, setEnvText] = useState(
    initial?.env ? Object.entries(initial.env).map(([k, v]) => `${k}=${v}`).join('\n') : ''
  );
  const [scope, setScope] = useState<'global' | 'project'>(initial?.scope || 'global');

  const isEdit = !!initial;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const env: Record<string, string> = {};
    envText.split('\n').filter(Boolean).forEach(line => {
      const idx = line.indexOf('=');
      if (idx > 0) {
        env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    });

    const headers: Record<string, string> = {};
    headersText.split('\n').filter(Boolean).forEach(line => {
      const idx = line.indexOf(':');
      if (idx > 0) {
        headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    });

    const config: McpServerConfig = {
      name: name.trim(),
      transport,
      enabled: initial?.enabled ?? true,
      scope,
      ...(transport === 'stdio' ? {
        command: command.trim(),
        args: args.trim() ? args.trim().split(/\s+/) : [],
        cwd: cwd.trim() || undefined,
      } : {
        url: url.trim(),
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      }),
      ...(Object.keys(env).length > 0 ? { env } : {}),
    };
    onSave(config);
  }

  const inputClass = 'w-full bg-bg-surface border border-border rounded px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent';

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-4 bg-bg-surface rounded-lg border border-border">
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs text-text-secondary mb-1">Name</label>
          <input
            className={inputClass}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="my-server"
            required
            disabled={isEdit}
          />
        </div>
        <div className="w-36">
          <label className="block text-xs text-text-secondary mb-1">Scope</label>
          <select
            className={inputClass}
            value={scope}
            onChange={e => setScope(e.target.value as 'global' | 'project')}
          >
            <option value="global">Global</option>
            <option value="project">Project</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-text-secondary mb-1">Transport</label>
        <div className="flex gap-2">
          {(['stdio', 'sse', 'streamable-http'] as McpTransportType[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTransport(t)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                transport === t
                  ? 'bg-accent/15 text-accent border border-accent/30'
                  : 'bg-bg-elevated text-text-secondary border border-border hover:text-text-primary'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {transport === 'stdio' ? (
        <>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Command</label>
            <input
              className={inputClass}
              value={command}
              onChange={e => setCommand(e.target.value)}
              placeholder="npx"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Arguments</label>
            <input
              className={inputClass}
              value={args}
              onChange={e => setArgs(e.target.value)}
              placeholder="-y @modelcontextprotocol/server-filesystem /path"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Working Directory (optional)</label>
            <input
              className={inputClass}
              value={cwd}
              onChange={e => setCwd(e.target.value)}
              placeholder="/path/to/project"
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="block text-xs text-text-secondary mb-1">URL</label>
            <input
              className={inputClass}
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder={transport === 'sse' ? 'http://localhost:8080/sse' : 'https://api.example.com/mcp'}
              required
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Headers (optional, one per line: Name: value)</label>
            <textarea
              className={`${inputClass} h-12 resize-none font-mono text-xs`}
              value={headersText}
              onChange={e => setHeadersText(e.target.value)}
              placeholder={'Authorization: Bearer sk-...\nX-Custom: value'}
            />
          </div>
        </>
      )}

      <div>
        <label className="block text-xs text-text-secondary mb-1">Environment Variables (optional, one per line: KEY=value)</label>
        <textarea
          className={`${inputClass} h-16 resize-none font-mono text-xs`}
          value={envText}
          onChange={e => setEnvText(e.target.value)}
          placeholder={'API_KEY=sk-...\nDEBUG=true'}
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-3 py-1.5 text-xs bg-accent text-white rounded hover:bg-accent/90 transition-colors"
        >
          {isEdit ? 'Save' : 'Add Server'}
        </button>
      </div>
    </form>
  );
}

// ─── Server Item ───────────────────────────────────────────────

interface ServerItemProps {
  config: McpServerConfig;
  status: { status: string; toolCount: number; error: string | null } | undefined;
  projectPath?: string;
  onReload: () => void;
}

function ServerItem({ config, status, projectPath, onReload }: ServerItemProps) {
  const { removeServer, startServer, stopServer, restartServer, updateServer, testServer } = useMcpStore();
  const [expanded, setExpanded] = useState(false);
  const [tools, setTools] = useState<McpToolInfo[]>([]);
  const [editing, setEditing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; toolCount: number; error?: string } | null>(null);

  const serverStatus = status?.status || 'disconnected';
  const scope = config.scope || 'global';

  async function handleToggle(enabled: boolean) {
    await updateServer(config.name, { enabled }, scope, projectPath);
  }

  async function handleRemove() {
    await removeServer(config.name, scope, projectPath);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testServer(config);
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  }

  async function handleToggleExpand() {
    if (!expanded && serverStatus === 'connected') {
      try {
        const serverTools = await useMcpStore.getState().getTools(config.name);
        setTools(serverTools);
      } catch {
        // Ignore
      }
    }
    setExpanded(!expanded);
  }

  function handleEdit(updated: McpServerConfig) {
    updateServer(config.name, updated, scope, projectPath);
    setEditing(false);
    onReload();
  }

  if (editing) {
    return <ServerForm initial={config} onSave={handleEdit} onCancel={() => setEditing(false)} />;
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2 bg-bg-surface">
        <button onClick={handleToggleExpand} className="p-0.5 hover:bg-bg-elevated rounded transition-colors">
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-text-secondary" /> : <ChevronRight className="w-3.5 h-3.5 text-text-secondary" />}
        </button>

        <StatusBadge status={serverStatus} />

        <span className="text-sm font-medium text-text-primary flex-1 truncate">{config.name}</span>

        <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-tertiary font-mono">
          {config.transport}
        </span>

        <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-tertiary">
          {scope}
        </span>

        {serverStatus === 'connected' && (
          <span className="text-[10px] text-text-tertiary flex items-center gap-1">
            <Wrench className="w-3 h-3" />{status?.toolCount || 0}
          </span>
        )}

        <Toggle checked={config.enabled} onChange={handleToggle} />
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 py-2 border-t border-border space-y-2">
          {/* Connection info */}
          <div className="text-xs text-text-secondary font-mono">
            {config.transport === 'stdio' ? (
              <span>{config.command} {config.args?.join(' ')}</span>
            ) : (
              <span>{config.url}</span>
            )}
          </div>

          {/* Error */}
          {status?.error && (
            <div className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1">
              {status.error}
            </div>
          )}

          {/* Test result */}
          {testResult && (
            <div className={`text-xs rounded px-2 py-1 ${testResult.success ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>
              {testResult.success
                ? `✓ Connected — ${testResult.toolCount} tool${testResult.toolCount !== 1 ? 's' : ''} available`
                : `✗ ${testResult.error}`}
            </div>
          )}

          {/* Tools list */}
          {serverStatus === 'connected' && tools.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-text-secondary font-medium">Tools:</div>
              {tools.map(tool => (
                <div key={tool.name} className="text-xs text-text-secondary pl-2 flex gap-2">
                  <span className="text-text-primary font-mono">{tool.name}</span>
                  <span className="truncate">{tool.description}</span>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-1.5 pt-1">
            {serverStatus === 'connected' || serverStatus === 'connecting' ? (
              <button
                onClick={() => stopServer(config.name)}
                className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary bg-bg-elevated rounded transition-colors"
              >
                <Square className="w-3 h-3" /> Stop
              </button>
            ) : (
              <button
                onClick={() => startServer(config)}
                className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary bg-bg-elevated rounded transition-colors"
              >
                <Play className="w-3 h-3" /> Start
              </button>
            )}
            <button
              onClick={() => restartServer(config.name)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary bg-bg-elevated rounded transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Restart
            </button>
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary bg-bg-elevated rounded transition-colors disabled:opacity-50"
            >
              {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />}
              Test
            </button>
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary bg-bg-elevated rounded transition-colors"
            >
              Edit
            </button>
            <button
              onClick={handleRemove}
              className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:text-red-300 bg-bg-elevated rounded transition-colors ml-auto"
            >
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────

export function McpSettings() {
  const { configs, statuses, loading, loadServers, addServer } = useMcpStore();
  const projectPath = useProjectStore(s => s.projectPath);
  const [showAdd, setShowAdd] = useState(false);

  // Load servers when settings panel opens (hook handles ongoing updates)
  useEffect(() => {
    loadServers(projectPath || undefined);
  }, [projectPath, loadServers]);

  function handleAdd(config: McpServerConfig) {
    addServer(config, config.scope || 'global', projectPath || undefined);
    setShowAdd(false);
  }

  const statusMap = new Map(statuses.map(s => [s.name, s]));
  const connectedCount = statuses.filter(s => s.status === 'connected').length;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-text-secondary">
            Connect MCP servers to give the agent additional tools.
            {connectedCount > 0 && (
              <span className="ml-2 text-green-500">{connectedCount} connected</span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-accent text-white rounded hover:bg-accent/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add Server
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <ServerForm onSave={handleAdd} onCancel={() => setShowAdd(false)} />
      )}

      {/* Server list */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-text-tertiary">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : configs.length === 0 ? (
        <div className="text-center py-8 text-text-tertiary text-sm">
          No MCP servers configured.
          <br />
          <span className="text-xs">
            Add a server above, or create <code className="bg-bg-surface px-1 rounded">mcp.json</code> in your config directory.
          </span>
        </div>
      ) : (
        <div className="space-y-2">
          {configs.map(config => (
            <ServerItem
              key={`${config.scope}-${config.name}`}
              config={config}
              status={statusMap.get(config.name)}
              projectPath={projectPath || undefined}
              onReload={() => loadServers(projectPath || undefined)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
