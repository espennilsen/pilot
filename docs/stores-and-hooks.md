# Stores & Hooks Reference

## Overview

The renderer uses Zustand for state management with one store per domain, and React hooks for lifecycle management and IPC event bridging.

**Conventions:**
- Stores are in `src/stores/`, one file per domain
- Hooks are in `src/hooks/`
- State is immutable — always return new objects from `set()`
- Derived values in selectors, not components
- IPC calls in store actions or hooks, never in JSX
- Access stores outside React via `useStore.getState()`
- `window.api.on()` listeners always cleaned up in `useEffect` returns

---

## Stores Quick Reference

| Store | File | Key State | IPC Domains |
|---|---|---|---|
| `useAppSettingsStore` | `app-settings-store.ts` | piAgentDir, developerMode, keybindOverrides | App Settings |
| `useAuthStore` | `auth-store.ts` | providers, hasAnyAuth, oauthInProgress | Auth |
| `useChatStore` | `chat-store.ts` | messagesByTab, streamingByTab, modelByTab, tokensByTab | None (via hook) |
| `useCommandPaletteStore` | `command-palette-store.ts` | isOpen, commands, recentCommandIds | None |
| `useDevCommandStore` | `dev-command-store.ts` | commands, states, tunnelUrls | Dev Commands |
| `useExtensionStore` | `extension-store.ts` | extensions, skills | Extensions |
| `useGitStore` | `git-store.ts` | status, branches, commitLog, stashes | Git |
| `useMemoryStore` | `memory-store.ts` | globalMemory, projectMemory | Memory |
| `useOutputWindowStore` | `output-window-store.ts` | windows, draggedTab | None |
| `useProjectStore` | `project-store.ts` | projectPath, fileTree, selectedFilePath | Project |
| `usePromptStore` | `prompt-store.ts` | prompts | Prompts |
| `useSandboxStore` | `sandbox-store.ts` | diffsByTab, yoloMode, autoAcceptTools | Sandbox |
| `useSessionStore` | `session-store.ts` | sessions, searchQuery | Session |
| `useSubagentStore` | `subagent-store.ts` | subagentsByTab, poolProgressByTab | None (via hook) |
| `useTabStore` | `tab-store.ts` | tabs, activeTabId, closedTabStack | None (via hook) |
| `useTaskStore` | `task-store.ts` | tasks, viewMode, filters, epics | Tasks |
| `useUIStore` | `ui-store.ts` | sidebarVisible, contextPanelVisible, focusMode, terminalVisible | None |

---

## Store Details

### `useAppSettingsStore`

**File:** `src/stores/app-settings-store.ts`

**State:**
```typescript
interface AppSettingsStore {
  piAgentDir: string;
  terminalApp: string | null;
  editorCli: string | null;
  onboardingComplete: boolean;
  developerMode: boolean;
  keybindOverrides: Record<string, string | null>;
  isLoading: boolean;
  error: string | null;
}
```

**Actions:**
- `load()` — Load settings from `<PILOT_DIR>/app-settings.json`
- `update(updates)` — Update settings on disk and in memory
- `setPiAgentDir(dir)` — Change Pi agent directory
- `setTerminalApp(app)` — Set default terminal app
- `setEditorCli(cli)` — Set default editor CLI command
- `setDeveloperMode(enabled)` — Toggle developer mode (optimistic update)
- `completeOnboarding()` — Mark onboarding as complete
- `setKeybindOverride(id, combo)` — Override a keyboard shortcut
- `clearKeybindOverride(id)` — Remove a keyboard shortcut override

**IPC Channels:**
- `IPC.APP_SETTINGS_GET` — Fetch settings
- `IPC.APP_SETTINGS_UPDATE` — Save settings

**Notes:**
- Developer mode state is updated optimistically before IPC call
- Default `piAgentDir` is `<PILOT_DIR>` (platform-dependent)

---

### `useAuthStore`

**File:** `src/stores/auth-store.ts`

**State:**
```typescript
interface AuthStore {
  providers: ProviderAuthInfo[];
  hasAnyAuth: boolean;
  isLoading: boolean;
  error: string | null;
  oauthInProgress: string | null; // provider id
  oauthMessage: string | null;
  oauthPrompt: string | null; // non-null when waiting for user to paste a code
}

interface ProviderAuthInfo {
  provider: string;
  hasAuth: boolean;
  authType: 'api_key' | 'oauth' | 'env' | 'none';
}
```

**Actions:**
- `loadStatus()` — Fetch auth status for all providers
- `setApiKey(provider, apiKey)` — Set API key for a provider
- `loginOAuth(providerId)` — Start OAuth login flow
- `submitOAuthPrompt(value)` — Submit user-pasted code during OAuth flow
- `cancelOAuthPrompt()` — Cancel OAuth prompt
- `logout(provider)` — Remove auth for a provider
- `clearError()` — Clear error message

**IPC Channels:**
- `IPC.AUTH_GET_STATUS` — Fetch auth status
- `IPC.AUTH_SET_API_KEY` — Save API key
- `IPC.AUTH_LOGIN_OAUTH` — Start OAuth flow
- `IPC.AUTH_OAUTH_PROMPT_REPLY` — Submit OAuth prompt response
- `IPC.AUTH_LOGOUT` — Remove auth

**Notes:**
- Includes `friendlyAuthError()` helper to clean up IPC error messages
- OAuth flow managed via `oauthInProgress`, `oauthMessage`, and `oauthPrompt` state
- Listens for OAuth events via `useAuthEvents` hook

---

### `useChatStore`

**File:** `src/stores/chat-store.ts`

**State:**
```typescript
interface ChatState {
  messagesByTab: Record<string, ChatMessage[]>;
  streamingByTab: Record<string, boolean>;
  modelByTab: Record<string, string>;
  modelInfoByTab: Record<string, ModelInfo>;
  thinkingByTab: Record<string, string>;
  tokensByTab: Record<string, SessionTokens>;
  contextUsageByTab: Record<string, ContextUsage>;
  costByTab: Record<string, number>;
  queuedByTab: Record<string, { steering: string[]; followUp: string[] }>;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  thinkingContent?: string;
  toolCalls?: ToolCallInfo[];
  isError?: boolean;
  retryInfo?: { attempt: number; maxAttempts: number; delayMs: number };
}
```

**Actions:**
- `addMessage(tabId, message)` — Add a new message
- `updateMessage(tabId, messageId, updates)` — Update existing message
- `appendToLastAssistant(tabId, textDelta)` — Append text to streaming assistant message
- `appendThinking(tabId, thinkingDelta)` — Append thinking text
- `addToolCall(tabId, toolCall)` — Add a tool call to last assistant message
- `updateToolCall(tabId, toolCallId, updates)` — Update a tool call
- `setStreaming(tabId, streaming)` — Set streaming state
- `setModel(tabId, model)` — Set model display string (backward compat)
- `setModelInfo(tabId, info)` — Set full model info
- `setThinking(tabId, level)` — Set thinking level
- `setTokens(tabId, tokens)` — Update token usage
- `setContextUsage(tabId, usage)` — Update context window usage
- `setCost(tabId, cost)` — Set session cost
- `setQueued(tabId, queued)` — Set queued steering/follow-up messages
- `clearMessages(tabId)` — Clear all messages for a tab
- `getMessages(tabId)` — Get messages for a tab

**IPC Channels:**
- None (updated via `useAgentSession` hook which listens to `IPC.AGENT_EVENT`)

**Notes:**
- All state is per-tab
- Streaming messages have `isStreaming: true` while assistant is still generating
- Tool calls are stored in the last assistant message's `toolCalls` array

---

### `useCommandPaletteStore`

**File:** `src/stores/command-palette-store.ts`

**State:**
```typescript
interface CommandPaletteStore {
  isOpen: boolean;
  searchQuery: string;
  selectedIndex: number;
  commands: CommandAction[];
  recentCommandIds: string[];
}

interface CommandAction {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  shortcut?: string;
  category?: string;
  action: () => void;
  keywords?: string[];
}
```

**Actions:**
- `open()` — Open command palette
- `close()` — Close command palette
- `toggle()` — Toggle command palette
- `setSearchQuery(query)` — Update search query (resets selection)
- `setSelectedIndex(index)` — Update selected command index
- `registerCommands(commands)` — Register new commands (de-duped by id)
- `unregisterCommands(ids)` — Remove commands by id
- `executeCommand(id)` — Execute command, update recents, close palette
- `getFilteredCommands()` — Get filtered and sorted commands

**IPC Channels:**
- None

**Notes:**
- Fuzzy matching on label, description, category, and keywords
- Recent commands (last 5) are shown first when no search query
- Exact prefix matches are prioritized in search results
- Commands are registered via `useDefaultCommands` hook

---

### `useDevCommandStore`

**File:** `src/stores/dev-command-store.ts`

**State:**
```typescript
interface DevCommandStore {
  commands: DevCommand[];
  states: Record<string, DevCommandState>;
  tunnelUrls: Record<string, string>; // commandId → tunnelUrl
  expandedCommandId: string | null;
  showOutput: boolean;
}
```

**Actions:**
- `setShowOutput(show)` — Toggle output visibility
- `loadCommands(projectPath)` — Load commands from `<project>/.pilot/commands.json`
- `saveCommands(projectPath, commands)` — Save commands to disk
- `runCommand(commandId)` — Start a dev command
- `stopCommand(commandId)` — Stop a running command
- `setExpandedCommand(id)` — Expand/collapse output
- `updateState(commandId, state)` — Update command state
- `appendOutput(commandId, output)` — Append output to command
- `setServerUrl(commandId, localUrl, tunnelUrl)` — Set detected URL and tunnel

**IPC Channels:**
- `IPC.DEV_LOAD_CONFIG` — Load commands
- `IPC.DEV_SAVE_CONFIG` — Save commands
- `IPC.DEV_RUN_COMMAND` — Run command
- `IPC.DEV_STOP_COMMAND` — Stop command
- `IPC.DEV_COMMAND_OUTPUT` (listen) — Receive output from command
- `IPC.DEV_COMMAND_STATUS` (listen) — Receive state updates
- `IPC.DEV_SERVER_URL` (listen) — Receive detected URL and tunnel

**Notes:**
- Listens for push events from main process (output, status, URL)
- Commands are spawned as child processes in main process
- Tunnel URLs are cleared when command stops

---

### `useExtensionStore`

**File:** `src/stores/extension-store.ts`

**State:**
```typescript
interface ExtensionStore {
  extensions: InstalledExtension[];
  skills: InstalledSkill[];
}
```

**Actions:**
- `loadExtensions()` — Load installed extensions
- `loadSkills()` — Load installed skills
- `toggleExtension(extensionId)` — Enable/disable an extension
- `removeExtension(extensionId)` — Delete an extension
- `removeSkill(skillId)` — Delete a skill
- `importExtensionZip(zipPath, scope)` — Import extension from zip
- `importSkillZip(zipPath, scope)` — Import skill from zip

**IPC Channels:**
- `IPC.EXTENSIONS_LIST` — List extensions
- `IPC.SKILLS_LIST` — List skills
- `IPC.EXTENSIONS_TOGGLE` — Enable/disable extension
- `IPC.EXTENSIONS_REMOVE` — Delete extension
- `IPC.SKILLS_REMOVE` — Delete skill
- `IPC.EXTENSIONS_IMPORT_ZIP` — Import extension
- `IPC.SKILLS_IMPORT_ZIP` — Import skill

**Notes:**
- Extensions and skills can be global (`<PILOT_DIR>/extensions|skills/`) or project-scoped (`<project>/.pilot/extensions|skills/`)
- State is reloaded after toggle/remove/import operations

---

### `useGitStore`

**File:** `src/stores/git-store.ts`

**State:**
```typescript
interface GitStore {
  isAvailable: boolean;
  isRepo: boolean;
  status: GitStatus | null;
  branches: GitBranch[];
  commitLog: GitCommit[];
  blameLines: BlameLine[];
  stashes: GitStash[];
  diffContent: string | null;
  blameFilePath: string | null;
  isLoading: boolean;
  error: string | null;
  currentProjectPath: string | null;
}
```

**Actions:**
- `initGit(projectPath)` — Initialize git service for project
- `initRepo()` — Initialize a new git repo
- `refreshStatus()` — Reload git status
- `refreshBranches()` — Reload branch list
- `stageFiles(paths)` — Stage files
- `unstageFiles(paths)` — Unstage files
- `commit(message)` — Create commit
- `push()` — Push to remote
- `pull()` — Pull from remote
- `checkout(branch)` — Switch branch
- `createBranch(name)` — Create new branch
- `loadCommitLog(options?)` — Load commit history
- `loadBlame(filePath)` — Load git blame for file
- `loadStashes()` — Load stash list
- `loadDiff(ref1?, ref2?)` — Load diff between refs
- `applyStash(stashId)` — Apply a stash
- `clearBlame()` — Clear blame data
- `clearDiff()` — Clear diff content
- `reset()` — Reset store to initial state

**IPC Channels:**
- `IPC.GIT_INIT` — Initialize git service
- `IPC.GIT_INIT_REPO` — Create new repo
- `IPC.GIT_STATUS` — Get status
- `IPC.GIT_BRANCHES` — Get branches
- `IPC.GIT_STAGE` — Stage files
- `IPC.GIT_UNSTAGE` — Unstage files
- `IPC.GIT_COMMIT` — Create commit
- `IPC.GIT_PUSH` — Push
- `IPC.GIT_PULL` — Pull
- `IPC.GIT_CHECKOUT` — Switch branch
- `IPC.GIT_CREATE_BRANCH` — Create branch
- `IPC.GIT_LOG` — Get commit log
- `IPC.GIT_BLAME` — Get blame
- `IPC.GIT_STASH_LIST` — Get stashes
- `IPC.GIT_STASH_APPLY` — Apply stash
- `IPC.GIT_DIFF` — Get diff

**Notes:**
- `initGit()` must be called before any other actions
- `isAvailable` tracks whether git is installed
- `isRepo` tracks whether current project is a git repo
- Wraps `simple-git` library in main process

---

### `useMemoryStore`

**File:** `src/stores/memory-store.ts`

**State:**
```typescript
interface MemoryState {
  globalMemory: string | null;
  projectMemory: string | null;
  memoryCount: MemoryCount | null;
  lastUpdate: { count: number; preview: string } | null;
  lastUpdateTime: number;
  memoryEnabled: boolean;
  autoExtractEnabled: boolean;
}

interface MemoryCount {
  global: number;
  project: number;
  total: number;
}
```

**Actions:**
- `loadMemories(projectPath)` — Load all three memory files
- `loadMemoryCount(projectPath)` — Load memory count for status bar
- `saveMemory(scope, projectPath, content)` — Save memory file
- `clearMemory(scope, projectPath)` — Clear memory file
- `setLastUpdate(update)` — Show memory update notification (auto-clears after 3s)
- `clearLastUpdate()` — Clear notification immediately
- `setMemoryEnabled(enabled)` — Toggle memory system
- `setAutoExtractEnabled(enabled)` — Toggle auto-extraction

**IPC Channels:**
- `IPC.MEMORY_GET_FILES` — Load memory files
- `IPC.MEMORY_GET_COUNT` — Get memory count
- `IPC.MEMORY_SAVE_FILE` — Save memory file
- `IPC.MEMORY_CLEAR` — Clear memory file
- `IPC.MEMORY_SET_ENABLED` — Toggle memory system

**Notes:**
- Two memory scopes: global and project
- `lastUpdate` is shown in status bar and auto-clears after 3 seconds
- Silent failures (errors are ignored)

---

### `useOutputWindowStore`

**File:** `src/stores/output-window-store.ts`

**State:**
```typescript
interface OutputWindowStore {
  windows: Record<string, OutputWindow>;
  draggedTab: { windowId: string; commandId: string } | null;
}

interface OutputWindow {
  id: string;
  commandIds: string[];
  activeCommandId: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
}
```

**Actions:**
- `openOutput(commandId)` — Open output window for command
- `closeOutput(windowId, commandId)` — Close a tab (or window if last tab)
- `closeWindow(windowId)` — Close entire window
- `setActiveTab(windowId, commandId)` — Switch active tab
- `updatePosition(windowId, pos)` — Update window position
- `updateSize(windowId, size)` — Update window size
- `setDraggedTab(data)` — Set/clear dragged tab state
- `detachTab(windowId, commandId, position)` — Detach tab to new window
- `attachTab(fromWindowId, commandId, toWindowId)` — Attach tab to existing window
- `reorderTabs(windowId, commandIds)` — Reorder tabs within window

**IPC Channels:**
- None

**Notes:**
- Manages draggable/detachable output windows for dev commands
- Windows cascade on creation (offset by 30px each)
- Last tab in window closes the window
- Command output can only be open in one window at a time

---

### `useProjectStore`

**File:** `src/stores/project-store.ts`

**State:**
```typescript
interface ProjectStore {
  projectPath: string | null;
  fileTree: FileNode[];
  selectedFilePath: string | null;
  previewContent: string | null;
  previewError: string | null;
  isLoadingTree: boolean;
  isLoadingPreview: boolean;
  isEditing: boolean;
  editContent: string;
  isSaving: boolean;
  saveError: string | null;
}
```

**Actions:**
- `setProjectPath(path)` — Set current project and notify main process
- `loadFileTree()` — Reload file tree
- `selectFile(path)` — Load file for preview
- `clearPreview()` — Clear selected file
- `openProjectDialog()` — Show OS folder picker
- `startEditing()` — Enter edit mode for current file
- `cancelEditing()` — Exit edit mode
- `setEditContent(content)` — Update edit buffer
- `saveFile()` — Save edited file to disk

**IPC Channels:**
- `IPC.PROJECT_SET_DIRECTORY` — Set project path
- `IPC.PROJECT_FILE_TREE` — Get file tree
- `IPC.PROJECT_READ_FILE` — Read file content
- `IPC.PROJECT_WRITE_FILE` — Write file content
- `IPC.PROJECT_OPEN_DIALOG` — Show folder picker

**Notes:**
- Setting project path triggers tab creation/switching
- File editing is local to this store — agent file writes go through sandbox
- Edit mode uses a separate `editContent` buffer

---

### `usePromptStore`

**File:** `src/stores/prompt-store.ts`

**State:**
```typescript
interface PromptState {
  prompts: PromptTemplate[];
  loading: boolean;
}
```

**Actions:**
- `loadPrompts()` — Load all prompt templates
- `getById(id)` — Fetch single prompt by ID
- `getByCommand(command)` — Fetch prompt by slash command
- `getCommands()` — Get all slash commands with metadata
- `getSystemCommands()` — Get built-in system commands
- `validateCommand(command, excludePromptId?)` — Check if command is available
- `createPrompt(input, projectPath?)` — Create new prompt template
- `updatePrompt(id, updates)` — Update prompt template
- `deletePrompt(id)` — Delete prompt template (soft delete)
- `unhidePrompt(id)` — Restore deleted prompt
- `fillTemplate(content, values)` — Fill template variables
- `reload()` — Reload prompts from disk

**IPC Channels:**
- `IPC.PROMPTS_GET_ALL` — List all prompts
- `IPC.PROMPTS_GET` — Get prompt by ID
- `IPC.PROMPTS_GET_BY_COMMAND` — Get prompt by command
- `IPC.PROMPTS_GET_COMMANDS` — List commands
- `IPC.PROMPTS_GET_SYSTEM_COMMANDS` — List system commands
- `IPC.PROMPTS_VALIDATE_COMMAND` — Validate command
- `IPC.PROMPTS_CREATE` — Create prompt
- `IPC.PROMPTS_UPDATE` — Update prompt
- `IPC.PROMPTS_DELETE` — Delete prompt
- `IPC.PROMPTS_UNHIDE` — Unhide prompt
- `IPC.PROMPTS_FILL` — Fill template
- `IPC.PROMPTS_RELOAD` — Reload from disk

**Notes:**
- Prompts can be global or project-scoped
- Slash commands are registered dynamically based on templates
- Templates support variables like `{{projectPath}}`, `{{fileName}}`

---

### `useSandboxStore`

**File:** `src/stores/sandbox-store.ts`

**State:**
```typescript
interface SandboxStore {
  diffsByTab: Record<string, StagedDiff[]>;
  yoloMode: boolean;
  jailEnabled: boolean;
  diffViewMode: 'unified' | 'side-by-side';
  autoAcceptTools: Record<string, Record<string, boolean>>;
}
```

**Actions:**
- `addDiff(tabId, diff)` — Add staged diff (auto-accepts if tool is auto-accepted)
- `updateDiffStatus(tabId, diffId, status)` — Update diff status
- `getPendingDiffs(tabId)` — Get pending diffs for tab
- `clearDiffs(tabId)` — Clear all diffs for tab
- `setYoloMode(enabled)` — Toggle yolo mode (local only)
- `setJailEnabled(enabled)` — Toggle jail mode
- `setDiffViewMode(mode)` — Toggle diff view mode
- `setAutoAcceptTool(tabId, toolName, enabled)` — Auto-accept tool outputs
- `isAutoAcceptTool(tabId, toolName)` — Check if tool is auto-accepted
- `getAutoAcceptedTools(tabId)` — Get list of auto-accepted tools
- `acceptDiff(tabId, diffId)` — Accept diff (apply to disk)
- `rejectDiff(tabId, diffId)` — Reject diff
- `acceptAll(tabId)` — Accept all pending diffs
- `toggleYolo(tabId)` — Toggle yolo mode (IPC)

**IPC Channels:**
- `IPC.SANDBOX_ACCEPT_DIFF` — Accept diff
- `IPC.SANDBOX_REJECT_DIFF` — Reject diff
- `IPC.SANDBOX_ACCEPT_ALL` — Accept all diffs
- `IPC.SANDBOX_TOGGLE_YOLO` — Toggle yolo mode
- `IPC.SANDBOX_STAGED_DIFF` (listen) — Receive staged diff from agent

**Notes:**
- Auto-accept is per-tab, per-tool, session-only (not persisted)
- Tool names: `bash`, `write`, `edit`
- Diffs are staged in main process and pushed to renderer
- `addDiff` checks `autoAcceptTools` and immediately accepts if enabled

---

### `useSessionStore`

**File:** `src/stores/session-store.ts`

**State:**
```typescript
interface SessionStore {
  sessions: SessionInfo[];
  searchQuery: string;
  isLoading: boolean;
}

interface SessionInfo {
  path: string;
  projectPath: string;
  title: string;
  lastActive: number;
  messageCount: number;
  isPinned: boolean;
  isArchived: boolean;
}
```

**Actions:**
- `loadSessions(projectPaths?)` — Load sessions for given projects
- `pinSession(path)` — Pin session (optimistic)
- `unpinSession(path)` — Unpin session (optimistic)
- `archiveSession(path)` — Archive session (optimistic)
- `unarchiveSession(path)` — Unarchive session (optimistic)
- `setSearchQuery(query)` — Update search filter
- `getFilteredSessions()` — Get filtered and sorted sessions

**IPC Channels:**
- `IPC.SESSION_LIST_ALL` — List sessions

**Notes:**
- Pinned sessions sort first, then by last active
- Archived sessions are filtered out
- Search filters by title and project path
- Optimistic updates for pin/archive (IPC calls not shown)

---

### `useSubagentStore`

**File:** `src/stores/subagent-store.ts`

**State:**
```typescript
interface SubagentState {
  subagentsByTab: Record<string, SubagentRecord[]>;
  poolProgressByTab: Record<string, Record<string, SubagentPoolProgress>>;
  orchestratorByTab: Record<string, boolean>;
}
```

**Actions:**
- `setSubagents(tabId, subagents)` — Replace all subagents for tab
- `updateSubagent(tabId, subId, updates)` — Update or add subagent
- `addSubagent(tabId, subagent)` — Add new subagent
- `removeSubagent(tabId, subId)` — Remove subagent
- `setPoolProgress(tabId, poolId, progress)` — Update pool progress
- `setOrchestrator(tabId, active)` — Set orchestrator mode
- `clearTab(tabId)` — Clear all subagent data for tab
- `getActiveCount(tabId)` — Count running/queued subagents
- `getTotalTokens(tabId)` — Sum token usage across all subagents

**IPC Channels:**
- None (updated via `useSubagentEvents` hook)

**Notes:**
- Subagents are managed by the Pi SDK orchestrator
- Pool progress tracks parallel task execution
- Events are pushed from main process via `IPC.SUBAGENT_EVENT` and `IPC.SUBAGENT_POOL_PROGRESS`

---

### `useTabStore`

**File:** `src/stores/tab-store.ts`

**State:**
```typescript
interface TabStore {
  tabs: TabState[];
  activeTabId: string | null;
  closedTabStack: TabState[];
}

interface TabState {
  id: string;
  type: 'chat' | 'file' | 'tasks' | 'docs';
  filePath: string | null;
  title: string;
  projectPath: string | null;
  sessionPath: string | null;
  projectColor: string;
  isPinned: boolean;
  order: number;
  scrollPosition: number;
  inputDraft: string;
  panelConfig: {
    sidebarVisible: boolean;
    contextPanelVisible: boolean;
    contextPanelTab: 'files' | 'git' | 'changes' | 'tasks';
  };
  lastActiveAt: number;
  hasUnread: boolean;
}
```

**Actions:**
- `addTab(projectPath?)` — Create new chat tab
- `addFileTab(filePath, projectPath)` — Create file viewer tab
- `addTasksTab(projectPath)` — Create task board tab
- `addDocsTab(page?)` — Create docs viewer tab
- `closeTab(tabId)` — Close tab (adds to closed stack)
- `switchTab(tabId)` — Switch to tab
- `switchToTabByIndex(index)` — Switch by visual index
- `nextTab()` — Switch to next tab
- `prevTab()` — Switch to previous tab
- `moveTab(tabId, newOrder)` — Reorder tab
- `reopenClosedTab()` — Restore last closed tab
- `pinTab(tabId)` — Pin tab
- `unpinTab(tabId)` — Unpin tab
- `updateTab(tabId, updates)` — Update tab properties
- `setActiveTabTitle(title)` — Set active tab title
- `getGroupedTabs()` — Get tabs grouped by project

**IPC Channels:**
- None (persisted via `useWorkspacePersistence` hook)

**Notes:**
- Tabs are grouped by project with color coding
- Closed tab stack stores last 10 closed tabs
- Tab order is managed via `order` property (immutable updates)
- Pinned tabs always sort first
- File and task tabs are reused if they already exist for the same path/project

---

### `useTaskStore`

**File:** `src/stores/task-store.ts`

**State:**
```typescript
interface TaskStore {
  tasksEnabled: boolean;
  tasks: TaskItem[];
  isLoading: boolean;
  viewMode: 'kanban' | 'table';
  selectedTaskId: string | null;
  showCreateDialog: boolean;
  editingTask: TaskItem | null;
  filters: TaskFilters;
  readyTasks: TaskItem[];
  blockedTasks: TaskItem[];
  epics: TaskItem[];
}

interface TaskFilters {
  status: TaskStatus[];
  priority: TaskPriority[];
  type: TaskType[];
  labels: string[];
  assignee: TaskAssignee[];
  search: string;
  epicId: string | null;
}
```

**Actions:**
- `loadBoard(projectPath)` — Load task board
- `createTask(projectPath, input)` — Create new task
- `updateTask(projectPath, taskId, updates)` — Update task
- `deleteTask(projectPath, taskId)` — Delete task
- `addComment(projectPath, taskId, text)` — Add comment
- `moveTask(projectPath, taskId, newStatus)` — Move task to column
- `selectTask(taskId)` — Select task for detail view
- `setViewMode(mode)` — Switch view mode
- `setFilter(key, value)` — Update filter
- `clearFilters()` — Reset filters
- `setTasksEnabled(enabled)` — Toggle task system
- `setShowCreateDialog(show)` — Show/hide create dialog
- `setEditingTask(task)` — Open edit dialog
- `getFilteredTasks()` — Get filtered tasks
- `getTasksByStatus(status)` — Get tasks in a column
- `getEpicProgress(projectPath, epicId)` — Get epic progress
- `getDependencies(projectPath, taskId)` — Get dependency chain

**IPC Channels:**
- `IPC.TASKS_LOAD_BOARD` — Load board
- `IPC.TASKS_CREATE` — Create task
- `IPC.TASKS_UPDATE` — Update task
- `IPC.TASKS_DELETE` — Delete task
- `IPC.TASKS_COMMENT` — Add comment
- `IPC.TASKS_EPIC_PROGRESS` — Get epic progress
- `IPC.TASKS_DEPENDENCIES` — Get dependencies
- `IPC.TASKS_SET_ENABLED` — Toggle task system

**Notes:**
- Tasks are stored in `<project>/.pilot/tasks/`
- `readyTasks` and `blockedTasks` are derived in main process
- Reloads board after mutations to get fresh derived state
- Filters are client-side only

---

### `useUIStore`

**File:** `src/stores/ui-store.ts`

**State:**
```typescript
interface UIStore {
  sidebarVisible: boolean;
  sidebarPane: 'sessions' | 'memory' | 'tasks';
  contextPanelVisible: boolean;
  contextPanelTab: 'files' | 'git' | 'changes' | 'tasks' | 'agents';
  focusMode: boolean;
  sidebarWidth: number;
  contextPanelWidth: number;
  settingsOpen: boolean;
  settingsTab: 'general' | 'auth' | 'project' | 'extensions' | 'skills' | 'developer' | 'keybindings' | 'memory' | 'prompts' | 'companion';
  terminalVisible: boolean;
  terminalHeight: number;
  terminalTabs: { id: string; name: string }[];
  activeTerminalId: string | null;
  scratchPadVisible: boolean;
  scratchPadContent: string;
  aboutOpen: boolean;
}
```

**Actions:**
- `toggleSidebar()` — Toggle left sidebar
- `setSidebarPane(pane)` — Switch sidebar pane
- `toggleContextPanel()` — Toggle right context panel
- `setContextPanelTab(tab)` — Switch context panel tab
- `toggleFocusMode()` — Toggle focus mode (hides both panels)
- `setSidebarWidth(width)` — Resize sidebar (200-400px)
- `setContextPanelWidth(width)` — Resize context panel (250-500px)
- `openSettings(tab?)` — Open settings modal
- `closeSettings()` — Close settings modal
- `setSettingsTab(tab)` — Switch settings tab
- `toggleTerminal()` — Toggle terminal panel
- `setTerminalHeight(height)` — Resize terminal (150-600px)
- `addTerminalTab()` — Create new terminal tab
- `closeTerminalTab(id)` — Close terminal tab
- `setActiveTerminal(id)` — Switch active terminal
- `renameTerminalTab(id, name)` — Rename terminal tab
- `toggleScratchPad()` — Toggle scratch pad
- `setScratchPadContent(content)` — Update scratch pad (auto-saves to localStorage)
- `openAbout()` — Open about dialog
- `closeAbout()` — Close about dialog

**IPC Channels:**
- None

**Notes:**
- Scratch pad content is saved to localStorage
- Terminal tabs are named sequentially: `zsh`, `zsh (2)`, etc.
- Focus mode hides both sidebar and context panel
- Panel sizes are clamped to min/max values

---

## Hooks Quick Reference

| Hook | File | Purpose | IPC |
|---|---|---|---|
| `useAgentSession` | `useAgentSession.ts` | Agent event bridge, streaming, model cycling | Agent, Model, Session, Memory, Tasks |
| `useAuthEvents` | `useAuthEvents.ts` | OAuth flow events | Auth |
| `useLayoutMode` | `useCompanionMode.ts` | Companion/responsive detection | None |
| `useDefaultCommands` | `useDefaultCommands.ts` | Register command palette commands | None |
| `useDetectedEditors` | `useDetectedEditors.ts` | Detect installed editors | Shell |
| `useFileWatcher` | `useFileWatcher.ts` | Reload file tree on FS changes | Project |
| `useHighlight` | `useHighlight.ts` | Syntax highlighting | None |
| `useKeyboardShortcut` | `useKeyboardShortcut.ts` | Global keyboard handler | None |
| `useSandboxEvents` | `useSandboxEvents.ts` | Staged diff events | Sandbox |
| `useSubagentEvents` | `useSubagentEvents.ts` | Subagent lifecycle events | Subagent |
| `useWorkspacePersistence` | `useWorkspacePersistence.ts` | Workspace save/restore | Tabs |

---

## Hook Details

### `useAgentSession`

**File:** `src/hooks/useAgentSession.ts`

**Purpose:**
Bridges agent events from main process to chat store. Provides high-level actions for agent interaction.

**Returns:**
```typescript
{
  sendMessage: (text: string, images?: ImageContent[]) => Promise<void>;
  steerAgent: (text: string) => Promise<void>;
  followUpAgent: (text: string) => Promise<void>;
  abortAgent: () => Promise<void>;
  cycleModel: () => Promise<void>;
  selectModel: (provider: string, modelId: string) => Promise<void>;
  cycleThinking: () => Promise<void>;
  refreshQueued: (tabId?: string) => Promise<void>;
}
```

**IPC Channels (Listened):**
- `IPC.AGENT_EVENT` — Agent session events (message_start, message_update, tool_execution_start, etc.)
- `IPC.MEMORY_UPDATED` — Memory update notifications
- `IPC.MEMORY_SHOW_PANEL` — Show memory panel command
- `IPC.TASKS_SHOW_PANEL` — Show tasks panel command
- `IPC.TASKS_SHOW_CREATE` — Show task create dialog command

**IPC Channels (Invoked):**
- `IPC.AGENT_PROMPT` — Send user message
- `IPC.AGENT_STEER` — Send steering message
- `IPC.AGENT_FOLLOW_UP` — Send follow-up message
- `IPC.AGENT_ABORT` — Abort agent
- `IPC.AGENT_GET_QUEUED` — Get queued messages
- `IPC.MODEL_CYCLE` — Cycle model
- `IPC.MODEL_SET` — Select model
- `IPC.MODEL_CYCLE_THINKING` — Cycle thinking level
- `IPC.SESSION_GET_STATS` — Get session stats
- `IPC.SESSION_GET_CONTEXT_USAGE` — Get context usage
- `IPC.MODEL_GET_INFO` — Get model info

**Key Logic:**
- `handleEvent()` processes all agent event types and updates chat store
- `sendMessage()` auto-renames tab on first message (up to 40 chars)
- `refreshSessionStats()` fetches tokens, cost, and context usage after each turn
- Slash commands are not added to chat history
- Tool calls are stored in the last assistant message
- Auto-retry info is shown in message and cleared on retry end

---

### `useAuthEvents`

**File:** `src/hooks/useAuthEvents.ts`

**Purpose:**
Listens for OAuth flow events from main process and updates auth store.

**IPC Channels (Listened):**
- `IPC.AUTH_LOGIN_OAUTH_EVENT` — OAuth flow events (success, prompt, progress)

**Key Logic:**
- `success` event triggers `loadStatus()` refresh
- `prompt` event sets `oauthPrompt` (waiting for user input)
- `progress` event updates `oauthMessage` (status text)

---

### `useLayoutMode`

**File:** `src/hooks/useCompanionMode.ts`

**Purpose:**
Detects companion mode (browser without Electron) and responsive breakpoints.

**Returns:**
```typescript
{
  isCompanion: boolean;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  platform: 'electron' | 'ios' | 'browser';
}
```

**Key Logic:**
- Companion mode is detected by absence of `window.api`
- Platform is `ios` if user agent matches iPhone/iPad/iPod
- Breakpoints: mobile < 768px, tablet 768-1024px, desktop > 1024px
- Tracks viewport width on resize

---

### `useDefaultCommands`

**File:** `src/hooks/useDefaultCommands.ts`

**Purpose:**
Registers all built-in commands for command palette.

**Key Logic:**
- Registers commands from `DEFAULT_KEYBINDINGS` with shortcuts
- Adds memory commands (open panel, edit global, toggle auto-extract)
- Adds task commands (open board, create task, show ready, switch view)
- Uses `keybindOverrides` from app settings
- Converts combo strings to symbols (`Cmd` → `⌘`)

---

### `useDetectedEditors`

**File:** `src/hooks/useDetectedEditors.ts`

**Purpose:**
Detects installed code editors with CLI commands.

**Returns:**
```typescript
DetectedEditor[] // { id, name, cli }
```

**IPC Channels (Invoked):**
- `IPC.SHELL_DETECT_EDITORS` — Detect editors

**Key Logic:**
- Cached after first invocation
- Detects VS Code, Cursor, Sublime, Atom, etc.
- Returns CLI command for opening files

---

### `useFileWatcher`

**File:** `src/hooks/useFileWatcher.ts`

**Purpose:**
Listens for filesystem change notifications and reloads file tree.

**IPC Channels (Listened):**
- `IPC.PROJECT_FS_CHANGED` — Filesystem change event

**Key Logic:**
- Calls `loadFileTree()` when files change
- Main process watches project directory with `chokidar`

---

### `useHighlight`

**File:** `src/hooks/useHighlight.ts`

**Purpose:**
Syntax highlights code using highlight.js.

**Params:**
```typescript
(code: string | null, filePath: string | null)
```

**Returns:**
```typescript
string[] | null // HTML strings per line, or null if not loaded/supported
```

**Key Logic:**
- Returns `null` while loading or if language is unsupported
- Detects language from file extension
- Returns array of HTML strings (one per line) with hljs classes

---

### `useKeyboardShortcut`

**File:** `src/hooks/useKeyboardShortcut.ts`

**Purpose:**
Global keyboard shortcut handler with modifier support.

**Params:**
```typescript
config: ShortcutConfig // { key, modifiers, action, enabled? }
// or
configs: ShortcutConfig[]
```

**Key Logic:**
- Supports `meta`, `ctrl`, `alt`, `shift` modifiers
- `meta` maps to Cmd on macOS, Ctrl on Windows/Linux
- Skips shortcuts when focus is in input/textarea (unless modifier-heavy)
- Prevents default and stops propagation on match

---

### `useSandboxEvents`

**File:** `src/hooks/useSandboxEvents.ts`

**Purpose:**
Listens for staged diff events from main process.

**IPC Channels (Listened):**
- `IPC.SANDBOX_STAGED_DIFF` — Staged diff event (`{ tabId, diff }`)

**Key Logic:**
- Calls `addDiff()` which checks auto-accept rules
- Diffs are created by sandboxed tools in main process

---

### `useSubagentEvents`

**File:** `src/hooks/useSubagentEvents.ts`

**Purpose:**
Listens for subagent lifecycle and pool progress events.

**IPC Channels (Listened):**
- `IPC.SUBAGENT_EVENT` — Subagent start/end events
- `IPC.SUBAGENT_POOL_PROGRESS` — Pool progress updates

**Key Logic:**
- `subagent_start` creates new subagent record
- `subagent_end` updates status, result, error, token usage
- Pool progress tracks parallel task execution

---

### `useWorkspacePersistence`

**File:** `src/hooks/useWorkspacePersistence.ts`

**Purpose:**
Restores workspace state on app startup and auto-saves on changes.

**IPC Channels (Invoked):**
- `IPC.TABS_RESTORE_STATE` — Load saved workspace
- `IPC.TABS_SAVE_STATE` — Save workspace

**Key Logic:**
- Restores tabs, active tab, UI layout, project path on mount
- Auto-saves 500ms after tab/UI changes (debounced)
- Guards against saving before restore completes (prevents data loss on crash)
- Creates default tab if no saved state exists
- Saves on `beforeunload` event

---

## Common Patterns

### IPC in Stores

```typescript
// Invoke IPC and update state
loadData: async () => {
  set({ isLoading: true, error: null });
  try {
    const result = await invoke(IPC.MY_CHANNEL, arg1, arg2);
    set({ data: result, isLoading: false });
  } catch (error) {
    set({ error: String(error), isLoading: false });
  }
}
```

### IPC Listeners in Hooks

```typescript
useEffect(() => {
  const unsub = on(IPC.MY_EVENT, (payload) => {
    // Update store
    useMyStore.getState().updateFromEvent(payload);
  });
  return unsub; // Always clean up
}, []);
```

### Accessing Stores Outside React

```typescript
// In a hook or utility function
const { someAction } = useMyStore.getState();
someAction(args);
```

### Immutable Updates

```typescript
// ❌ Wrong — mutates state
set((state) => {
  state.items.push(newItem);
  return state;
});

// ✅ Correct — returns new object
set((state) => ({
  items: [...state.items, newItem],
}));
```

### Derived Values

```typescript
// Store
interface MyStore {
  items: Item[];
  getFiltered: () => Item[];
}

// In selector
getFiltered: () => {
  const { items, filter } = get();
  return items.filter(item => item.category === filter);
}

// In component
const filtered = useMyStore(s => s.getFiltered());
```
