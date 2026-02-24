# Data Model

> Last updated: 2026-02-24

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

## Settings Types

### `PilotAppSettings`

- **Location**: `shared/types.ts`
- **Persisted to**: `<PILOT_DIR>/app-settings.json`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `piAgentDir` | `string` | `<PILOT_DIR>` | SDK config directory |
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

## Task Types

### `TaskItem`

- **Location**: `shared/types.ts`
- **Persisted to**: Project `.pi/` task board files (managed by pi task system)

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Task ID |
| `title` | `string` | Task title |
| `description` | `string` | Markdown description |
| `status` | `'backlog' \| 'active' \| 'done'` | Task status |
| `priority` | `'low' \| 'medium' \| 'high'` | Priority level |
| `created` | `number` | Unix timestamp (ms) |
| `updated` | `number` | Unix timestamp (ms) |
| `tags` | `string[]` | Label tags |
| `dependencies` | `string[]` | Blocking task IDs |
| `epic` | `string \| undefined` | Parent epic ID |

## File-Based Persistence Summary

| Path | Format | Managed by |
|------|--------|------------|
| `<PILOT_DIR>/app-settings.json` | JSON | `app-settings.ts` |
| `<PILOT_DIR>/auth.json` | JSON | Pi SDK |
| `<PILOT_DIR>/models.json` | JSON | Pi SDK |
| `<PILOT_DIR>/workspace.json` | JSON | `workspace-state.ts` |
| `<PILOT_DIR>/session-metadata.json` | JSON | `session-metadata.ts` |
| `<PILOT_DIR>/sessions/` | `.jsonl` per session | Pi SDK |
| `<PILOT_DIR>/MEMORY.md` | Markdown | `memory-manager.ts` |
| `<PILOT_DIR>/extensions/` | Directories | `extension-manager.ts` |
| `<PILOT_DIR>/skills/` | Directories | `extension-manager.ts` |
| `<PILOT_DIR>/extension-registry.json` | JSON | `extension-manager.ts` |
| `<PILOT_DIR>/prompts/` | Markdown files | `prompt-library.ts` |
| `<project>/.pilot/settings.json` | JSON | `project-settings.ts` |
| `<project>/.pilot/commands.json` | JSON | `dev-commands.ts` |
| `<project>/.pilot/MEMORY.md` | Markdown (git-trackable) | `memory-manager.ts` |
| `<project>/.pilot/prompts/` | Markdown files | `prompt-library.ts` |

## Changes Log

- 2026-02-24: Initial documentation generated
