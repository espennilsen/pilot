// Shared type definitions for Pilot
// These types are used by both main and renderer processes
// All types must be serializable over IPC (Structured Clone)

// Session metadata (Pilot layer on top of SDK sessions)
export interface SessionMetadata {
  sessionPath: string;
  projectPath: string;
  isPinned: boolean;
  isArchived: boolean;
  customTitle: string | null;
  messageCount: number;
  created: number;   // timestamp
  modified: number;  // timestamp
}

// Pilot app settings (stored in ~/.config/.pilot/app-settings.json)
export interface PilotAppSettings {
  /** Custom pi agent config directory. Default: ~/.config/.pilot */
  piAgentDir: string;
  /** Preferred terminal app. null = system default */
  terminalApp: string | null;
  /** Preferred code editor CLI command. null = auto-detect first available */
  editorCli: string | null;
  /** Whether the onboarding wizard has been completed */
  onboardingComplete: boolean;
  /** Whether developer mode (terminal, dev commands) is enabled */
  developerMode: boolean;
  /** User keybind overrides. Maps shortcut ID to key combo string (e.g. "meta+shift+b") or null to disable. */
  keybindOverrides?: Record<string, string | null>;
  /** Companion server port. Default: 18088 */
  companionPort?: number;
  /** Companion server protocol. Default: 'https' */
  companionProtocol?: 'http' | 'https';
  /** Whether to automatically start persistent dev commands on project launch */
  autoStartDevServer?: boolean;
}

// Sandbox settings
export interface ProjectSandboxSettings {
  jail: {
    enabled: boolean;
    allowedPaths: string[];
  };
  yoloMode: boolean;
}

// Staged diff for review
export interface StagedDiff {
  id: string;
  tabId: string;
  toolCallId: string;
  filePath: string;
  operation: 'edit' | 'create' | 'delete' | 'bash';
  originalContent: string | null;
  proposedContent: string;
  /** Unified diff string from pi's edit tool (with @@ hunks, context lines) */
  unifiedDiff?: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number; // timestamp, not Date (must be serializable over IPC)
}

// Git types
export interface GitStatus {
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
  isClean: boolean;
}

export interface GitFileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'copied';
  oldPath?: string;
}

export interface GitBranch {
  name: string;
  current: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  lastCommitHash: string;
  lastCommitDate: number;
  lastCommitMessage: string;
}

export interface GitCommit {
  hash: string;
  hashShort: string;
  author: string;
  authorEmail: string;
  date: number;
  message: string;
  parents: string[];
  refs: string[];
}

export interface GitLogOptions {
  maxCount?: number;
  branch?: string;
  author?: string;
  since?: number;
  until?: number;
  filePath?: string;
  searchQuery?: string;
}

export interface BlameLine {
  lineNumber: number;
  commitHash: string;
  author: string;
  date: number;
  content: string;
}

export interface GitStash {
  index: number;
  message: string;
  date: number;
  branch: string;
}

// Dev commands
export interface DevCommand {
  id: string;
  label: string;
  command: string;
  icon: string;
  cwd: string;
  env: Record<string, string>;
  persistent: boolean;
}

export interface DevCommandState {
  commandId: string;
  status: 'idle' | 'running' | 'passed' | 'failed';
  pid: number | null;
  output: string;
  exitCode: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  /** Auto-detected localhost URL from command output (e.g. http://localhost:5173) */
  detectedUrl: string | null;
}

/** Tunnel mapping for a dev server port */
export interface DevServerTunnel {
  commandId: string;
  label: string;
  localUrl: string;
  tunnelUrl: string;
  tunnelType: 'tailscale' | 'cloudflare';
}

// Memory
export interface MemoryFiles {
  global: string | null;
  projectShared: string | null;
}

export interface MemoryCount {
  global: number;
  project: number;
  total: number;
}

export interface MemoryCommandResult {
  action: 'saved' | 'removed' | 'show_panel';
  text: string;
}

// File tree
export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

// Extension/skill types
export interface InstalledExtension {
  id: string;
  name: string;
  description: string;
  version: string;
  scope: 'global' | 'project' | 'built-in';
  path: string;
  enabled: boolean;
  hasErrors: boolean;
  errorMessage?: string;
}

export interface InstalledSkill {
  id: string;
  name: string;
  description: string;
  scope: 'global' | 'project' | 'built-in';
  path: string;
  skillMdPath: string;
}

export interface ImportResult {
  success: boolean;
  id: string;
  name: string;
  type: 'extension' | 'skill';
  scope: 'global' | 'project';
  error?: string;
}

// Workspace state (saved tab layout and UI state)
export interface SavedTabState {
  id: string;
  type: 'chat' | 'file';
  filePath: string | null;
  title: string;
  projectPath: string | null;
  sessionPath?: string | null;
  isPinned: boolean;
  order: number;
  inputDraft: string;
  panelConfig: {
    sidebarVisible: boolean;
    contextPanelVisible: boolean;
    contextPanelTab: 'files' | 'git' | 'changes' | 'tasks' | 'agents';
  };
}

export interface SavedUIState {
  sidebarVisible: boolean;
  contextPanelVisible: boolean;
  contextPanelTab: 'files' | 'git' | 'changes' | 'tasks' | 'agents';
  focusMode: boolean;
  sidebarWidth: number;
  contextPanelWidth: number;
  terminalVisible: boolean;
  terminalHeight: number;
}

export interface WorkspaceState {
  tabs: SavedTabState[];
  activeTabId: string | null;
  ui: SavedUIState;
  windowBounds?: { x: number; y: number; width: number; height: number };
  windowMaximized?: boolean;
}

// ─── Tasks ──────────────────────────────────────────────────────────────

export type TaskStatus = 'open' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 0 | 1 | 2 | 3 | 4;
export type TaskType = 'epic' | 'task' | 'bug' | 'feature';
export type TaskAssignee = 'human' | 'agent' | null;

export interface TaskDependency {
  type: 'blocks' | 'blocked_by' | 'related';
  taskId: string;
}

export interface TaskComment {
  id: string;
  text: string;
  author: 'human' | 'agent';
  createdAt: string;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  type: TaskType;
  parentId: string | null;
  dependencies: TaskDependency[];
  labels: string[];
  assignee: TaskAssignee;
  estimateMinutes: number | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  createdBy: 'human' | 'agent';
  comments: TaskComment[];
}

export interface TaskBoardData {
  projectPath: string;
  tasks: TaskItem[];
  readyTasks: TaskItem[];
  blockedTasks: TaskItem[];
  epics: TaskItem[];
}

export interface TaskEpicProgress {
  total: number;
  open: number;
  inProgress: number;
  review: number;
  done: number;
  percentComplete: number;
}

export interface TaskDependencyChain {
  blockers: TaskItem[];
  dependents: TaskItem[];
}

// ─── Prompt Library ──────────────────────────────────────────────────────

export interface CommandConflict {
  type: 'system' | 'duplicate';
  reason: string;
  owner?: string;
  conflictingPromptId?: string;
}

export interface PromptVariable {
  name: string;
  placeholder: string;
  type: 'text' | 'multiline' | 'select' | 'file';
  options?: string[];
  required: boolean;
  defaultValue?: string;
}

export interface PromptTemplate {
  id: string;
  title: string;
  description: string;
  content: string;
  category: string;
  icon: string;
  command: string | null;
  commandConflict: CommandConflict | null;
  variables: PromptVariable[];
  source: 'builtin' | 'user' | 'project';
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PromptCreateInput {
  title: string;
  description?: string;
  content: string;
  category?: string;
  icon?: string;
  command?: string | null;
  scope: 'global' | 'project';
}

export interface PromptUpdateInput {
  title?: string;
  description?: string;
  content?: string;
  category?: string;
  icon?: string;
  command?: string | null;
  hidden?: boolean;
}

// ─── Subagents ──────────────────────────────────────────────────────────

export type SubagentStatus = 'queued' | 'running' | 'completed' | 'failed' | 'aborted';

export interface SubagentRecord {
  id: string;
  parentTabId: string;
  poolId: string | null;
  status: SubagentStatus;
  role: string;
  prompt: string;
  result: string | null;
  error: string | null;
  modifiedFiles: string[];
  createdAt: number;
  completedAt: number | null;
  tokenUsage: { input: number; output: number };
}

export interface SubagentSpawnOptions {
  role: string;
  prompt: string;
  systemPrompt?: string;
  readOnly?: boolean;
  allowedPaths?: string[];
  model?: string;
  maxTurns?: number;
}

export interface SubagentPoolTask {
  role: string;
  prompt: string;
  systemPrompt?: string;
  readOnly?: boolean;
  allowedPaths?: string[];
}

export interface SubagentResult {
  subId: string;
  role: string;
  result: string | null;
  error: string | null;
  tokenUsage: { input: number; output: number };
  modifiedFiles: string[];
}

export interface SubagentPoolResult {
  poolId: string;
  results: SubagentResult[];
  failures: SubagentResult[];
}

export interface SubagentEvent {
  parentTabId: string;
  subId: string;
  event: {
    type: string;
    [key: string]: unknown;
  };
}

export interface SubagentPoolProgress {
  parentTabId: string;
  poolId: string;
  completed: number;
  total: number;
  failures: number;
}
