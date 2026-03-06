# Performance Review — 2026-03-06

## Summary

This review covers the entire Pilot codebase: main-process services, IPC layer, Zustand stores, React hooks, components, and library utilities. The most critical performance issues cluster in three areas:

1. **Streaming hot path** — Every text delta triggers full-record spreads in Zustand, cascading re-renders through unmemoized components, and re-parsing of markdown. The chat view renders all messages (no virtualization) with zero `React.memo` usage, making streaming the single largest performance bottleneck.

2. **Synchronous I/O on the main thread** — Over a dozen places use `readFileSync`, `execSync`, or `readdirSync` in async IPC handlers, blocking the Electron event loop during file tree builds, editor detection, git operations, and companion setup.

3. **Unbounded growth** — Dev command output, staged diffs, subagent records, and per-tab store data accumulate without limits or cleanup, causing progressive memory degradation in long sessions.

A correctness bug was also found: all `TaskManager` async calls in `task-tools.ts` are missing `await`, silently breaking every task tool.

---

## Findings

### 1. Missing `await` on All Async Task Manager Calls (Bug)
**File:** `electron/services/task-tools.ts:86-87`
**Impact:** High
**Issue:** All `TaskManager` methods (`createTask`, `updateTask`, `loadBoard`, `queryTasks`, `getReadyTasks`, `getDependencyChain`, `addComment`) are `async` and return Promises. But in `task-tools.ts`, they are called **without `await`**. The tool returns before the operation completes, and accessing properties like `.id`, `.title`, `.tasks` on a Promise yields `undefined`. Every task tool is effectively broken.

```ts
// In pilot_task_create execute:
const task = taskManager.createTask(projectPath, { ... }); // Missing await!
return {
  content: [{ type: 'text', text: JSON.stringify({ id: task.id, ... }) }], // task.id is undefined
};

// In pilot_task_update execute:
const board = taskManager.loadBoard(projectPath); // Missing await!
const existing = board.tasks.find((t) => t.id === p.task_id); // board.tasks is undefined → crash
```

**Suggestion:**

```ts
const task = await taskManager.createTask(projectPath, { ... });
const board = await taskManager.loadBoard(projectPath);
const chain = await taskManager.getDependencyChain(projectPath, p.task_id);
const ready = await taskManager.getReadyTasks(projectPath);
const tasks = await taskManager.queryTasks(projectPath, { ... });
const comment = await taskManager.addComment(projectPath, p.task_id, p.text, 'agent');
```

---

### 2. Streaming Text Deltas Spread Entire messagesByTab Record
**File:** `src/stores/chat-store.ts:119-139`
**Impact:** High
**Issue:** `appendToLastAssistant` is the hottest path during streaming — called for every token (~50+ times/sec). It creates a new `messagesByTab` object via spread on every delta. Since the entire top-level record is replaced, **every** component subscribed to any tab's messages detects a state change and re-renders.

```ts
appendToLastAssistant: (tabId, textDelta) => {
    set(state => {
      const messages = state.messagesByTab[tabId] || [];
      const updatedMessages = [...messages];
      updatedMessages[lastAssistantIndex] = {
        ...updatedMessages[lastAssistantIndex],
        content: updatedMessages[lastAssistantIndex].content + textDelta,
      };
      return {
        messagesByTab: { ...state.messagesByTab, [tabId]: updatedMessages },
      };
    });
  },
```

**Suggestion:**

```ts
// Batch deltas with requestAnimationFrame to reduce state updates from ~50/sec to ~16/sec
let pendingDeltas: Record<string, string> = {};
let rafScheduled = false;

appendToLastAssistant: (tabId, textDelta) => {
  pendingDeltas[tabId] = (pendingDeltas[tabId] || '') + textDelta;
  if (rafScheduled) return;
  rafScheduled = true;
  requestAnimationFrame(() => {
    rafScheduled = false;
    const deltas = pendingDeltas;
    pendingDeltas = {};
    set(state => {
      let newMessagesByTab = state.messagesByTab;
      for (const [tid, delta] of Object.entries(deltas)) {
        const messages = newMessagesByTab[tid] || [];
        const idx = getLastAssistantIndex(messages, tid, state.streamingIndexByTab, true);
        if (idx === -1) continue;
        const updatedMessages = [...messages];
        updatedMessages[idx] = {
          ...updatedMessages[idx],
          content: updatedMessages[idx].content + delta,
        };
        newMessagesByTab = { ...newMessagesByTab, [tid]: updatedMessages };
      }
      return { messagesByTab: newMessagesByTab };
    });
  });
},
```

---

### 3. Zero React.memo Usage Across Entire Codebase
**File:** `src/components/` (all files)
**Impact:** High
**Issue:** Not a single component uses `React.memo`. In the chat view, when the parent re-renders on every streaming token, every `MessageBubble` for every message re-renders. With 50+ messages, that's 50+ component reconciliations on every ~80ms streaming tick.

```ts
// ChatView.tsx — every message re-renders when any message changes
{messages.map((msg) => (
  <MessageBubble key={msg.id} message={msg} />
))}
```

**Suggestion:**

```ts
const MessageBubble = React.memo(function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === 'user') return <UserMessage message={message} />;
  return <AssistantMessage message={message} />;
});

// Also apply to: Tab, SessionItem, StagedDiffItem, KanbanCard, SubagentItem,
// CodeBlock, ToolResult, Icon, Tooltip
```

---

### 4. Chat Messages List Not Virtualized
**File:** `src/components/chat/ChatView.tsx:80-90`
**Impact:** High
**Issue:** All messages are rendered to the DOM regardless of visibility. A long conversation with 100+ messages (each containing tool calls, code blocks, markdown) creates an extremely large DOM tree. Combined with no `React.memo`, scrolling through history causes layout thrashing.

```ts
<div className="space-y-4">
  {messages.map((msg) => (
    <MessageBubble key={msg.id} message={msg} />
  ))}
  <div ref={messagesEndRef} />
</div>
```

**Suggestion:**

```ts
import { Virtuoso } from 'react-virtuoso';

<Virtuoso
  data={messages}
  followOutput="smooth"
  itemContent={(index, msg) => <MessageBubble key={msg.id} message={msg} />}
/>
```

---

### 5. Markdown Component Re-parses on Every Render
**File:** `src/lib/markdown.tsx:17`
**Impact:** High
**Issue:** The `Markdown` component runs `parseBlocks(text)` (regex-based code block extraction) on every render with no memoization. During streaming, `StreamingMarkdown` calls this every 80ms with a growing string. For long messages with multiple code blocks, this is O(n) text scanning per render frame.

```ts
export default function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text); // No useMemo
  return (
    <>{blocks.map((block, index) => { ... })}</>
  );
}
```

**Suggestion:**

```ts
export default React.memo(function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <>{blocks.map((block, index) => { ... })}</>
  );
});
```

---

### 6. Synchronous File Tree Building Blocks Main Process
**File:** `electron/ipc/project.ts:8-32`
**Impact:** High
**Issue:** `buildFileTree` uses `readdirSync` recursively up to 5 levels deep. For a large project (e.g., monorepo with thousands of directories), this blocks the main process for potentially seconds. Every call to `PROJECT_FILE_TREE` freezes the entire app.

```ts
function buildFileTree(dirPath: string, ig: ReturnType<typeof ignore>, depth = 0, maxDepth = 5): FileNode[] {
  if (depth >= maxDepth) return [];
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter(...)
      .map(entry => {
        if (entry.isDirectory()) {
          return {
            children: buildFileTree(fullPath, ig, depth + 1, maxDepth), // recursive sync
          };
        }
      });
  } catch { return []; }
}
```

**Suggestion:**

```ts
import { readdir } from 'fs/promises';

async function buildFileTreeAsync(
  dirPath: string, ig: ReturnType<typeof ignore>, depth = 0, maxDepth = 5,
): Promise<FileNode[]> {
  if (depth >= maxDepth) return [];
  const entries = await readdir(dirPath, { withFileTypes: true });
  return Promise.all(
    entries.filter(...).map(async (entry) => {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        return {
          name: entry.name, path: fullPath, type: 'directory' as const,
          children: await buildFileTreeAsync(fullPath, ig, depth + 1, maxDepth),
        };
      }
      return { name: entry.name, path: fullPath, type: 'file' as const };
    }),
  );
}
```

---

### 7. Synchronous File Search Blocks Main Process + Undefined `IGNORED` Variable (Bug)
**File:** `electron/ipc/project.ts:111-140`
**Impact:** High
**Issue:** `PROJECT_FILE_SEARCH` traverses the entire project tree synchronously with `readdirSync`. Worse, the `IGNORED` set referenced at line 125 is never defined in this file — this is a runtime `ReferenceError` that crashes all file searches.

```ts
function searchDir(dirPath: string) {
  if (results.length >= maxResults) return;
  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED.has(entry.name) || entry.name.startsWith('.')) continue; // IGNORED is undefined!
    searchDir(fullPath); // recursive sync traversal
  }
}
```

**Suggestion:**

```ts
const IGNORED = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  '.venv', 'vendor', 'target', '.cache',
]);

// Convert to async:
import { readdir } from 'fs/promises';
async function searchDirAsync(dirPath: string, q: string, results: any[], maxResults: number) {
  if (results.length >= maxResults) return;
  const entries = await readdir(dirPath, { withFileTypes: true });
  // ...
}
```

---

### 8. Blocking execSync in Companion Remote Check
**File:** `electron/ipc/companion.ts:237-242`
**Impact:** High
**Issue:** `COMPANION_CHECK_REMOTE` uses `execSync` three times to probe for `tailscale`, `cloudflared`, and `tailscale status --json`. If any command hangs (e.g., Tailscale unresponsive), the entire app freezes.

```ts
try { execSync(`${whichCmd} tailscale`, { stdio: 'ignore' }); tailscale = true; } catch {}
try { execSync(`${whichCmd} cloudflared`, { stdio: 'ignore' }); cloudflared = true; } catch {}
if (tailscale) {
  const out = execSync('tailscale status --json', { encoding: 'utf-8' });
}
```

**Suggestion:**

```ts
const execFileAsync = promisify(execFile);
const TIMEOUT = 3000;

const [tsResult, cfResult] = await Promise.allSettled([
  execFileAsync(whichCmd, ['tailscale'], { timeout: TIMEOUT }),
  execFileAsync(whichCmd, ['cloudflared'], { timeout: TIMEOUT }),
]);
const tailscale = tsResult.status === 'fulfilled';
const cloudflared = cfResult.status === 'fulfilled';
```

---

### 9. Blocking execFileSync / execSync in Editor & Terminal Detection
**File:** `electron/ipc/shell.ts:42-80`
**Impact:** High
**Issue:** On macOS, `detectEditors` runs up to ~14 sequential synchronous `mdfind` calls (3s timeout each), plus ~14 `which` calls. Worst-case: **42+ seconds** blocking the main thread. The first call (at app startup or settings open) can completely freeze the app.

```ts
function whichSync(cmd: string): string | null {
  const result = execFileSync(bin, [cmd], { encoding: 'utf-8', timeout: 2000 }).trim();
  return result.split(/\r?\n/)[0] || null;
}

// Per editor in EDITOR_DEFS:
const result = execSync(
  `mdfind "kMDItemCFBundleIdentifier == '${def.bundleId}'" 2>/dev/null`,
  { encoding: 'utf-8', timeout: 3000 },
).trim();
```

**Suggestion:**

```ts
const execFileAsync = promisify(execFile);

async function detectEditorsAsync(): Promise<DetectedEditor[]> {
  // Probe all CLIs in parallel
  const probes = EDITOR_DEFS.map(async (def) => {
    for (const cli of def.clis) {
      if (await whichAsync(cli)) return { ...def, cli };
    }
    return null;
  });
  const found = (await Promise.all(probes)).filter(Boolean);

  // macOS mdfind — parallelize
  if (process.platform === 'darwin') {
    const missing = EDITOR_DEFS.filter(d => !foundIds.has(d.id) && d.bundleId);
    const mdfindProbes = missing.map(async (def) => { /* ... */ });
    found.push(...(await Promise.all(mdfindProbes)).filter(Boolean));
  }
  return found;
}
```

---

### 10. N+1 Git Commands in getBranches
**File:** `electron/services/git-service.ts:62`
**Impact:** High
**Issue:** `getBranches()` first fetches the branch list, then for **each** branch sequentially runs 3 additional git commands (`log -1`, `config branch.*.merge`, `rev-list --left-right --count`). For a repo with 50 branches, this is up to 150 sequential shell commands.

```ts
for (const [, data] of Object.entries(summary.branches)) {
  const dateStr = await this.git.raw(['log', '-1', '--format=%aI', data.name]);
  const tracking = await this.git.raw(['config', `branch.${data.name}.merge`]);
  const remote = await this.git.raw(['config', `branch.${data.name}.remote`]);
  const counts = await this.git.raw(['rev-list', '--left-right', '--count', ...]);
}
```

**Suggestion:**

```ts
// Batch dates via git for-each-ref (single command for all branches)
const datesRaw = await this.git.raw([
  'for-each-ref', '--format=%(refname:short)%09%(authordate:iso-strict)',
  '--sort=-committerdate', 'refs/heads/',
]);
const dateMap = new Map<string, number>();
for (const line of datesRaw.trim().split('\n')) {
  const [name, date] = line.split('\t');
  if (name && date) dateMap.set(name, new Date(date).getTime());
}

// Parallelize upstream/ahead-behind lookups per branch
const branches = await Promise.all(
  Object.values(summary.branches).map(async (data) => { /* ... */ })
);
```

---

### 11. Unbounded Dev Command Output Buffer (Main Process)
**File:** `electron/services/dev-commands.ts:121`
**Impact:** High
**Issue:** `state.output` accumulates all stdout + stderr output as a single string forever. A dev server running for hours accumulates megabytes of log output, causing increasing memory pressure and making `getState()` return ever-larger payloads.

```ts
proc.stdout?.on('data', (data: Buffer) => {
  const text = data.toString();
  state.output += text;
});
```

**Suggestion:**

```ts
const MAX_OUTPUT_SIZE = 256 * 1024; // 256KB ring buffer

proc.stdout?.on('data', (data: Buffer) => {
  const text = data.toString();
  state.output += text;
  if (state.output.length > MAX_OUTPUT_SIZE) {
    state.output = state.output.slice(-MAX_OUTPUT_SIZE);
  }
  detectUrl(text);
  this.sendToRenderer(IPC.DEV_COMMAND_OUTPUT, commandId, text);
});
```

---

### 12. Unbounded Dev Command Output in Renderer Store
**File:** `src/stores/dev-command-store.ts:57-73`
**Impact:** High
**Issue:** Same issue on the renderer side. `appendOutput` concatenates to the stored string indefinitely. Every append creates a new string copy.

```ts
appendOutput: (commandId: string, output: string) => {
    set((s) => ({
      states: {
        ...s.states,
        [commandId]: { ...currentState, output: currentState.output + output },
      },
    }));
  },
```

**Suggestion:**

```ts
const MAX_OUTPUT_LENGTH = 512 * 1024;

appendOutput: (commandId, output) => {
  set((s) => {
    const currentState = s.states[commandId] || { /* ... */ };
    let newOutput = currentState.output + output;
    if (newOutput.length > MAX_OUTPUT_LENGTH) {
      newOutput = '…(truncated)\n' + newOutput.slice(-MAX_OUTPUT_LENGTH);
    }
    return { states: { ...s.states, [commandId]: { ...currentState, output: newOutput } } };
  });
},
```

---

### 13. Tab Data Never Cleaned Up from Per-Tab Maps on Tab Close
**File:** `src/stores/tab-store.ts:253-274` / `src/stores/chat-store.ts`
**Impact:** High
**Issue:** When a tab is closed, it's removed from `tabs[]` but **none** of the per-tab stores are cleaned up: `messagesByTab`, `streamingByTab`, `modelByTab`, `tokensByTab`, `costByTab`, `diffsByTab`, `subagentsByTab`, etc. Over a long session with many opened/closed tabs, this is a progressive memory leak.

```ts
closeTab: (tabId: string) => {
    set({
      tabs: state.tabs.filter(t => t.id !== tabId),
      activeTabId: newActiveTabId,
      closedTabStack: newClosedStack,
      // No cleanup of messagesByTab, diffsByTab, etc.
    });
},
```

**Suggestion:**

```ts
closeTab: (tabId: string) => {
  // ... existing close logic ...
  set({ tabs: state.tabs.filter(t => t.id !== tabId), /* ... */ });

  // Clean up per-tab data in other stores
  useChatStore.getState().clearTabData(tabId);
  useSandboxStore.getState().clearDiffs(tabId);
  useSubagentStore.getState().clearTab(tabId);
},

// In chat-store, add:
clearTabData: (tabId: string) => {
  set(state => {
    const { [tabId]: _m, ...restMessages } = state.messagesByTab;
    const { [tabId]: _s, ...restStreaming } = state.streamingByTab;
    const { [tabId]: _mo, ...restModel } = state.modelByTab;
    const { [tabId]: _t, ...restTokens } = state.tokensByTab;
    const { [tabId]: _c, ...restCost } = state.costByTab;
    return { messagesByTab: restMessages, streamingByTab: restStreaming,
             modelByTab: restModel, tokensByTab: restTokens, costByTab: restCost };
  });
},
```

---

### 14. Session Metadata File Re-read From Disk on Every Single Operation
**File:** `electron/services/session-metadata.ts:49`
**Impact:** High
**Issue:** Every function (`getSessionMeta`, `updateSessionMeta`, `getAllSessionMeta`, `removeSessionMeta`) calls `load()` which does a synchronous `readFileSync` + `JSON.parse`. Pinning/archiving N sessions triggers 2N full file reads and N full file writes.

```ts
export function getSessionMeta(sessionPath: string): SessionMeta {
  const data = load();  // readFileSync + JSON.parse every call
  return data.sessions[sessionPath] || { ...DEFAULT_META };
}

export function updateSessionMeta(sessionPath: string, update: Partial<SessionMeta>): SessionMeta {
  const data = load();  // readFileSync + JSON.parse again
  const merged = { ...existing, ...update };
  save(data);  // JSON.stringify + writeFileSync
  return merged;
}
```

**Suggestion:**

```ts
let _cache: SessionMetadataFile | null = null;
let _dirty = false;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;

function load(): SessionMetadataFile {
  if (_cache) return _cache;
  // ... read from disk ...
  _cache = parsed;
  return _cache;
}

function scheduleSave(): void {
  _dirty = true;
  if (_saveTimer) return;
  _saveTimer = setTimeout(() => { _saveTimer = null; save(); }, 200);
}

export function updateSessionMeta(sessionPath: string, update: Partial<SessionMeta>): SessionMeta {
  const data = load(); // from cache
  data.sessions[sessionPath] = { ...existing, ...update };
  scheduleSave(); // debounced write
  return data.sessions[sessionPath];
}
```

---

### 15. ToolCallIndicator Subscribes to Entire Sandbox Store Per Instance
**File:** `src/components/chat/MessageBubble.tsx:107-110`
**Impact:** High
**Issue:** Each `ToolCallIndicator` (one per tool call in every message) independently subscribes to `useSandboxStore()` destructuring `diffsByTab` (the entire diffs map). Any diff change for any tab triggers a re-render of every `ToolCallIndicator` in the chat.

```ts
function ToolCallIndicator({ toolCall }: { toolCall: ToolCallInfo }) {
  const { diffsByTab, acceptDiff, rejectDiff } = useSandboxStore();
  const stagedDiff = activeTabId
    ? (diffsByTab[activeTabId] || []).find(d => d.toolCallId === toolCall.id)
    : undefined;
```

**Suggestion:**

```ts
function ToolCallIndicator({ toolCall }: { toolCall: ToolCallInfo }) {
  const activeTabId = useTabStore(s => s.activeTabId);
  const stagedDiff = useSandboxStore(
    useCallback((s) => {
      if (!activeTabId) return undefined;
      return (s.diffsByTab[activeTabId] || []).find(d => d.toolCallId === toolCall.id);
    }, [activeTabId, toolCall.id])
  );
  const acceptDiff = useSandboxStore(s => s.acceptDiff);
  const rejectDiff = useSandboxStore(s => s.rejectDiff);
```

---

### 16. Entire-Store Destructuring in useAgentSession
**File:** `src/hooks/useAgentSession.ts:12-15`
**Impact:** High
**Issue:** Destructuring multiple actions from `useChatStore()` without a selector subscribes the component to **every** state change. During streaming, every text delta, tool call update, and token update triggers a re-render.

```ts
const {
  addMessage, appendToLastAssistant, appendThinking,
  addToolCall, updateToolCall, setStreaming, setModel,
  setModelInfo, setThinking, updateMessage
} = useChatStore();
```

**Suggestion:**

```ts
// Actions are stable references — use getState() in event handlers
// instead of subscribing to the entire store:
function handleAgentEvent(tabId: string, event: AgentSessionEvent) {
  const store = useChatStore.getState();
  switch (event.type) {
    case 'message_start':
      store.addMessage(tabId, { /* ... */ });
      break;
    case 'text':
      store.appendToLastAssistant(tabId, event.text);
      break;
    // ...
  }
}
```

---

### 17. Synchronous readFileSync in Tool Execute Path
**File:** `electron/services/sandboxed-tools.ts:67`
**Impact:** High
**Issue:** `readFileSync` and `existsSync` are used inside the async `execute` callback of sandboxed edit and write tools. When the agent makes multiple edits to large files, this blocks the event loop, stalling all IPC, window rendering, and other agent events.

```ts
let originalContent: string | null = null;
try {
  if (existsSync(resolvedPath)) {
    originalContent = readFileSync(resolvedPath, 'utf-8');
  }
} catch { }
```

**Suggestion:**

```ts
import { readFile, access } from 'fs/promises';
import { constants } from 'fs';

let originalContent: string | null = null;
try {
  await access(resolvedPath, constants.F_OK);
  originalContent = await readFile(resolvedPath, 'utf-8');
} catch { }
```

---

### 18. Unbounded Growth of Completed Subagent State
**File:** `electron/services/subagent-manager.ts:6-9`
**Impact:** High
**Issue:** The `subagents`, `pools`, `fileOwnership`, `resultResolvers`, and `poolResolvers` maps are never pruned after subagents complete. A long-running tab spawning many subagents accumulates all completed records indefinitely.

```ts
private subagents = new Map<string, SubagentInternal>();
private pools = new Map<string, PoolInternal>();
private fileOwnership = new Map<string, Map<string, string>>();
private resultResolvers = new Map<string, Array<(result: SubagentResult) => void>>();
```

**Suggestion:**

```ts
private onSubagentFinished(sub: SubagentInternal): void {
  // ... existing resolver logic ...
  setTimeout(() => {
    if (sub.status === 'completed' || sub.status === 'failed' || sub.status === 'aborted') {
      this.subagents.delete(sub.id);
      this.resultResolvers.delete(sub.id);
    }
    if (sub.poolId) {
      const pool = this.pools.get(sub.poolId);
      if (pool && pool.completed >= pool.total) {
        this.pools.delete(sub.poolId);
        this.fileOwnership.delete(sub.poolId);
        this.poolResolvers.delete(sub.poolId);
      }
    }
  }, 5000);
}
```

---

### 19. Token Validation Writes Entire Token File to Disk on Every Auth Check
**File:** `electron/services/companion-auth.ts:127-133`
**Impact:** High
**Issue:** `validateToken` is called on every WebSocket connection authentication. It updates `lastSeen` and immediately calls `persistTokens()`, which serializes ALL tokens and writes the entire file to disk. Frequently reconnecting companion clients cause repeated full-file writes.

```ts
async validateToken(token: string): Promise<AuthToken | null> {
  const authToken = this.tokens.get(token);
  if (!authToken) return null;
  authToken.lastSeen = Date.now();
  await this.persistTokens(); // Full disk write on EVERY validation
  return authToken;
}
```

**Suggestion:**

```ts
private persistTimer: NodeJS.Timeout | null = null;

async validateToken(token: string): Promise<AuthToken | null> {
  const authToken = this.tokens.get(token);
  if (!authToken) return null;
  authToken.lastSeen = Date.now();
  // Debounce persistence — lastSeen updates are not critical
  if (!this.persistTimer) {
    this.persistTimer = setTimeout(async () => {
      this.persistTimer = null;
      await this.persistTokens();
    }, 30_000);
  }
  return authToken;
}
```

---

### 20. Stale Command Closures in registerCommands
**File:** `src/stores/command-palette-store.ts:80` / `src/hooks/useDefaultCommands.ts:20-30`
**Impact:** High
**Issue:** `registerCommands` filters out commands that already exist by ID. When dependencies change (e.g., `contextPanelVisible` toggles), the effect creates new commands with updated closures — but `registerCommands` **discards them** because the IDs already exist. Commands like `toggle-git-panel` capture a stale closure forever.

```ts
registerCommands: (newCommands: CommandAction[]) => {
    set(state => {
      const existingIds = new Set(state.commands.map(c => c.id));
      const commandsToAdd = newCommands.filter(c => !existingIds.has(c.id));
      // ^^^ Existing commands with new closures silently dropped!
      return { commands: [...state.commands, ...commandsToAdd] };
    });
  },
```

**Suggestion:**

```ts
// Upsert instead of skip-if-exists
registerCommands: (newCommands: CommandAction[]) => {
  set(state => {
    const newIds = new Set(newCommands.map(c => c.id));
    const remaining = state.commands.filter(c => !newIds.has(c.id));
    return { commands: [...remaining, ...newCommands] };
  });
},

// Better: make commands read state lazily via getState()
'toggle-git-panel': {
  action: () => {
    useUIStore.getState().setContextPanelTab('git');
    if (!useUIStore.getState().contextPanelVisible) useUIStore.getState().toggleContextPanel();
  },
},
```

---

### 21. N+1 Metadata File Reads in listAllSessions
**File:** `electron/services/pi-session-listing.ts:56`
**Impact:** High
**Issue:** When `projectPaths` is provided, the loop calls `listSessions()` per project. Each call reads the metadata file from disk via `getAllSessionMeta()`. With 10 projects, that's 10 redundant reads of the same file. The outer function also calls `getAllSessionMeta()` — unused in this branch.

```ts
export async function listAllSessions(projectPaths: string[]): Promise<SessionMetadata[]> {
  const metaMap = getAllSessionMeta(); // read #1 (unused!)
  if (projectPaths.length > 0) {
    for (const projectPath of projectPaths) {
      const sessions = await listSessions(projectPath); // each calls getAllSessionMeta() again!
      allSessions.push(...sessions);
    }
  }
```

**Suggestion:**

```ts
const metaMap = getAllSessionMeta(); // read once

// Parallelize and pass pre-loaded metaMap
const results = await Promise.all(
  projectPaths.map(pp => listSessionsWithMeta(pp, metaMap))
);
allSessions.push(...results.flat());
```

---

### 22. Full HTTP Response Body Read Into Memory Before Truncation
**File:** `electron/services/web-fetch-tool.ts:89`
**Impact:** Medium
**Issue:** `response.text()` reads the entire HTTP response body into a string before truncation. A 100 MB response allocates 100 MB of memory only to discard 99.95%.

```ts
let text = await response.text();
if (contentType.includes('text/html')) {
  text = htmlToText(text);
}
const { output, truncated } = truncate(text);
```

**Suggestion:**

```ts
const reader = response.body?.getReader();
const MAX_READ_BYTES = MAX_OUTPUT_BYTES * 3;
const chunks: Uint8Array[] = [];
let totalBytes = 0;

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  totalBytes += value.length;
  chunks.push(value);
  if (totalBytes >= MAX_READ_BYTES) {
    reader.cancel();
    break;
  }
}
let text = new TextDecoder().decode(Buffer.concat(chunks));
```

---

### 23. Resolved Diffs Accumulate Forever Within a Tab Session
**File:** `electron/services/staged-diffs.ts:6`
**Impact:** Medium
**Issue:** Once a diff is accepted or rejected, it remains in the array. Over a long session with many file edits, the diffs array grows unbounded. `getPending()` must filter through all historical diffs every time.

```ts
addDiff(diff: StagedDiff): void {
  const tabDiffs = this.diffs.get(diff.tabId) ?? [];
  tabDiffs.push(diff);
  this.diffs.set(diff.tabId, tabDiffs);
}
```

**Suggestion:**

```ts
private pruneResolved(tabId: string): void {
  const tabDiffs = this.diffs.get(tabId);
  if (!tabDiffs || tabDiffs.length < 100) return;
  const KEEP_RESOLVED_MS = 60_000;
  const now = Date.now();
  const pruned = tabDiffs.filter(d =>
    d.status === 'pending' || (now - d.createdAt) < KEEP_RESOLVED_MS
  );
  this.diffs.set(tabId, pruned);
}
```

---

### 24. Linear Scan for Diff Lookup by ID
**File:** `electron/services/staged-diffs.ts:12`
**Impact:** Medium
**Issue:** `getDiff()`, `updateStatus()`, and `getPending()` all perform O(n) linear scans over the diffs array. During active agent sessions with many staged diffs, every approval/rejection triggers a linear scan.

```ts
getDiff(tabId: string, diffId: string): StagedDiff | undefined {
  return this.getDiffs(tabId).find(d => d.id === diffId);
}
```

**Suggestion:**

```ts
private diffIndex = new Map<string, StagedDiff>(); // diffId → diff (O(1) lookup)

getDiff(_tabId: string, diffId: string): StagedDiff | undefined {
  return this.diffIndex.get(diffId);
}
```

---

### 25. pendingBashApprovals Map Can Leak If Session Disposed
**File:** `electron/services/sandboxed-tools.ts:18`
**Impact:** Medium
**Issue:** `pendingBashApprovals` stores pending promises. If a bash command is staged but the user never approves/rejects it, and the session is disposed without cleanup, the entry and its resolve callback leak indefinitely.

```ts
const pendingBashApprovals = new Map<string, { resolve: (approved: boolean) => void }>();
```

**Suggestion:**

```ts
export function clearPendingApprovals(): void {
  for (const [id, pending] of pendingBashApprovals) {
    pending.resolve(false);
  }
  pendingBashApprovals.clear();
}

// Add a timeout:
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;
const timeout = setTimeout(() => {
  pendingBashApprovals.delete(diffId);
  resolveApproval(false);
}, APPROVAL_TIMEOUT_MS);
```

---

### 26. execSync for Git Availability Check Blocks Main Thread
**File:** `electron/services/git-service.ts:19`
**Impact:** Medium
**Issue:** `isGitAvailable()` uses synchronous `execSync('git --version')`, blocking the main Electron thread during startup or project switching.

```ts
static isGitAvailable(): boolean {
  try {
    execSync('git --version', { stdio: 'pipe' });
    return true;
  } catch { return false; }
}
```

**Suggestion:**

```ts
static async isGitAvailable(): Promise<boolean> {
  try {
    await execFileAsync('git', ['--version']);
    return true;
  } catch { return false; }
}
```

---

### 27. Memory Manager Re-reads Files on Every Call
**File:** `electron/services/memory-manager.ts:49`
**Impact:** Medium
**Issue:** `getMemoryContext()` reads both global and project memory files from disk on every invocation. Called during session initialization and `refreshSystemPrompt` (which iterates all tabs). If 5 tabs share the same project, the same files are read 5 times.

```ts
async getMemoryContext(projectPath: string): Promise<string> {
  const global = await this.loadFile(GLOBAL_MEMORY_PATH);
  const projectShared = await this.loadFile(
    path.join(projectPath, '.pilot', 'MEMORY.md')
  );
}
```

**Suggestion:**

```ts
private memoryCache = new Map<string, { content: string | null; ts: number }>();
private readonly CACHE_TTL = 5_000;

private async loadFileCached(filePath: string): Promise<string | null> {
  const cached = this.memoryCache.get(filePath);
  if (cached && Date.now() - cached.ts < this.CACHE_TTL) return cached.content;
  const content = await this.loadFile(filePath);
  this.memoryCache.set(filePath, { content, ts: Date.now() });
  return content;
}
```

---

### 28. Sequential Memory Appends — N File Read/Write Cycles
**File:** `electron/services/memory-manager.ts:186`
**Impact:** Medium
**Issue:** `processExtractionResult` calls `appendMemory` in a loop. Each call reads the entire file, searches for duplicates, and writes it back. For N memories, this is N full read/write cycles.

```ts
for (const mem of memories) {
  await this.appendMemory(text, scope, projectPath, category);
}
```

**Suggestion:**

```ts
// Group by file, read once, apply all changes, write once
const byFile = new Map<string, Array<{ text: string; category: string }>>();
for (const mem of memories) { /* group by target file */ }

for (const [filePath, entries] of byFile) {
  let content = await fs.readFile(filePath, 'utf-8').catch(() => '# Memory\n');
  for (const { text, category } of entries) {
    if (content.includes(text)) continue;
    // insert entry
  }
  await fs.writeFile(filePath, content, 'utf-8');
}
```

---

### 29. MCP Tool Call Timeout Timer Never Cleared on Success
**File:** `electron/services/mcp-tool-bridge.ts:125`
**Impact:** Medium
**Issue:** The `execute` function uses `Promise.race` with a `setTimeout` for timeout. When the call completes before the timeout, the timer continues for up to 60 seconds. Under heavy usage, thousands of dangling timers accumulate.

```ts
const result = await Promise.race([
  callPromise,
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(
      `MCP tool call timed out after ${CALL_TOOL_TIMEOUT / 1000}s`
    )), CALL_TOOL_TIMEOUT)
  ),
]);
```

**Suggestion:**

```ts
const timeout = setTimeout(() => { /* reject */ }, CALL_TOOL_TIMEOUT);
try {
  const result = await Promise.race([callPromise, timeoutPromise]);
  // handle result
} finally {
  clearTimeout(timeout); // always clean up
}
```

---

### 30. Sequential Session Listing Per Directory
**File:** `electron/services/pi-session-listing.ts:70`
**Impact:** Medium
**Issue:** When scanning all session directories, `SessionManager.list()` is awaited sequentially in a `for` loop. These are independent I/O operations.

```ts
for (const dirName of dirs) {
  const sessions = await SessionManager.list(cwd, sessionDir); // sequential
}
```

**Suggestion:**

```ts
const results = await Promise.allSettled(
  dirs.map(async (dirName) => {
    const sessions = await SessionManager.list(cwd, sessionDir);
    return sessions.map(s => ({ /* ... */ }));
  })
);
```

---

### 31. getGroupedTabs() Recomputes on Every Call
**File:** `src/stores/tab-store.ts:303-342`
**Impact:** Medium
**Issue:** Performs sorting, Map building, and nested sort with `Math.min(...)` on every invocation. Called by `nextTab`, `prevTab`, `switchToTabByIndex`, and multiple UI components per render cycle. No caching.

```ts
getGroupedTabs: () => {
  const sortedTabs = [...tabs].sort((a, b) => { ... });
  const groupMap = new Map<string | null, TabState[]>();
  groups.sort((a, b) => {
    const aMin = Math.min(...a.tabs.map(t => t.order));
    const bMin = Math.min(...b.tabs.map(t => t.order));
    return aMin - bMin;
  });
  return groups;
},
```

**Suggestion:**

```ts
let _groupedTabsCache: TabGroup[] = [];
let _groupedTabsCacheKey = '';

getGroupedTabs: () => {
  const tabs = get().tabs;
  const cacheKey = tabs.map(t => `${t.id}:${t.order}:${t.isPinned}:${t.projectPath}`).join('|');
  if (cacheKey === _groupedTabsCacheKey) return _groupedTabsCache;
  // ... existing logic ...
  _groupedTabsCacheKey = cacheKey;
  _groupedTabsCache = groups;
  return groups;
},
```

---

### 32. getProjectColor Mutates Store Map Without set()
**File:** `src/stores/tab-store.ts:79-89`
**Impact:** Medium
**Issue:** `getProjectColor` reads `projectColorMap` and mutates it in-place via `colorMap.set(...)`. This violates Zustand's immutability contract — subscribers are never notified.

```ts
const color = PROJECT_COLORS[colorMap.size % PROJECT_COLORS.length];
colorMap.set(projectPath, color);  // ← Direct mutation!
```

**Suggestion:**

```ts
const newMap = new Map(colorMap);
newMap.set(projectPath, color);
useTabStore.setState({ projectColorMap: newMap });
```

---

### 33. Workspace Auto-Save Subscribes to Entire Tab and UI Stores
**File:** `src/hooks/useWorkspacePersistence.ts:161-175`
**Impact:** Medium
**Issue:** `useTabStore.subscribe(debouncedSave)` and `useUIStore.subscribe(debouncedSave)` fire on **any** state change, including scratch pad keystrokes, file highlight changes, etc. Each queues a debounced save.

```ts
const unsubTabs = useTabStore.subscribe(debouncedSave);
const unsubUI = useUIStore.subscribe(debouncedSave);
```

**Suggestion:**

```ts
import { shallow } from 'zustand/shallow';

const unsubUI = useUIStore.subscribe(
  (state) => ({
    sidebarVisible: state.sidebarVisible,
    contextPanelVisible: state.contextPanelVisible,
    focusMode: state.focusMode,
    terminalVisible: state.terminalVisible,
  }),
  debouncedSave,
  { equalityFn: shallow },
);
```

---

### 34. openTabSession Calls addMessage in a Loop — N State Updates
**File:** `src/hooks/useWorkspacePersistence.ts:108-119`
**Impact:** Medium
**Issue:** When restoring chat history, `addMessage` is called per message. Each triggers a separate `set()`. For 100 messages, that's 100 individual store mutations during startup.

```ts
for (const entry of history) {
  addMessage(tabId, { id: crypto.randomUUID(), role: entry.role, ... });
}
```

**Suggestion:**

```ts
// Add bulk setMessages action to chat-store:
setMessages: (tabId, messages) => {
  set(state => ({
    messagesByTab: { ...state.messagesByTab, [tabId]: messages },
  }));
},

// In openTabSession:
const msgs = history.map(entry => ({ id: crypto.randomUUID(), ...entry }));
useChatStore.getState().setMessages(tabId, msgs);
```

---

### 35. useKeyboardShortcuts Re-registers on Every Render
**File:** `src/hooks/useKeyboardShortcut.ts:79-97`
**Impact:** Medium
**Issue:** Callers pass inline array literals as `configs`, changing the reference every render. The `useEffect` depends on `configs`, tearing down and re-adding the `keydown` listener on every render.

```ts
export function useKeyboardShortcuts(configs: ShortcutConfig[]): void {
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [configs]); // new array ref every render
}
```

**Suggestion:**

```ts
export function useKeyboardShortcuts(configs: ShortcutConfig[]): void {
  const configsRef = useRef(configs);
  configsRef.current = configs;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      for (const config of configsRef.current) { /* ... */ }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // stable — register once
}
```

---

### 36. Synchronous RSA Key Generation Blocks Main Process
**File:** `electron/services/companion-tls.ts:38`
**Impact:** Medium
**Issue:** `forge.pki.rsa.generateKeyPair(2048)` is CPU-intensive and synchronous — 500ms–2s. Completely blocks the Electron main process during companion setup.

```ts
const keys = forge.pki.rsa.generateKeyPair(2048);
```

**Suggestion:**

```ts
import { generateKeyPair as generateKeyPairCb } from 'crypto';
const generateKeyPairAsync = promisify(generateKeyPairCb);

const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
```

---

### 37. Synchronous execSync Calls in Tunnel CLI Detection
**File:** `electron/services/companion-cloudflare.ts:20` / `companion-tailscale.ts:20`
**Impact:** Medium
**Issue:** Both files use `execSync` to check if CLI tools are installed. The `tailscale cert` command (line 111) can take several seconds.

```ts
execSync(process.platform === 'win32' ? 'where cloudflared' : 'which cloudflared', { stdio: 'ignore' });
// tailscale cert — especially slow:
const certOutput = execSync(
  `tailscale cert --cert-file="${certPath}" --key-file="${keyPath}" "${dnsName}"`,
  { encoding: 'utf-8' }
);
```

**Suggestion:**

```ts
const execFileAsync = promisify(execFile);

async function isCommandAvailable(cmd: string): Promise<boolean> {
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    await execFileAsync(which, [cmd]);
    return true;
  } catch { return false; }
}
```

---

### 38. Companion IPC Bridge Reconnection Race Condition
**File:** `electron/services/companion-ipc-bridge.ts:120-145`
**Impact:** Medium
**Issue:** `attachClient` replaces the WebSocket in the map, but the old socket's `close` handler will remove the **new** client's entry — both closures share the same `sessionId`.

```ts
attachClient(ws: WebSocket, sessionId: string): void {
  this.clients.set(sessionId, ws);  // Replaces old WS
  ws.on('close', () => {
    this.detachClient(sessionId);  // Old socket deletes the NEW client!
  });
}
```

**Suggestion:**

```ts
attachClient(ws: WebSocket, sessionId: string): void {
  const existing = this.clients.get(sessionId);
  if (existing && existing !== ws) {
    existing.removeAllListeners();
    if (existing.readyState === WebSocket.OPEN) existing.close();
  }
  this.clients.set(sessionId, ws);
  ws.on('close', () => {
    if (this.clients.get(sessionId) === ws) {
      this.detachClient(sessionId);
    }
  });
}
```

---

### 39. Git Service Instances Never Cleaned Up
**File:** `electron/ipc/git.ts:17-18`
**Impact:** Medium
**Issue:** `gitServices` Map grows every time `GIT_INIT` is called with a new project path. No cleanup when a project is closed. Over a long session, stale instances accumulate.

```ts
const gitServices = new Map<string, GitService>();
```

**Suggestion:**

```ts
const MAX_GIT_SERVICES = 10;
function ensureCapacity() {
  if (gitServices.size > MAX_GIT_SERVICES) {
    const oldest = gitServices.keys().next().value;
    if (oldest && oldest !== activeProjectPath) gitServices.delete(oldest);
  }
}
```

---

### 40. App Component actionMap Recomputes on Every State Change
**File:** `src/app.tsx:107-143`
**Impact:** Medium
**Issue:** The `actionMap` useMemo has 16 dependencies including `activeTabId`, `contextPanelVisible`, and `sidebarVisible`. Many closures read state at call time via `getState()`, so they don't actually need reactive deps. Every tab switch or panel toggle recomputes all shortcuts.

```ts
const actionMap = useMemo(() => ({
  'toggle-yolo-mode': () => { if (activeTabId && projectPath) toggleYolo(activeTabId, projectPath); },
  'toggle-git-panel': () => { setContextPanelTab('git'); if (!contextPanelVisible) toggleContextPanel(); },
}), [/* 16 deps */]);
```

**Suggestion:**

```ts
const actionMap = useMemo(() => ({
  'toggle-yolo-mode': () => {
    const tabId = useTabStore.getState().activeTabId;
    const pp = useProjectStore.getState().projectPath;
    if (tabId && pp) useSandboxStore.getState().toggleYolo(tabId, pp);
  },
  'toggle-git-panel': () => {
    useUIStore.getState().setContextPanelTab('git');
    if (!useUIStore.getState().contextPanelVisible) useUIStore.getState().toggleContextPanel();
  },
}), []); // Empty deps — stable forever
```

---

### 41. CodeBlock Triggers Async Highlight on Every Streaming Delta
**File:** `src/components/chat/CodeBlock.tsx:39-44`
**Impact:** Medium
**Issue:** During streaming, code content grows character by character. Every content change triggers a new `highlightCode` async call. No debounce.

```ts
useEffect(() => {
  let cancelled = false;
  highlightCode(code, resolvedLang).then((result) => {
    if (!cancelled) setHighlightedLines(result);
  });
  return () => { cancelled = true; };
}, [code, resolvedLang]);
```

**Suggestion:**

```ts
useEffect(() => {
  let cancelled = false;
  const timer = setTimeout(() => {
    highlightCode(code, resolvedLang).then((result) => {
      if (!cancelled) setHighlightedLines(result);
    });
  }, 100); // debounce rapid updates
  return () => { cancelled = true; clearTimeout(timer); };
}, [code, resolvedLang]);
```

---

### 42. StagedDiffItem Computes Diff on Every Render Without Memoization
**File:** `src/components/sandbox/StagedDiffItem.tsx:64-68`
**Impact:** Medium
**Issue:** `computeSimpleDiff` and `parseUnifiedDiff` are called on every render without `useMemo`. For large file diffs, this is expensive.

```ts
const diffLines = diff.unifiedDiff
  ? parseUnifiedDiff(diff.unifiedDiff)
  : computeSimpleDiff(oldContent, newContent);
const stats = formatDiffStats(diffLines);
```

**Suggestion:**

```ts
const diffLines = useMemo(() =>
  diff.unifiedDiff ? parseUnifiedDiff(diff.unifiedDiff) : computeSimpleDiff(oldContent, newContent),
  [diff.unifiedDiff, oldContent, newContent]
);
const stats = useMemo(() => formatDiffStats(diffLines), [diffLines]);
```

---

### 43. GitBlame getCommitColor Is O(n²)
**File:** `src/components/git/GitBlame.tsx:22-29`
**Impact:** Medium
**Issue:** `getCommitColor` is called per line and creates a `new Set` from a growing slice of the array on each call. For a 500-line file, this is O(n²).

```ts
const getCommitColor = (hash: string, index: number) => {
  const uniqueCommits = new Set(blameLines.slice(0, index + 1).map(l => l.commitHash));
  return uniqueCommits.size % 2 === 0 ? 'bg-bg-base' : 'bg-bg-surface';
};
```

**Suggestion:**

```ts
const lineColors = useMemo(() => {
  const colors: string[] = [];
  const seen = new Set<string>();
  let uniqueCount = 0;
  for (let i = 0; i < blameLines.length; i++) {
    if (!seen.has(blameLines[i].commitHash)) {
      seen.add(blameLines[i].commitHash);
      uniqueCount++;
    }
    colors.push(uniqueCount % 2 === 0 ? 'bg-bg-base' : 'bg-bg-surface');
  }
  return colors;
}, [blameLines]);
```

---

### 44. StatusBar Subscribes to tokensByTab (Changes on Every Streaming Token)
**File:** `src/components/status-bar/StatusBar.tsx:20-27`
**Impact:** Medium
**Issue:** Destructures `tokensByTab`, `contextUsageByTab`, and `costByTab` from `useChatStore()`. The `tokensByTab` object changes on every streaming token, causing the StatusBar to re-render at ~12 times/sec.

```ts
const { tokensByTab, contextUsageByTab, costByTab } = useChatStore();
```

**Suggestion:**

```ts
const tokens = useChatStore(
  useCallback(s => activeTabId ? s.tokensByTab[activeTabId] : undefined, [activeTabId])
);
const contextUsage = useChatStore(
  useCallback(s => activeTabId ? s.contextUsageByTab[activeTabId] : undefined, [activeTabId])
);
```

---

### 45. Tab Store Uses Array With O(n) Lookups by ID
**File:** `src/stores/tab-store.ts` (various methods)
**Impact:** Medium
**Issue:** `tabs` is `TabState[]` but nearly every operation does `.find(t => t.id === tabId)` or `.findIndex(...)` — O(n) per lookup. `switchTab` maps over all tabs to update one tab.

```ts
const tab = state.tabs.find(t => t.id === tabId);
tabs: state.tabs.map(t => t.id === tabId ? { ...t, ...updates } : t),
```

**Suggestion:**

```ts
// Maintain a Map alongside the array or use Map as primary storage
switchTab: (tabId) => {
  set(state => {
    const idx = state.tabs.findIndex(t => t.id === tabId);
    if (idx === -1 || (state.activeTabId === tabId && !state.tabs[idx].hasUnread)) return state;
    const newTabs = [...state.tabs];
    newTabs[idx] = { ...state.tabs[idx], lastActiveAt: Date.now(), hasUnread: false };
    return { activeTabId: tabId, tabs: newTabs };
  });
},
```

---

### 46. Sequential Accept-All Diffs With Synchronous I/O
**File:** `electron/ipc/sandbox.ts:130-139`
**Impact:** Medium
**Issue:** `SANDBOX_ACCEPT_ALL` loops over pending diffs applying them one-at-a-time. Each `applyDiff` does `readFileSync` + `writeFileSync`. For 50+ pending diffs, this blocks the main process for seconds.

```ts
for (const diff of pending) {
  applyDiff(diff);  // sync readFileSync + writeFileSync per diff
  sessionManager.stagedDiffs.updateStatus(tabId, diff.id, 'accepted');
}
```

**Suggestion:**

```ts
// Convert applyDiff to async, parallelize by unique file paths
for (const diff of fileDiffs) {
  await applyDiffAsync(diff);
  sessionManager.stagedDiffs.updateStatus(tabId, diff.id, 'accepted');
}
```

---

### 47. loadAppSettings() Called on Every FS Watch Event
**File:** `electron/ipc/project.ts:80-86`
**Impact:** Medium
**Issue:** The file watcher callback calls `loadAppSettings()` on **every** file system event to rebuild the ignore filter. During `npm install`, this fires thousands of times.

```ts
fsWatcher = watch(projectPath, { recursive: true }, (_eventType, filename) => {
  const settings = loadAppSettings(); // called on every FS event
  const patterns = settings.hiddenPaths ?? DEFAULT_HIDDEN_PATHS;
  const ig = ignore().add(patterns);
});
```

**Suggestion:**

```ts
// Cache the ignore filter outside the callback:
const settings = loadAppSettings();
const patterns = settings.hiddenPaths ?? DEFAULT_HIDDEN_PATHS;
const ig = ignore().add(patterns);

fsWatcher = watch(projectPath, { recursive: true }, (_eventType, filename) => {
  if (filename) {
    const topDir = filename.split(/[/\\]/)[0];
    if (ig.ignores(topDir) || ig.ignores(topDir + '/')) return;
  }
  // ...
});
```

---

### 48. JSONL Task File Grows Unbounded — No Compaction
**File:** `electron/services/task-manager.ts:57-61`
**Impact:** Medium
**Issue:** Every `createTask`, `updateTask`, and `addComment` appends the full task JSON. `parseTasksFile` deduplicates, but the file itself is never compacted. 50 tasks updated 20 times each = 1000 lines where only 50 matter.

```ts
private appendToFile(projectPath: string, task: Task): void {
  const line = JSON.stringify(task) + '\n';
  appendFileSync(filePath, line, 'utf-8');
}
```

**Suggestion:**

```ts
// Track append count and compact when waste exceeds 2× actual count
if (entry.appendsSinceCompact > entry.board.tasks.length * 2) {
  this.compactFile(projectPath, entry.board.tasks);
  entry.appendsSinceCompact = 0;
}
```

---

### 49. Synchronous I/O in Task Manager
**File:** `electron/services/task-manager.ts:57-61`
**Impact:** Medium
**Issue:** `appendFileSync`, `writeFileSync`, and `existsSync` block the main process. `appendFileSync` is called on every task create/update/comment.

```ts
appendFileSync(filePath, line, 'utf-8');
```

**Suggestion:**

```ts
import { appendFile, writeFile } from 'fs/promises';
await appendFile(filePath, line, 'utf-8');
```

---

### 50. New ExtensionManager Instance Per Subagent
**File:** `electron/services/subagent-session.ts:69-72`
**Impact:** Medium
**Issue:** Every subagent creates a brand-new `ExtensionManager`, sets the project, and calls `listExtensions()` / `listSkills()` — reading from disk. Spawning 10 subagents for the same project performs the same disk I/O 10 times.

```ts
const extensionManager = new ExtensionManager();
extensionManager.setProject(projectPath);
const enabledExtensions = extensionManager.listExtensions().filter((e) => e.enabled);
const enabledSkills = extensionManager.listSkills();
```

**Suggestion:**

```ts
// Accept a shared ExtensionManager from the parent session
export async function startSubagentSession(
  sub: SubagentInternal,
  projectPath: string,
  sharedExtensionManager?: ExtensionManager,
): Promise<void> {
  const extensionManager = sharedExtensionManager ?? new ExtensionManager();
  // ...
}
```

---

### 51. O(n) Full-Map Scans for Per-Tab Subagent Queries
**File:** `electron/services/subagent-manager.ts:151-162`
**Impact:** Medium
**Issue:** `getTabSubagentCount()`, `getStatus()`, and `hasActiveSubagents()` iterate the entire `subagents` map to filter by `parentTabId`. Called on every `spawn()`.

```ts
private getTabSubagentCount(parentTabId: string): number {
  let count = 0;
  for (const sub of this.subagents.values()) {
    if (sub.parentTabId === parentTabId && (sub.status === 'running' || sub.status === 'queued')) count++;
  }
  return count;
}
```

**Suggestion:**

```ts
// Add secondary index: parentTabId → Set<subId>
private tabSubagents = new Map<string, Set<string>>();
```

---

### 52. Synchronous File I/O in Extension Manager
**File:** `electron/services/extension-manager.ts:73`
**Impact:** Medium
**Issue:** All operations use `readFileSync`, `writeFileSync`, `readdirSync`, `rmSync`. Importing a ZIP, scanning extensions, or removing an extension stalls the UI thread.

```ts
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
```

**Suggestion:** Convert to async APIs from `fs/promises`.

---

### 53. loadProjectSettings Uses Sync I/O and No Cache
**File:** `electron/services/project-settings.ts:11`
**Impact:** Medium
**Issue:** Uses `existsSync` + `readFileSync` with no caching. Called from `updateDesktopToolsGlobally` (per-tab), `buildSessionConfig`, and other hot paths.

```ts
export function loadProjectSettings(projectPath: string): ProjectSandboxSettings {
  if (!existsSync(settingsPath)) return { ...DEFAULT_SETTINGS };
  const raw = readFileSync(settingsPath, 'utf-8');
  return JSON.parse(raw);
}
```

**Suggestion:**

```ts
const settingsCache = new Map<string, { settings: ProjectSandboxSettings; ts: number }>();
const CACHE_TTL = 10_000;

export function loadProjectSettings(projectPath: string): ProjectSandboxSettings {
  const cached = settingsCache.get(projectPath);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.settings;
  // ... load, cache, return ...
}
```

---

### 54. Sequential File Reads in PromptLibrary.loadFromDir
**File:** `electron/services/prompt-library.ts:168`
**Impact:** Medium
**Issue:** Reads prompt files sequentially with `for...of` + `await fs.readFile()`. Independent reads that can run in parallel.

```ts
for (const filename of files) {
  const raw = await fs.readFile(filePath, 'utf-8');  // sequential
}
```

**Suggestion:**

```ts
const results = await Promise.all(
  files.map(async (filename) => {
    const raw = await fs.readFile(filePath, 'utf-8');
    return parsePromptFile(filename, filePath, raw, layer);
  })
);
```

---

### 55. Full Reload After Every CRUD in PromptLibrary
**File:** `electron/services/prompt-library.ts:251`
**Impact:** Medium
**Issue:** `create()`, `update()`, and `delete()` each call `this.reload()` which re-reads every `.md` file from both directories. The file watcher also triggers another reload 300ms later.

```ts
async create(input) {
  // ... write file ...
  await this.reload();  // re-reads ALL prompt files
}
```

**Suggestion:** Parse only the changed file and update in-memory maps directly. Suppress the watcher-triggered reload.

---

### 56. Sandbox Settings Not Scoped Per-Project in Renderer Store
**File:** `src/stores/sandbox-store.ts:14-17`
**Impact:** Medium
**Issue:** `yoloMode`, `jailEnabled`, and `allowedPaths` are global, not keyed per-project. Switching tabs overwrites settings. Background tabs read the wrong project's settings.

```ts
interface SandboxStore {
  yoloMode: boolean;       // ← global, not per-project
  jailEnabled: boolean;
  allowedPaths: string[];
}
```

**Suggestion:**

```ts
settingsByProject: Record<string, {
  yoloMode: boolean; jailEnabled: boolean; allowedPaths: string[];
}>,
```

---

### 57. Shared isLoading Flag in Git Store Causes Race Conditions
**File:** `src/stores/git-store.ts:66-70`
**Impact:** Medium
**Issue:** A single `isLoading` boolean for all async operations. If two overlap, the first to complete sets `isLoading: false` while the second is still running.

```ts
refreshStatus: async () => { set({ isLoading: true }); /* ... */ set({ isLoading: false }); },
loadCommitLog: async () => { set({ isLoading: true }); /* ... */ set({ isLoading: false }); },
```

**Suggestion:**

```ts
// Use a loading counter
const startLoading = () => set(s => ({ loadingCount: s.loadingCount + 1 }));
const stopLoading = () => set(s => ({ loadingCount: Math.max(0, s.loadingCount - 1) }));
```

---

### 58. Synchronous I/O in Desktop Config Persistence
**File:** `electron/services/desktop-service.ts:1276-1317`
**Impact:** Medium
**Issue:** `persistConfig`, `loadPersistedConfig`, and `ensureGitignoreEntry` use synchronous I/O in async contexts.

```ts
writeFileSync(filePath, JSON.stringify(config, null, 2), { mode: 0o600 });
```

**Suggestion:** Convert to `fs/promises` equivalents.

---

### 59. OAuth pendingPromptResolve Leak
**File:** `electron/ipc/auth.ts:63-66`
**Impact:** Medium
**Issue:** If the user never pastes the auth code, the Promise never settles. If a second login triggers, the first pending resolve is silently orphaned.

```ts
let pendingPromptResolve: ((value: string) => void) | null = null;
return new Promise<string>((resolve) => {
  pendingPromptResolve = resolve;  // previous resolve dropped!
});
```

**Suggestion:**

```ts
if (pendingPromptReject) {
  pendingPromptReject(new Error('OAuth prompt superseded'));
}
pendingPromptTimer = setTimeout(() => {
  reject(new Error('OAuth prompt timed out'));
}, 5 * 60 * 1000);
```

---

### 60. SESSION_GET_CONTEXT_USAGE Mutates SDK Session Messages In-Place
**File:** `electron/ipc/model.ts:82-97`
**Impact:** Medium
**Issue:** Casts `msg as any` and assigns to `m.content` in-place. Can cause race conditions if agent is streaming concurrently.

```ts
for (const msg of session.messages) {
  const m = msg as any;
  if (m.content === undefined || m.content === null) {
    m.content = [];  // mutating shared state!
  }
}
return session.getContextUsage();
```

**Suggestion:**

```ts
// Shallow-copy messages, patch the copies
const patched = originalMessages.map(msg => {
  if ((msg as any).content == null) {
    return { ...msg, content: (msg as any).role === 'assistant' ? [] : '' };
  }
  return msg;
});
(session as any).messages = patched;
const usage = session.getContextUsage();
(session as any).messages = originalMessages; // restore
return usage;
```

---

### 61. isSystemPath Recomputes Lowercased Prefixes on Every Call (Windows)
**File:** `electron/services/sandbox-path-helpers.ts:105`
**Impact:** Medium
**Issue:** On Windows, `isSystemPath()` calls `prefixes.map(p => p.toLowerCase())` on every invocation. Called for every extracted path in every bash command.

```ts
const normalizedPrefixes = isWin ? prefixes.map(p => p.toLowerCase()) : prefixes;
```

**Suggestion:**

```ts
let _cachedNormalizedPrefixes: string[] | null = null;
function getNormalizedPrefixes(): string[] {
  if (_cachedNormalizedPrefixes) return _cachedNormalizedPrefixes;
  _cachedNormalizedPrefixes = process.platform === 'win32'
    ? buildSafePrefixes().map(p => p.toLowerCase())
    : buildSafePrefixes();
  return _cachedNormalizedPrefixes;
}
```

---

### 62. MCP Config Re-Read From Disk on Every getToolDefinitions Call
**File:** `electron/services/mcp-manager.ts:316`
**Impact:** Medium
**Issue:** `getToolDefinitions()` calls `loadMergedMcpConfig(projectPath)` which performs synchronous disk reads every time. Called during `buildSessionConfig` and `getServerStatuses`.

```ts
getToolDefinitions(projectPath?: string): ToolDefinition[] {
  const configs = projectPath ? loadMergedMcpConfig(projectPath) : loadGlobalMcpConfig();
}
```

**Suggestion:**

```ts
private configCache = new Map<string, { configs: McpServerConfig[]; ts: number }>();
private emitConfigChanged(): void {
  this.configCache.clear();
}
```

---

### 63. broadcastToRenderer Uses Dynamic require() on Every Call
**File:** `electron/utils/broadcast.ts:11`
**Impact:** Medium
**Issue:** `require('../services/companion-ipc-bridge')` inside the function body on every single broadcast. For high-frequency events (streaming, terminal output), this adds up.

```ts
try {
  const { companionBridge } = require('../services/companion-ipc-bridge');
  companionBridge.forwardEvent(channel, data);
} catch {}
```

**Suggestion:**

```ts
import { companionBridge } from '../services/companion-ipc-bridge';
// Direct static import — resolved once
```

---

### 64. Duplicate loadAppSettings() Calls in generateCommitMessage
**File:** `electron/services/pi-session-commit.ts:22`
**Impact:** Low
**Issue:** `loadAppSettings()` called twice in the same function.

```ts
const settings = loadAppSettings();           // first read
const maxTokens = loadAppSettings().commitMsgMaxTokens ?? 4096; // second read!
```

**Suggestion:**

```ts
const maxTokens = settings.commitMsgMaxTokens ?? 4096; // reuse existing
```

---

### 65. fillTemplate Creates New RegExp Per Variable
**File:** `electron/services/prompt-helpers.ts:107`
**Impact:** Low
**Issue:** Creates a new `RegExp` for each key in the values map.

```ts
for (const [key, value] of Object.entries(values)) {
  result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
}
```

**Suggestion:**

```ts
let result = content.replace(/\{\{(\w+)\}\}/g, (match, key) =>
  key in values ? values[key] : ''
);
```

---

### 66. inferStatus Scans Arrays Repeatedly — O(n²)
**File:** `electron/services/git-service.ts:306`
**Impact:** Low
**Issue:** Called per file. Each call does `includes()` on `status.created`, `status.deleted`, and `status.renamed` — all linear scans.

```ts
if (status.created.includes(path)) return 'added';
if (status.deleted.includes(path)) return 'deleted';
if (status.renamed.some(r => r.to === path)) return 'renamed';
```

**Suggestion:**

```ts
// Build Sets once per getStatus() call
const sets = {
  created: new Set(status.created),
  deleted: new Set(status.deleted),
  renamedTo: new Set(status.renamed.map(r => r.to)),
};
```

---

### 67. Tunnel Output String Grows Unbounded in Renderer
**File:** `src/stores/tunnel-output-store.ts:40-47`
**Impact:** Low
**Issue:** Same unbounded growth as dev command output. No truncation.

```ts
appendOutput: (provider, text) => {
    set((s) => ({
      output: { ...s.output, [provider]: s.output[provider] + text },
    }));
  },
```

**Suggestion:** Add `MAX_TUNNEL_OUTPUT` cap with truncation.

---

### 68. Task Filter Memoization Key Only Checks Array Length
**File:** `src/stores/task-store.ts:91`
**Impact:** Low
**Issue:** Cache key uses `len: tasks.length`. If a task is updated but count is unchanged, cache returns stale results.

```ts
const currentFilter = JSON.stringify({ filters, len: tasks.length });
```

**Suggestion:** Use a generation counter that increments on any mutation.

---

### 69. formatDiffStats Iterates Array Twice
**File:** `src/lib/diff-utils.ts:139-142`
**Impact:** Low
**Issue:** Two separate `.filter()` calls for `added` and `removed`.

```ts
const added = diff.filter((line) => line.type === 'added').length;
const removed = diff.filter((line) => line.type === 'removed').length;
```

**Suggestion:**

```ts
let added = 0, removed = 0;
for (const line of diff) {
  if (line.type === 'added') added++;
  else if (line.type === 'removed') removed++;
}
```

---

### 70. ensurePilotAppDirs Checks All 5 Directories Every Time
**File:** `electron/services/pilot-paths.ts:52`
**Impact:** Low
**Issue:** Called from multiple places. After first success, all subsequent calls are wasted I/O.

```ts
export function ensurePilotAppDirs(): void {
  const dirs = [PILOT_APP_DIR, PILOT_EXTENSIONS_DIR, ...];
  for (const dir of dirs) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}
```

**Suggestion:**

```ts
let dirsEnsured = false;
export function ensurePilotAppDirs(): void {
  if (dirsEnsured) return;
  // ... create dirs ...
  dirsEnsured = true;
}
```

---

### 71. setScratchPadContent Writes to localStorage on Every Keystroke
**File:** `src/stores/ui-store.ts:118-121`
**Impact:** Low
**Issue:** Synchronous `localStorage.setItem` on every content change.

```ts
setScratchPadContent: (content) => {
    saveScratchPadContent(content); // localStorage.setItem synchronously
    set({ scratchPadContent: content });
  },
```

**Suggestion:**

```ts
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
setScratchPadContent: (content) => {
  set({ scratchPadContent: content });
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => saveScratchPadContent(content), 500);
},
```

---

## Quick Wins

The following 5 changes deliver the most performance improvement for the least implementation effort:

1. **Add `React.memo` to `MessageBubble`, `Tab`, `StagedDiffItem`, and `Icon`** — A single line per component (`export default React.memo(Component)`) that prevents the majority of unnecessary re-renders during streaming. Zero risk, massive impact.

2. **Add `useMemo` to `Markdown` block parsing** — One line (`useMemo(() => parseBlocks(text), [text])`) eliminates redundant regex-based code block extraction on every 80ms streaming tick.

3. **Batch streaming deltas with `requestAnimationFrame`** — Buffer `appendToLastAssistant` deltas and flush once per animation frame. Reduces Zustand state updates from ~50/sec to ~16/sec. ~20 lines of code.

4. **Cache session metadata in memory** — Add an in-memory cache to `session-metadata.ts` (finding #14) to eliminate dozens of redundant `readFileSync` + `JSON.parse` calls per session listing. ~15 lines of code, no API changes.

5. **Fix missing `await` in `task-tools.ts`** — Add `await` to all `TaskManager` async calls (finding #1). This is a bug fix, not just a performance fix — every task tool is silently broken. 6 lines changed.
