# Data Model

> Last updated: 2026-03-06

Pilot has no database. Persistent state is stored in JSON files and Markdown files on disk. The key types are defined in `shared/types.ts` (IPC-crossing types) and within individual service files. All IPC payloads must be Structured Clone serializable.

## Core Session Types

### `SessionMetadata`

- **Location**: `shared/types.ts`
- **Persisted to**: `<PILOT_DIR>/session-metadata.json` (managed by `electron/services/session-metadata.ts`)
- **Purpose**: Pilot's overlay metadata on top of the Pi SDK session files. Survives session deletion.

| Field | Type | Description |
|-------|------|-------------|
| `sessionPath` | `string` | Absolute path to the SDK `.jsonl` session file |
| `projectPath` | `string` | Project root this session belongs to |
| `isPinned` | `boolean` | User has pinned this session in the sidebar |
| `isArchived` | `boolean` | Session is archived (hidden from active list) |
| `customTitle` | `string \| null` | User-set title; null = auto-generated from first message |
| `messageCount` | `number` | Cached message count |
| `created` | `number` | Unix timestamp (ms) |
| `modified` | `number` | Unix timestamp (ms) |

### `SessionStats`

- **Location**: `shared/types.ts` (returned by `SESSION_GET_STATS` IPC)
- **Source**: Live-computed from the active SDK session

| Field | Type | Description |
|-------|------|-------------|
| `messageCount` | `number` | Total turns in conversation |
| `tokenCount` | `number` | Approximate total tokens |
| `created` | `number` | Unix timestamp (ms) |
| `modified` | `number` | Unix timestamp (ms) |

### `ContextUsage`

- **Location**: `shared/types.ts`
- **Purpose**: Shows how full the context window is for the current model

| Field | Type | Description |
|-------|------|-------------|
| `inputTokens` | `number` | Tokens in current context |
| `outputTokens` | `number` | Output tokens generated |
| `contextWindowSize` | `number` | Model's max context window |
| `percentUsed` | `number` | 0–100 |

## Diff / Sandbox Types

### `StagedDiff`

- **Location**: `shared/types.ts`
- **Persisted to**: Memory only (in `StagedDiffManager`); discarded on session dispose or app restart
- **Purpose**: Represents a pending file change awaiting user approval

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | UUID |
| `tabId` | `string` | Which tab/session originated this diff |
| `toolCallId` | `string` | SDK tool call ID that produced this diff |
| `filePath` | `string` | Absolute path to the affected file |
| `operation` | `'edit' \| 'create' \| 'delete' \| 'bash'` | What the agent wants to do |
| `originalContent` | `string \| null` | Current file content (null for new files) |
| `proposedContent` | `string` | What the agent wants to write |
| `unifiedDiff` | `string \| undefined` | `@@ hunk @@` format unified diff |
| `status` | `'pending' \| 'accepted' \| 'rejected'` | User decision |
| `createdAt` | `number` | Unix timestamp (ms) |

### `ProjectSandboxSettings`

- **Location**: `shared/types.ts`
- **Persisted to**: `<project>/.pilot/settings.json`

| Field | Type | Description |
|-------|------|-------------|
| `jail.enabled` | `boolean` | Whether the project jail is active |
| `jail.allowedPaths` | `string[]` | Absolute paths outside the project root that are allowed |
| `yoloMode` | `boolean` | Skip diff review; writes go directly to disk |

## Git Types

### `GitStatus`

| Field | Type | Description |
|-------|------|-------------|
| `branch` | `string` | Current branch name |
| `upstream` | `string \| null` | Remote tracking branch |
| `ahead` | `number` | Commits ahead of upstream |
| `behind` | `number` | Commits behind upstream |
| `staged` | `GitFileChange[]` | Files staged for commit |
| `unstaged` | `GitFileChange[]` | Modified but unstaged files |
| `untracked` | `string[]` | Untracked file paths |
| `isClean` | `boolean` | No staged, unstaged, or untracked files |

### `GitCommit`

| Field | Type | Description |
|-------|------|-------------|
| `hash` | `string` | Full commit SHA |
| `hashShort` | `string` | 7-char short SHA |
| `author` | `string` | Author name |
| `authorEmail` | `string` | Author email |
| `date` | `number` | Unix timestamp (ms) |
| `message` | `string` | Commit message |
| `parents` | `string[]` | Parent commit SHAs |
| `refs` | `string[]` | Branch/tag refs pointing to this commit |

### `ConflictFile`

- **Location**: `shared/types.ts`
- **Purpose**: Represents a file with merge conflicts during rebase or merge

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | Relative file path |
| `status` | `string` | Conflict status indicator |
| `oursContent` | `string \| undefined` | Content from "our" side |
| `theirsContent` | `string \| undefined` | Content from "their" side |
| `baseContent` | `string \| undefined` | Common ancestor content |
| `mergedContent` | `string \| undefined` | Current merged (conflicted) content |

### `RebaseTodoEntry`

- **Location**: `shared/types.ts`
- **Purpose**: Represents a single entry in an interactive rebase todo list

| Field | Type | Description |
|-------|------|-------------|
| `action` | `RebaseAction` | `'pick' \| 'reword' \| 'edit' \| 'squash' \| 'fixup' \| 'drop'` |
| `hash` | `string` | Commit SHA |
| `message` | `string` | Commit message |

### `InteractiveRebaseRequest`

| Field | Type | Description |
|-------|------|-------------|
| `projectPath` | `string` | Project root |
| `entries` | `RebaseTodoEntry[]` | Reordered/modified todo list |

### `GitOperationState`

- **Location**: `shared/types.ts`
- **Purpose**: Tracks in-progress git operations (merge, rebase, cherry-pick)

| Field | Type | Description |
|-------|------|-------------|
| `type` | `'merge' \| 'rebase' \| 'cherry-pick' \| 'revert' \| null` | Current operation type |
| `step` | `number \| undefined` | Current step (rebase) |
| `totalSteps` | `number \| undefined` | Total steps (rebase) |

## Desktop Types

### `DesktopState`

- **Location**: `shared/types.ts`
- **Purpose**: Current state of the Docker virtual display

| Field | Type | Description |
|-------|------|-------------|
| `status` | `'stopped' \| 'starting' \| 'running' \| 'stopping' \| 'error' \| 'building' \| 'rebuilding'` | Container lifecycle state |
| `containerId` | `string \| undefined` | Docker container ID |
| `novncUrl` | `string \| undefined` | URL for the noVNC web viewer |
| `resolution` | `string \| undefined` | Display resolution (e.g., `'1920x1080x24'`) |
| `error` | `string \| undefined` | Error message if status is `'error'` |

### `DesktopCheckResult`

| Field | Type | Description |
|-------|------|-------------|
| `dockerAvailable` | `boolean` | Docker daemon is reachable |
| `imageExists` | `boolean` | Desktop Docker image is built |
| `imageName` | `string` | Expected image name |

### `DesktopConfig`

| Field | Type | Description |
|-------|------|-------------|
| `resolution` | `string \| undefined` | Custom display resolution |
| `timezone` | `string \| undefined` | Container timezone (e.g., `'Europe/Oslo'`) |
| `additionalPackages` | `string[] \| undefined` | Extra apt packages to install |

## MCP Types

### `McpServerConfig`

- **Location**: `shared/types.ts`
- **Persisted to**: `<PILOT_DIR>/mcp-servers.json` (global) or `<project>/.pilot/mcp-servers.json` (project)

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique server ID |
| `name` | `string` | Human-readable name |
| `transport` | `McpTransportType` | `'stdio' \| 'sse' \| 'streamable-http'` |
| `command` | `string \| undefined` | Shell command (stdio transport) |
| `args` | `string[] \| undefined` | Command arguments (stdio transport) |
| `url` | `string \| undefined` | Server URL (SSE/HTTP transport) |
| `env` | `Record<string, string> \| undefined` | Environment variables |
| `enabled` | `boolean` | Whether the server is enabled |
| `autoStart` | `boolean \| undefined` | Start when project opens |
| `scope` | `'global' \| 'project'` | Config scope |

### `McpServerStatus`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Server ID |
| `name` | `string` | Server name |
| `status` | `'connected' \| 'connecting' \| 'disconnected' \| 'error'` | Connection state |
| `error` | `string \| null` | Error message if failed |
| `toolCount` | `number` | Number of tools discovered |

### `McpToolInfo`

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Tool name |
| `description` | `string \| undefined` | Tool description |
| `serverId` | `string` | Which MCP server provides this tool |
| `serverName` | `string` | Human-readable server name |
| `inputSchema` | `object` | JSON Schema for tool parameters |

## Settings Types

### `PilotAppSettings`

- **Location**: `shared/types.ts`
- **Persisted to**: `<PILOT_DIR>/app-settings.json`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `piAgentDir` | `string` | `<PILOT_DIR>` | SDK config directory |
| `theme` | `ThemeMode` | `'dark'` | App colour theme (`'dark' \| 'light' \| 'system'`) |
| `terminalApp` | `string \| null` | `null` | Preferred terminal app |
| `editorCli` | `string \| null` | `null` | Preferred editor CLI command |
| `onboardingComplete` | `boolean` | `false` | Onboarding wizard completed |
| `developerMode` | `boolean` | `false` | Enables terminal and dev commands |
| `keybindOverrides` | `Record<string, string \| null>` | `{}` | User keybind overrides |
| `companionPort` | `number` | `18088` | Companion server port |
| `companionProtocol` | `'http' \| 'https'` | `'https'` | Companion server protocol |
| `companionAutoStart` | `boolean` | `false` | Start companion on launch |
| `autoStartDevServer` | `boolean` | `false` | Auto-start persistent dev commands |
| `hiddenPaths` | `string[]` | standard ignores | Gitignore-syntax patterns for file tree |
| `commitMsgMaxTokens` | `number` | `4096` | Max tokens for AI commit message |
| `commitMsgModel` | `string` | auto | Model for AI commit messages |
| `logging.level` | `LogLevel` | `'warn'` | Minimum log level |
| `logging.file` | object | disabled | File logging config |
| `logging.syslog` | object | disabled | Syslog UDP transport config |

### `ThemeMode`

- **Location**: `shared/types.ts`
- **Values**: `'dark' | 'light' | 'system'`

## Model Types

### `ModelInfo`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Provider-scoped model ID |
| `name` | `string` | Human-readable name |
| `providerId` | `string` | Auth provider (e.g., `'anthropic'`) |
| `contextWindow` | `number` | Max input tokens |
| `maxOutput` | `number` | Max output tokens |
| `costPer1MIn` | `number \| undefined` | Cost per 1M input tokens (USD) |
| `costPer1MOut` | `number \| undefined` | Cost per 1M output tokens (USD) |
| `thinkingLevel` | `'low' \| 'medium' \| 'high' \| undefined` | Current thinking level (if supported) |

## Memory Types

### `MemoryFiles`

| Field | Type | Description |
|-------|------|-------------|
| `global` | `string` | Content of global MEMORY.md |
| `project` | `string \| null` | Content of project MEMORY.md (null if no project) |

### `MemoryCount`

| Field | Type | Description |
|-------|------|-------------|
| `global` | `number` | Number of entries in global memory |
| `project` | `number` | Number of entries in project memory |

### `MemoryCommandResult`

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | Whether the operation succeeded |
| `message` | `string` | Human-readable result message |
| `content` | `string \| undefined` | Retrieved content (for read/search) |

## Task Types

### `TaskItem`

- **Location**: `shared/types.ts`
- **Persisted to**: Project `.pilot/` task board files (managed by pi task system)

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Task ID |
| `title` | `string` | Task title |
| `description` | `string` | Markdown description |
| `status` | `TaskStatus` | `'open' \| 'in_progress' \| 'review' \| 'done'` |
| `priority` | `TaskPriority` | `0 \| 1 \| 2 \| 3 \| 4` |
| `type` | `TaskType` | `'epic' \| 'task' \| 'bug' \| 'feature'` |
| `assignee` | `TaskAssignee` | `'human' \| 'agent' \| null` |
| `created` | `number` | Unix timestamp (ms) |
| `updated` | `number` | Unix timestamp (ms) |
| `tags` | `string[]` | Label tags |
| `dependencies` | `TaskDependency[]` | Blocking task references |
| `epic` | `string \| undefined` | Parent epic ID |

## Editor / Web Types

### `EditorOpenFilePayload`

| Field | Type | Description |
|-------|------|-------------|
| `filePath` | `string` | Absolute file path |
| `projectPath` | `string` | Project root |
| `startLine` | `number \| undefined` | First line to highlight |
| `endLine` | `number \| undefined` | Last line to highlight |

### `EditorOpenUrlPayload`

| Field | Type | Description |
|-------|------|-------------|
| `url` | `string` | URL to open in default browser |

### `WebTabOpenPayload`

| Field | Type | Description |
|-------|------|-------------|
| `url` | `string` | URL to open in a web tab |
| `title` | `string \| undefined` | Tab title |

## Subagent Types

### `SubagentRecord`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Subagent UUID |
| `tabId` | `string` | Parent tab ID |
| `status` | `SubagentStatus` | `'queued' \| 'running' \| 'completed' \| 'failed' \| 'aborted'` |
| `task` | `string` | Task description |
| `model` | `string \| undefined` | Model used |
| `result` | `string \| undefined` | Final output |
| `error` | `string \| undefined` | Error message if failed |
| `startedAt` | `number \| undefined` | Start time |
| `completedAt` | `number \| undefined` | Completion time |

## File-Based Persistence Summary

| Path | Format | Managed by |
|------|--------|------------|
| `<PILOT_DIR>/app-settings.json` | JSON | `app-settings.ts` |
| `<PILOT_DIR>/auth.json` | JSON | Pi SDK |
| `<PILOT_DIR>/models.json` | JSON | Pi SDK |
| `<PILOT_DIR>/workspace.json` | JSON | `workspace-state.ts` |
| `<PILOT_DIR>/session-metadata.json` | JSON | `session-metadata.ts` |
| `<PILOT_DIR>/mcp-servers.json` | JSON | `mcp-config.ts` |
| `<PILOT_DIR>/sessions/` | `.jsonl` per session | Pi SDK |
| `<PILOT_DIR>/MEMORY.md` | Markdown | `memory-manager.ts` |
| `<PILOT_DIR>/extensions/` | Directories | `extension-manager.ts` |
| `<PILOT_DIR>/skills/` | Directories | `extension-manager.ts` |
| `<PILOT_DIR>/extension-registry.json` | JSON | `extension-manager.ts` |
| `<PILOT_DIR>/prompts/` | Markdown files | `prompt-library.ts` |
| `<project>/.pilot/settings.json` | JSON | `project-settings.ts` |
| `<project>/.pilot/commands.json` | JSON | `dev-commands.ts` |
| `<project>/.pilot/mcp-servers.json` | JSON | `mcp-config.ts` |
| `<project>/.pilot/MEMORY.md` | Markdown (git-trackable) | `memory-manager.ts` |
| `<project>/.pilot/prompts/` | Markdown files | `prompt-library.ts` |
| `<project>/.pilot/desktop/Dockerfile` | Dockerfile | `desktop-service.ts` (project-specific image) |

## Changes Log

- 2026-03-06: Added Desktop, MCP, Memory, Editor/Web, Rebase, Conflict types; updated PilotAppSettings with theme; updated persistence summary
- 2026-02-24: Initial documentation generated
