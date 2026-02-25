# Configuration

> Last updated: 2026-02-24

Pilot has no `.env` files. All configuration is stored in JSON files on disk. There are three layers: **app-level** (user preferences, `<PILOT_DIR>/app-settings.json`), **SDK-level** (Pi agent config, `<PILOT_DIR>/config.json`), and **project-level** (per-project settings, `<project>/.pilot/settings.json`).

## Config Directory

| Platform | Path |
|----------|------|
| macOS | `~/.config/pilot/` |
| Windows | `%APPDATA%\pilot\` |
| Linux | `$XDG_CONFIG_HOME/pilot/` (default: `~/.config/pilot/`) |

Resolved at runtime by `electron/services/pilot-paths.ts`.

## App Settings (`app-settings.json`)

Managed by `electron/services/app-settings.ts`. Read/written via `APP_SETTINGS_GET` / `APP_SETTINGS_UPDATE` IPC channels.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `piAgentDir` | `string` | `<PILOT_DIR>` | Base directory for SDK data (sessions, models, auth) |
| `terminalApp` | `string \| null` | `null` | External terminal app CLI. `null` = system default |
| `editorCli` | `string \| null` | `null` | External editor CLI (`code`, `cursor`, `vim`, etc.). `null` = auto-detect |
| `onboardingComplete` | `boolean` | `false` | Set to `true` after first-launch wizard |
| `developerMode` | `boolean` | `false` | Unlocks terminal panel and dev command buttons |
| `keybindOverrides` | `Record<string, string \| null>` | `{}` | Overrides default keybindings. Map shortcut ID → combo string (e.g. `"meta+shift+t"`) or `null` to disable |
| `companionPort` | `number` | `18088` | TCP port for the companion HTTPS server |
| `companionProtocol` | `'http' \| 'https'` | `'https'` | Companion server protocol (`https` strongly recommended) |
| `companionAutoStart` | `boolean` | `false` | Automatically start companion server on app launch |
| `autoStartDevServer` | `boolean` | `false` | Automatically start dev commands marked as `autoStart: true` when opening a project |
| `hiddenPaths` | `string[]` | Standard ignores | Gitignore-syntax glob patterns to hide from the file tree |
| `commitMsgMaxTokens` | `number` | `4096` | Max tokens for AI-generated commit message summaries |
| `commitMsgModel` | `string` | auto-select cheapest | Model ID for AI commit messages. Format: `"provider/model-id"` |
| `logging.level` | `'debug' \| 'info' \| 'warn' \| 'error'` | `'warn'` | Minimum log level |
| `logging.file.enabled` | `boolean` | `false` | Write rotating log files to `<PILOT_DIR>/logs/` |
| `logging.file.maxSizeMB` | `number` | `10` | Max log file size before rotation |
| `logging.file.retainDays` | `number` | `14` | Days to keep log files |
| `logging.syslog.enabled` | `boolean` | `false` | Forward logs via UDP syslog (RFC 5424) |
| `logging.syslog.host` | `string` | `'localhost'` | Syslog server hostname |
| `logging.syslog.port` | `number` | `514` | Syslog UDP port |
| `logging.syslog.facility` | `number` | `16` | Syslog facility code (16 = local0) |
| `logging.syslog.appName` | `string` | `'pilot'` | App name in syslog messages |

## Pi Agent Settings (`config.json`)

Managed by the Pi SDK. Read/written via `PI_SETTINGS_GET` / `PI_SETTINGS_UPDATE` IPC channels. Schema is defined by `@mariozechner/pi-coding-agent`.

## Project Settings (`<project>/.pilot/settings.json`)

Managed by `electron/services/project-settings.ts`. Read/written via `SETTINGS_GET` / `SETTINGS_UPDATE` IPC channels.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `jail.enabled` | `boolean` | `true` | Enforce project file jail (block writes outside project root) |
| `jail.allowedPaths` | `string[]` | `[]` | Absolute paths outside project root the agent is allowed to write |
| `yoloMode` | `boolean` | `false` | Skip diff review; agent writes go directly to disk |

## Dev Commands (`<project>/.pilot/commands.json`)

Array of `DevCommand` objects. Managed via the dev commands settings UI and `DEV_LOAD_CONFIG` / `DEV_SAVE_CONFIG` IPC channels.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique ID |
| `label` | `string` | Button label in Pilot UI |
| `command` | `string` | Shell command to run |
| `cwd` | `string \| undefined` | Working directory (default: project root) |
| `env` | `Record<string, string> \| undefined` | Additional environment variables |
| `autoStart` | `boolean \| undefined` | Auto-start when project opens (requires `developerMode` + `autoStartDevServer`) |
| `detectUrl` | `boolean \| undefined` | Watch stdout for a URL and display it |

## Keybinding System

Default keybindings are defined in `src/lib/keybindings.ts`. Each shortcut has an ID, default combo, and optional platform-specific variant.

- On **macOS**, `Meta` = `⌘ Command`
- On **Windows/Linux**, `Ctrl` is used in place of `Meta`

Overrides are stored in `app-settings.json` under `keybindOverrides`. A `null` value disables the shortcut entirely.

## File Tree Filtering

Controlled by `hiddenPaths` in `app-settings.json`. Uses gitignore syntax via the `ignore` npm package:

- `node_modules/` — ignore a directory
- `*.log` — ignore by extension
- `dist/` — ignore a build output directory
- `!important.log` — negation: un-hide a specific file

Default hidden patterns include `node_modules/`, `.git/`, `dist/`, `build/`, `out/`, `*.log`, `.DS_Store`, and similar common noise.

## Auth / API Keys (`auth.json`)

Stored in `<PILOT_DIR>/auth.json` with file permissions `0600`. Managed entirely by the Pi SDK. API keys can be set via the Settings → Auth UI (`AUTH_SET_API_KEY` IPC) or via OAuth (`AUTH_LOGIN_OAUTH` IPC).

## Workspace State (`workspace.json`)

Auto-saved (debounced 500ms) by `useWorkspacePersistence` hook. Contains the full tab layout and UI panel visibility state. Restored automatically on app launch.

## Changes Log

- 2026-02-24: Initial documentation generated
