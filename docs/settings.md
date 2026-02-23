# Settings

Pilot has three layers of settings, each stored in a different location.

## Storage Locations

```
~/.config/.pilot/
├── app-settings.json          # Global app settings
├── workspace.json             # UI layout, tabs, window state
├── auth.json                  # Auth credentials
├── models.json                # Model registry
├── extension-registry.json    # Extension enabled/disabled state
├── extensions/                # Installed extensions
└── skills/                    # Installed skills

<project>/.pilot/
├── settings.json              # Per-project sandbox settings
├── commands.json              # Dev commands config
├── extensions/                # Project-scoped extensions
└── skills/                    # Project-scoped skills
```

---

## App Settings

**File:** `~/.config/.pilot/app-settings.json`
**Interface:** `PilotAppSettings` (`shared/types.ts`)

These are global, user-level preferences that persist across restarts.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `piAgentDir` | `string` | `~/.config/.pilot` | Pi agent config directory |
| `terminalApp` | `string \| null` | `null` | Preferred terminal app (null = system default) |
| `editorCli` | `string \| null` | `null` | Preferred code editor CLI (null = auto-detect) |
| `onboardingComplete` | `boolean` | `false` | Whether the onboarding wizard has been completed |
| `developerMode` | `boolean` | `false` | Show developer tools (terminal menu, command center) |
| `keybindOverrides` | `Record<string, string \| null>` | `{}` | Custom keybindings. Maps shortcut ID → combo string, or `null` to disable |

### Data Flow

```
Renderer Store (useAppSettingsStore)
    ↕ IPC: APP_SETTINGS_GET / APP_SETTINGS_UPDATE
Main Process (loadAppSettings / saveAppSettings)
    ↕ fs read/write
~/.config/.pilot/app-settings.json
```

**Main process** (`electron/services/app-settings.ts`):
- `loadAppSettings()` — reads from disk, caches in memory (singleton)
- `saveAppSettings(updates)` — merges with current, writes to disk, updates cache
- `getPiAgentDir()` — resolves the effective pi agent dir with `~` expansion

**Renderer store** (`src/stores/app-settings-store.ts`):
- `load()` — fetches from main via IPC, populates store
- `update(partial)` — sends partial update to main via IPC, merges response
- Convenience setters: `setPiAgentDir()`, `setDeveloperMode()`, `setKeybindOverride()`, etc.

Settings are loaded on app startup in `App.tsx`:
```ts
useEffect(() => {
  useAppSettingsStore.getState().load();
}, []);
```

---

## Project Settings

**File:** `<project>/.pilot/settings.json`
**Interface:** `ProjectSandboxSettings` (`shared/types.ts`)

Per-project settings for sandbox behavior. Created when a project is opened.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `jail.enabled` | `boolean` | `true` | Restrict agent file access to project root |
| `jail.allowedPaths` | `string[]` | `[]` | Extra paths allowed outside jail |
| `yoloMode` | `boolean` | `false` | Auto-accept file changes without review |

### Data Flow

```
Renderer Store (useSandboxStore)
    ↕ IPC: SETTINGS_GET / SETTINGS_UPDATE
Main Process (loadProjectSettings)
    ↕ fs read/write
<project>/.pilot/settings.json
```

> **Note:** `yoloMode` and `jailEnabled` are currently managed in-memory by `useSandboxStore`. The project settings file defines defaults, but the UI doesn't fully round-trip through the file yet.

---

## Workspace State

**File:** `~/.config/.pilot/workspace.json`

Not a user-facing setting, but persisted automatically. Captures the full UI layout so Pilot restores exactly where you left off.

### What's Saved

| Category | Fields |
|----------|--------|
| **Tabs** | `id`, `title`, `projectPath`, `isPinned`, `order`, `inputDraft`, `panelConfig` |
| **Active tab** | `activeTabId` |
| **UI layout** | `sidebarVisible`, `sidebarWidth`, `contextPanelVisible`, `contextPanelWidth`, `contextPanelTab`, `focusMode`, `terminalVisible`, `terminalHeight` |
| **Window** | `windowBounds?` (`{ x, y, width, height }`), `windowMaximized?` — defined in `WorkspaceState` type, reserved for future use |

### Persistence Hook

`useWorkspacePersistence()` in `src/hooks/useWorkspacePersistence.ts`:

1. **On startup** — restores tabs and UI layout from `workspace.json`. Falls back to a single empty tab if no saved state.
2. **On change** — auto-saves whenever `useTabStore` or `useUIStore` change (debounced 500ms).
3. **On quit** — saves on `beforeunload` event.

A `restoredRef` guard prevents writing empty/default state to disk before restoration completes (crash safety).

---

## Dev Commands

**File:** `<project>/.pilot/commands.json`
**Store:** `useDevCommandStore` (`src/stores/dev-command-store.ts`)

Per-project command shortcuts (dev server, build, lint, test). Only visible when `developerMode` is enabled.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique command ID |
| `label` | `string` | Display name |
| `command` | `string` | Shell command to run |
| `icon` | `string` | Lucide icon name |
| `cwd` | `string` | Working directory |
| `env` | `Record<string, string>` | Environment variables |
| `persistent` | `boolean` | Keep running (e.g. dev server) vs one-shot |

Loaded via `IPC.DEV_LOAD_CONFIG` when developer mode is enabled and a project is open. Saved via `IPC.DEV_SAVE_CONFIG`. The file is also watched for external changes.

---

## Auth Credentials

**File:** `~/.config/.pilot/auth.json`
**Managed by:** pi SDK `AuthStorage` class
**Permissions:** `0o600` (read/write owner only), file-locked for concurrent access

Stores API keys and OAuth tokens per provider. The file is a flat JSON object keyed by provider name.

### Schema

```json
{
  "anthropic": {
    "type": "api_key",
    "key": "sk-ant-..."
  },
  "openai": {
    "type": "oauth",
    "accessToken": "...",
    "refreshToken": "...",
    "expires": 1700000000000
  }
}
```

Each entry is one of:

| Credential Type | Fields | Description |
|-----------------|--------|-------------|
| `api_key` | `type`, `key` | Static API key. `key` can be a literal value, `$ENV_VAR` reference, or `$(command)` shell expansion |
| `oauth` | `type`, `accessToken`, `refreshToken`, `expires` | OAuth token, auto-refreshed with file locking when expired |

### API Key Resolution Priority

When resolving credentials for a provider, Pilot checks (in order):

1. **Runtime override** — set via CLI `--api-key` flag (not persisted)
2. **API key from `auth.json`** — `{ type: "api_key", key: "..." }`
3. **OAuth token from `auth.json`** — auto-refreshed if expired (with file locking across instances)
4. **Environment variable** — e.g. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`
5. **Fallback resolver** — custom provider keys defined in `models.json`

---

## Model Registry

**File:** `~/.config/.pilot/models.json`
**Managed by:** pi SDK `ModelRegistry` class

Defines custom model providers, custom models, and per-model overrides for built-in models. This file is optional — if absent, only built-in models are available.

### Schema

```json
{
  "providers": {
    "<provider-name>": {
      "baseUrl": "https://api.example.com/v1",
      "apiKey": "$MY_API_KEY",
      "api": "openai-completions",
      "headers": { "X-Custom": "value" },
      "authHeader": false,
      "models": [ ... ],
      "modelOverrides": { ... }
    }
  }
}
```

### Provider Config

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `baseUrl` | `string` | For custom models | API endpoint base URL |
| `apiKey` | `string` | For custom models | API key (literal, `$ENV_VAR`, or `$(command)`) |
| `api` | `string` | If models lack it | API type: `"openai-completions"`, `"openai-responses"`, `"anthropic"`, `"google"` |
| `headers` | `Record<string, string>` | No | Custom HTTP headers (supports `$ENV_VAR` and `$(command)` in values) |
| `authHeader` | `boolean` | No | If `true`, adds `Authorization: Bearer <apiKey>` header |
| `models` | `ModelDefinition[]` | No | Custom model definitions |
| `modelOverrides` | `Record<string, ModelOverride>` | No | Per-model overrides for built-in models (keyed by model ID) |

### Model Definition

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | `string` | *required* | Model identifier |
| `name` | `string` | `id` | Display name |
| `api` | `string` | Provider's `api` | API type override |
| `reasoning` | `boolean` | `false` | Whether model supports reasoning/thinking |
| `input` | `string[]` | `["text"]` | Supported input types: `"text"`, `"image"` |
| `cost` | `object` | All zeros | `{ input, output, cacheRead, cacheWrite }` (per-token costs) |
| `contextWindow` | `number` | `128000` | Max context window in tokens |
| `maxTokens` | `number` | `16384` | Max output tokens |
| `headers` | `Record<string, string>` | — | Per-model headers (merged with provider headers) |
| `compat` | `object` | — | OpenAI compatibility settings |

### Model Override

Overrides are the same as model definitions but all fields are optional. Applied on top of built-in models by matching provider name + model ID.

### Example

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "apiKey": "ollama",
      "api": "openai-completions",
      "models": [
        { "id": "llama3", "name": "Llama 3", "contextWindow": 8192 }
      ]
    },
    "anthropic": {
      "modelOverrides": {
        "claude-sonnet-4-5-20250514": {
          "maxTokens": 64000
        }
      }
    }
  }
}
```

---

## Extension Registry

**File:** `~/.config/.pilot/extension-registry.json`
**Managed by:** `ExtensionManager` (`electron/services/extension-manager.ts`)

Tracks enabled/disabled state for installed extensions. Extensions not in the registry default to enabled.

### Schema

```json
{
  "extensions": [
    {
      "id": "my-extension",
      "name": "My Extension",
      "version": "1.0.0",
      "path": "/Users/you/.config/.pilot/extensions/my-extension",
      "enabled": true,
      "installedAt": 1700000000000
    }
  ],
  "lastUpdated": 1700000000000
}
```

| Field | Type | Description |
|-------|------|-------------|
| `extensions[].id` | `string` | Extension directory name |
| `extensions[].name` | `string` | From `package.json` name |
| `extensions[].version` | `string` | From `package.json` version |
| `extensions[].path` | `string` | Absolute path to extension directory |
| `extensions[].enabled` | `boolean` | Whether the extension is active |
| `extensions[].installedAt` | `number` | Unix timestamp of installation |
| `lastUpdated` | `number` | Unix timestamp of last registry change |

### Extension Discovery

Extensions are scanned from two locations:

| Scope | Directory |
|-------|-----------|
| **Global** | `~/.config/.pilot/extensions/` |
| **Project** | `<project>/.pilot/extensions/` |

Each extension directory must contain a `package.json`. The registry only stores enabled/disabled state — the extension list is rebuilt by scanning directories on each load.

---

## Skill Discovery

Skills are scanned from two locations (no registry file — all discovered skills are active):

| Scope | Directory |
|-------|-----------|
| **Global** | `~/.config/.pilot/skills/` |
| **Project** | `<project>/.pilot/skills/` |

Each skill directory must contain a `SKILL.md` file.

---

## Other Persisted State

| What | Where | How |
|------|-------|-----|
| **Scratch Pad content** | Browser `localStorage` (`scratchPadContent` key) | Read/written by `useUIStore` |

---

## Settings Panel

Opened via ⌘, (or the gear icon). Has six tabs:

### General
- **Pi Config Directory** — path to pi agent config (default `~/.config/.pilot`)

### Project
- **Project Jail** — toggle to restrict agent to project directory
- **Yolo Mode** — toggle to auto-accept all changes (⚠️ warning shown)

### Keybindings
- Lists all keyboard shortcuts grouped by category
- Click a combo to re-record it
- Reset/Disable individual bindings
- "Reset All" button

### Extensions
- Install, enable/disable, import extensions (`.zip`)

### Skills
- Install, enable/disable, import skills (`.zip`)

### Developer
- **Developer Mode** toggle — enables terminal menu, command center, terminal shortcuts
- **Commands list** — add/edit/delete project commands (when developer mode is on and a project is open)

---

## IPC Reference

### App Settings
| Channel | Direction | Args | Returns |
|---------|-----------|------|---------|
| `APP_SETTINGS_GET` | renderer → main | — | `PilotAppSettings` |
| `APP_SETTINGS_UPDATE` | renderer → main | `Partial<PilotAppSettings>` | `PilotAppSettings` (merged) |

### Project Settings
| Channel | Direction | Args | Returns |
|---------|-----------|------|---------|
| `SETTINGS_GET` | renderer → main | `projectPath?` | `ProjectSandboxSettings` |
| `SETTINGS_UPDATE` | renderer → main | `Partial<ProjectSandboxSettings>` | — |

### Workspace
| Channel | Direction | Args | Returns |
|---------|-----------|------|---------|
| `TABS_SAVE_STATE` | renderer → main | `WorkspaceState` | — |
| `TABS_RESTORE_STATE` | renderer → main | — | `WorkspaceState \| null` |

### Dev Commands
| Channel | Direction | Args | Returns |
|---------|-----------|------|---------|
| `DEV_LOAD_CONFIG` | renderer → main | `projectPath` | `DevCommand[]` |
| `DEV_SAVE_CONFIG` | renderer → main | `projectPath, DevCommand[]` | — |
