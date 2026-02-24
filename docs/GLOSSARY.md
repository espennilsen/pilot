# Glossary

> Last updated: 2026-02-24

Domain-specific and project-specific terms used throughout the Pilot codebase.

| Term | Definition | Used In |
|------|-----------|----------|
| **Tab** | A persistent UI unit representing one agent session. Multiple tabs can be open simultaneously. Each tab has a unique `tabId` string. | `tab-store.ts`, `shared/types.ts` |
| **Session** | An AI conversation managed by the Pi SDK. Stored as a `.jsonl` file. Can be continued, forked, archived, or pinned. | `pi-session-manager.ts`, `session-store.ts` |
| **Session Path** | The absolute path to a session's `.jsonl` file, typically inside `<PILOT_DIR>/sessions/`. Used as the session's unique identifier at the Pilot layer. | `shared/types.ts`, `session-metadata.ts` |
| **Tab ID** | A UUID string assigned to each tab at creation time. Used to route IPC messages and SDK calls to the correct session. | All IPC channels that accept `tabId` |
| **StagedDiff** | An in-memory pending file change produced when the agent wants to write to disk. Shown to the user for review before anything is written. | `staged-diffs.ts`, `sandbox-store.ts` |
| **Project Jail** | The security constraint that prevents the agent from writing files outside the open project's root directory. Enforced by `SandboxedTools`. | `sandboxed-tools.ts`, `.pilot/settings.json` |
| **Yolo Mode** | A per-project opt-in that bypasses the staged diff review flow. Agent writes go directly to disk without user confirmation. | `sandboxed-tools.ts`, `sandbox-store.ts` |
| **Memory** | Two-tier Markdown context injected into every agent system prompt. Global tier at `<PILOT_DIR>/MEMORY.md`; project tier at `<project>/.pilot/MEMORY.md`. | `memory-manager.ts`, `memory-store.ts` |
| **Memory Extraction** | Background process that analyses conversations and extracts reusable information into the appropriate memory tier. | `memory-manager.ts` |
| **Extension** | An SDK-level plugin (ZIP file) that adds custom tools or system-prompt fragments to the agent. Stored in `<PILOT_DIR>/extensions/`. | `extension-manager.ts` |
| **Skill** | An SDK-level plugin that adds specialised system-prompt instructions to the agent for specific tasks. Stored in `<PILOT_DIR>/skills/`. | `extension-manager.ts` |
| **Dev Command** | A project-specific shell command (e.g., `npm run dev`) with a button in the Pilot UI. Configured in `<project>/.pilot/commands.json`. | `dev-commands.ts`, `dev-command-store.ts` |
| **Companion** | A remote browser or mobile client that connects to the desktop app via HTTPS + WebSocket and mirrors the full Pilot UI. | `companion-server.ts`, `companion-ipc-bridge.ts` |
| **Companion Mode** | The state of the IPC client when running in a browser (not Electron). `window.api` is absent; all IPC routes through WebSocket. | `src/lib/ipc-client.ts` |
| **IPC Client** | `src/lib/ipc-client.ts` — the universal wrapper around `window.api` that also works in companion browser mode. | All stores and hooks |
| **IPC** | Inter-Process Communication — the typed message-passing system between the Electron main process and the renderer. | `shared/ipc.ts`, `electron/ipc/*` |
| **Push Event** | A message sent from the main process to the renderer unprompted (e.g., agent token stream, FS change). Uses `win.webContents.send()`. | `electron/services/*`, `src/hooks/*` |
| **Request/Response** | A renderer-initiated IPC call via `window.api.invoke()` that returns a Promise. Uses `ipcMain.handle()`. | All IPC invoke channels |
| **PILOT_DIR** | The platform-specific config directory for all app data. macOS: `~/.config/.pilot/`, Windows: `%APPDATA%\.pilot\`. | `pilot-paths.ts` |
| **Workspace State** | The persisted tab layout and UI panel visibility, saved to `<PILOT_DIR>/workspace.json` and restored on launch. | `workspace-state.ts` |
| **Session Metadata** | Pilot's overlay data on top of SDK sessions (pinned, archived, custom title). Persisted in `session-metadata.json`. | `session-metadata.ts` |
| **Prompt Template** | A slash-command-triggered reusable message template with optional `{{variable}}` placeholders. Stored as Markdown files. | `prompt-library.ts`, `prompt-store.ts` |
| **Slash Command** | A `/command` typed in the chat input that triggers a prompt template or built-in action. | `command-registry.ts` |
| **Subagent** | A secondary agent session spawned by the orchestrator to run a task in parallel. Results are reported back to the parent session. | `subagent-manager.ts`, `subagent-store.ts` |
| **Orchestrator Mode** | A mode where the main agent acts as a coordinator, spawning subagents for parallel task execution. | `orchestrator-prompt.ts` |
| **Yolo** | See **Yolo Mode**. Colloquial term used consistently in the codebase. | `sandbox-store.ts`, `sandboxed-tools.ts` |
| **Pi SDK** | `@mariozechner/pi-coding-agent` — the AI agent runtime that Pilot wraps. Provides `AgentSession`, tools, streaming, auth, and model management. | `pi-session-manager.ts` |
| **Blame** | Git blame — line-by-line annotation showing which commit last changed each line of a file. | `git-service.ts`, `git-store.ts` |
| **Stash** | A git stash entry. Pilot can list and apply stashes via `GIT_STASH_LIST` / `GIT_STASH_APPLY` IPC. | `git-service.ts` |
| **hiddenPaths** | Gitignore-syntax glob patterns stored in `app-settings.json` that control which files are hidden from the Pilot file tree. | `app-settings.ts`, `electron/ipc/project.ts` |
| **Auto-accept** | A per-tool setting in the sandbox store that automatically accepts diffs from specific tools without user review. | `sandbox-store.ts` |
| **Context Window** | The maximum number of tokens a model can process in one call. Tracked via `ContextUsage` and shown in the UI. | `shared/types.ts`, `chat-store.ts` |

## Changes Log

- 2026-02-24: Initial documentation generated
