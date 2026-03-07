# Glossary

> Last updated: 2026-03-06

Domain-specific and project-specific terms used throughout the Pilot codebase.

| Term | Definition | Used In |
|------|-----------|----------|
| **Tab** | A persistent UI unit representing one agent session, web view, or desktop display. Multiple tabs can be open simultaneously. Each tab has a unique `tabId` string. | `tab-store.ts`, `shared/types.ts` |
| **Session** | An AI conversation managed by the Pi SDK. Stored as a `.jsonl` file. Can be continued, forked, archived, or pinned. | `pi-session-manager.ts`, `session-store.ts` |
| **Session Path** | The absolute path to a session's `.jsonl` file, typically inside `<PILOT_DIR>/sessions/`. Used as the session's unique identifier at the Pilot layer. | `shared/types.ts`, `session-metadata.ts` |
| **Tab ID** | A UUID string assigned to each tab at creation time. Used to route IPC messages and SDK calls to the correct session. | All IPC channels that accept `tabId` |
| **StagedDiff** | An in-memory pending file change produced when the agent wants to write to disk. Shown to the user for review before anything is written. | `staged-diffs.ts`, `sandbox-store.ts` |
| **Project Jail** | The security constraint that prevents the agent from writing files outside the open project's root directory. Enforced by `SandboxedTools`. | `sandboxed-tools.ts`, `.pilot/settings.json` |
| **Yolo Mode** | A per-project opt-in that bypasses the staged diff review flow. Agent writes go directly to disk without user confirmation. | `sandboxed-tools.ts`, `sandbox-store.ts` |
| **Memory** | Two-tier Markdown context injected into every agent system prompt. Global tier at `<PILOT_DIR>/MEMORY.md`; project tier at `<project>/.pilot/MEMORY.md`. | `memory-manager.ts`, `memory-store.ts` |
| **Memory Extraction** | Background process that analyses conversations and extracts reusable information into the appropriate memory tier. | `memory-manager.ts` |
| **Memory Tools** | Agent-facing tools (`pilot_memory_read`, `pilot_memory_write`, `pilot_memory_search`, `pilot_memory_delete`) for managing the memory tiers. Categories are normalised to prevent fragmentation. | `memory-tools.ts` |
| **Extension** | An SDK-level plugin (ZIP file) that adds custom tools or system-prompt fragments to the agent. Stored in `<PILOT_DIR>/extensions/`. | `extension-manager.ts` |
| **Skill** | An SDK-level plugin that adds specialised system-prompt instructions to the agent for specific tasks. Stored in `<PILOT_DIR>/skills/`. | `extension-manager.ts` |
| **Dev Command** | A project-specific shell command (e.g., `npm run dev`) with a button in the Pilot UI. Configured in `<project>/.pilot/commands.json`. | `dev-commands.ts`, `dev-command-store.ts` |
| **Desktop** | A Docker-based virtual display environment (Xvfb + Fluxbox + x11vnc + noVNC) that the agent can control for GUI automation, browser testing, and screenshots. One container per project. | `desktop-service.ts`, `desktop-tools.ts`, `desktop-store.ts` |
| **Desktop Tools** | Agent tools (`pilot_desktop_screenshot`, `pilot_desktop_click`, `pilot_desktop_type`, `pilot_desktop_scroll`, `pilot_desktop_browser`, etc.) that interact with the virtual display via xdotool and scrot. | `desktop-tools.ts` |
| **MCP** | Model Context Protocol — an open standard for connecting AI models to external tools and data sources. Pilot connects to MCP servers and bridges their tools into agent sessions. | `mcp-manager.ts`, `mcp-store.ts` |
| **MCP Server** | An external process or HTTP endpoint that exposes tools via the MCP protocol. Can use stdio, SSE, or Streamable HTTP transport. | `mcp-manager.ts`, `mcp-config.ts` |
| **MCP Tool Bridge** | The layer that converts MCP tool schemas to Pi SDK `ToolDefinition` format and routes tool calls between the SDK and MCP clients. | `mcp-tool-bridge.ts` |
| **Companion** | A remote browser or mobile client that connects to the desktop app via HTTPS + WebSocket and mirrors the full Pilot UI. | `companion-server.ts`, `companion-ipc-bridge.ts` |
| **Companion Mode** | The state of the IPC client when running in a browser (not Electron). `window.api` is absent; all IPC routes through WebSocket. | `src/lib/ipc-client.ts` |
| **IPC Client** | `src/lib/ipc-client.ts` — the universal wrapper around `window.api` that also works in companion browser mode. | All stores and hooks |
| **IPC** | Inter-Process Communication — the typed message-passing system between the Electron main process and the renderer. | `shared/ipc.ts`, `electron/ipc/*` |
| **Push Event** | A message sent from the main process to the renderer unprompted (e.g., agent token stream, FS change). Uses `win.webContents.send()`. | `electron/services/*`, `src/hooks/*` |
| **Request/Response** | A renderer-initiated IPC call via `window.api.invoke()` that returns a Promise. Uses `ipcMain.handle()`. | All IPC invoke channels |
| **PILOT_DIR** | The platform-specific config directory for all app data. macOS: `~/.config/pilot/`, Windows: `%APPDATA%\pilot\`. | `pilot-paths.ts` |
| **Workspace State** | The persisted tab layout and UI panel visibility, saved to `<PILOT_DIR>/workspace.json` and restored on launch. | `workspace-state.ts` |
| **Session Metadata** | Pilot's overlay data on top of SDK sessions (pinned, archived, custom title). Persisted in `session-metadata.json`. | `session-metadata.ts` |
| **Prompt Template** | A slash-command-triggered reusable message template with optional `{{variable}}` placeholders. Stored as Markdown files. | `prompt-library.ts`, `prompt-store.ts` |
| **Slash Command** | A `/command` typed in the chat input that triggers a prompt template or built-in action. | `command-registry.ts` |
| **Subagent** | A secondary agent session spawned by the orchestrator to run a task in parallel. Results are reported back to the parent session. | `subagent-manager.ts`, `subagent-store.ts` |
| **Orchestrator Mode** | A mode where the main agent acts as a coordinator, spawning subagents for parallel task execution. | `orchestrator-prompt.ts` |
| **Yolo** | See **Yolo Mode**. Colloquial term used consistently in the codebase. | `sandbox-store.ts`, `sandboxed-tools.ts` |
| **Pi SDK** | `@mariozechner/pi-coding-agent` — the AI agent runtime that Pilot wraps. Provides `AgentSession`, tools, streaming, auth, and model management. | `pi-session-manager.ts` |
| **Interactive Rebase** | Git's interactive rebase feature exposed in Pilot's UI. Users can pick, reword, squash, fixup, edit, or drop commits. | `git-service.ts`, `git-store.ts` |
| **Conflict Resolution** | The flow for resolving git merge/rebase conflicts. Supports manual resolution and AI-assisted resolution via the agent. | `git-service.ts`, `git-store.ts` |
| **Theme** | App colour scheme (`dark`, `light`, `system`). Stored in `PilotAppSettings.theme` and applied via `useTheme` hook. | `app-settings-store.ts`, `useTheme.ts` |
| **Editor Tools** | Agent tools (`pilot_show_file`, `pilot_open_url`, `pilot_web`) that control the Pilot GUI — opening files in the editor, URLs in the browser, or web pages in tabs. | `editor-tools.ts` |
| **Web Tab** | A tab that displays a web page in an iframe. Created by the `pilot_web` agent tool or by user action. | `tab-store.ts`, `src/components/web/` |
| **Blame** | Git blame — line-by-line annotation showing which commit last changed each line of a file. | `git-service.ts`, `git-store.ts` |
| **Stash** | A git stash entry. Pilot can list and apply stashes via `GIT_STASH_LIST` / `GIT_STASH_APPLY` IPC. | `git-service.ts` |
| **hiddenPaths** | Gitignore-syntax glob patterns stored in `app-settings.json` that control which files are hidden from the Pilot file tree. | `app-settings.ts`, `electron/ipc/project.ts` |
| **Auto-accept** | A per-tool setting in the sandbox store that automatically accepts diffs from specific tools without user review. | `sandbox-store.ts` |
| **Context Window** | The maximum number of tokens a model can process in one call. Tracked via `ContextUsage` and shown in the UI. | `shared/types.ts`, `chat-store.ts` |
| **broadcastToRenderer** | Helper function in `electron/utils/broadcast.ts` that sends a push event to all BrowserWindows. Used by all services that emit events. | `electron/utils/broadcast.ts`, all services |

## Changes Log

- 2026-03-06: Added Desktop, MCP, Memory Tools, Editor Tools, Web Tab, Interactive Rebase, Conflict Resolution, Theme, broadcastToRenderer terms
- 2026-02-24: Initial documentation generated
