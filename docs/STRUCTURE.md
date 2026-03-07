# Project Structure

> Last updated: 2026-03-06

Pilot is split into three top-level source areas: `electron/` (main process, Node.js), `src/` (renderer, React), and `shared/` (types + IPC constants used by both). Configuration and documentation live in root-level directories.

## Directory Tree

```
pilot/
├── electron/                          # Main process (full Node.js access)
│   ├── main/
│   │   └── index.ts                   # App entry: BrowserWindow, service init, IPC registration
│   ├── preload/
│   │   └── index.ts                   # contextBridge: exposes window.api to renderer
│   ├── ipc/                           # IPC handlers — one file per domain
│   │   ├── agent.ts                   # Agent session lifecycle and messaging
│   │   ├── attachment.ts              # File attachment handling
│   │   ├── auth.ts                    # API keys and OAuth flows
│   │   ├── companion.ts               # Companion server control (enable, pair, tunnel)
│   │   ├── desktop.ts                 # Desktop virtual display control
│   │   ├── dev-commands.ts            # Dev command spawn/stop/stream
│   │   ├── extensions.ts              # Extension and skill management
│   │   ├── git.ts                     # Git operations (status, commit, branch, rebase, conflicts)
│   │   ├── mcp.ts                     # MCP server management
│   │   ├── memory.ts                  # Two-tier memory read/write
│   │   ├── model.ts                   # Model selection and cycling
│   │   ├── project.ts                 # File tree, file CRUD, FS watching
│   │   ├── prompts.ts                 # Slash-command prompt templates
│   │   ├── sandbox.ts                 # Diff review: accept/reject/yolo
│   │   ├── session.ts                 # Session list, fork, metadata, delete
│   │   ├── settings.ts                # App and project settings persistence
│   │   ├── shell.ts                   # OS integration (open in Finder/terminal/editor)
│   │   ├── subagent.ts                # Parallel subagent spawning and status
│   │   ├── tasks.ts                   # Task board (pi task system)
│   │   ├── terminal.ts               # PTY terminal create/resize/dispose
│   │   └── workspace.ts               # Tab layout save/restore
│   ├── services/                      # Business logic — one class per domain
│   │   ├── pi-session-manager.ts      # SDK AgentSession lifecycle per tab (central orchestrator)
│   │   ├── pi-session-config.ts       # Session configuration and system prompt assembly
│   │   ├── pi-session-memory.ts       # Session memory injection helpers
│   │   ├── pi-session-commit.ts       # AI-powered commit message generation
│   │   ├── pi-session-commands.ts     # Agent slash-command handling
│   │   ├── pi-session-listing.ts      # Session listing and search
│   │   ├── pi-session-helpers.ts      # Shared session utility functions
│   │   ├── sandboxed-tools.ts         # File tool interception + diff staging
│   │   ├── sandbox-path-helpers.ts    # Path validation helpers for sandbox
│   │   ├── staged-diffs.ts            # In-memory StagedDiff store per tab
│   │   ├── git-service.ts             # simple-git wrapper (status, commit, rebase, conflicts)
│   │   ├── memory-manager.ts          # Two-tier MEMORY.md read/write + extraction
│   │   ├── memory-tools.ts            # Agent memory tools (read/write/search/delete)
│   │   ├── desktop-service.ts         # Docker container lifecycle for virtual display
│   │   ├── desktop-tools.ts           # Agent tools for desktop control (screenshot, click, type)
│   │   ├── editor-tools.ts            # Agent tools: pilot_show_file, pilot_open_url, pilot_web
│   │   ├── mcp-manager.ts             # MCP server connection lifecycle and tool discovery
│   │   ├── mcp-config.ts              # MCP server config persistence (global + per-project)
│   │   ├── mcp-tool-bridge.ts         # Bridges MCP tools → Pi SDK ToolDefinition format
│   │   ├── dev-commands.ts            # Child process spawning for dev commands
│   │   ├── terminal-service.ts        # node-pty PTY management
│   │   ├── extension-manager.ts       # Extension/skill discovery and toggle
│   │   ├── workspace-state.ts         # Tab layout persistence to workspace.json
│   │   ├── app-settings.ts            # PilotAppSettings read/write
│   │   ├── project-settings.ts        # Per-project settings (.pilot/settings.json)
│   │   ├── pilot-paths.ts             # Cross-platform path utilities
│   │   ├── logger.ts                  # Structured logger (file + syslog transport)
│   │   ├── session-metadata.ts        # Session pin/archive metadata persistence
│   │   ├── task-manager.ts            # Task board CRUD backed by pi task system
│   │   ├── task-tools.ts              # Agent task tools
│   │   ├── task-helpers.ts            # Task utility functions
│   │   ├── task-types.ts              # Task type definitions
│   │   ├── subagent-manager.ts        # Parallel subagent pool management
│   │   ├── subagent-session.ts        # Individual subagent session handling
│   │   ├── subagent-helpers.ts        # Subagent utility functions
│   │   ├── subagent-tools.ts          # Subagent tool definitions
│   │   ├── prompt-library.ts          # Slash-command prompt template CRUD
│   │   ├── prompt-helpers.ts          # Prompt utility functions
│   │   ├── prompt-parser.ts           # Prompt template variable parsing
│   │   ├── prompt-seeder.ts           # Built-in prompt template seeding
│   │   ├── command-registry.ts        # Agent slash-command registry
│   │   ├── orchestrator-prompt.ts     # System prompt assembly for orchestrator mode
│   │   ├── web-fetch-tool.ts          # HTTP fetch tool for agent
│   │   ├── companion-server.ts        # HTTPS + WebSocket server
│   │   ├── companion-routes.ts        # Companion HTTP route definitions
│   │   ├── companion-server-types.ts  # Companion server type definitions
│   │   ├── companion-auth.ts          # PIN/QR pairing, session token management
│   │   ├── companion-discovery.ts     # mDNS/Bonjour advertisement
│   │   ├── companion-ipc-bridge.ts    # Forwards IPC push events to companion clients
│   │   ├── companion-remote.ts        # Remote tunnel management
│   │   ├── companion-cloudflare.ts    # Cloudflare tunnel integration
│   │   ├── companion-tailscale.ts     # Tailscale tunnel integration
│   │   └── companion-tls.ts           # Self-signed certificate generation
│   └── utils/                         # Shared utilities for main process
│       ├── broadcast.ts               # broadcastToRenderer() helper
│       ├── ipc-validation.ts          # Path and argument validation for IPC handlers
│       └── paths.ts                   # expandHome, normalizePath, isWithinDir
├── shared/                            # Shared between main and renderer (no Node.js-only imports)
│   ├── ipc.ts                         # All IPC channel name constants (single source of truth)
│   └── types.ts                       # All serializable types crossing the IPC boundary
├── src/                               # Renderer process (React, no Node.js)
│   ├── app.tsx                        # React root — keyboard shortcuts, lifecycle
│   ├── main.tsx                       # Vite entry point — mounts React app
│   ├── components/                    # UI — one folder per domain
│   │   ├── chat/                      # Chat messages, input, streaming
│   │   ├── sidebar/                   # Left sidebar (sessions, memory, tasks panes)
│   │   ├── context/                   # Right panel (files, git, changes tabs)
│   │   ├── sandbox/                   # Diff review UI (Monaco side-by-side)
│   │   ├── terminal/                  # Terminal UI (xterm.js)
│   │   ├── settings/                  # Settings modal (all tabs)
│   │   ├── git/                       # Git status, commit, branch, log, rebase, conflicts
│   │   ├── tab-bar/                   # Tab bar at top of window
│   │   ├── status-bar/                # Bottom status bar
│   │   ├── editor/                    # File editor (Monaco)
│   │   ├── desktop/                   # Desktop virtual display viewer and controls
│   │   ├── web/                       # Web view tabs (iframe-based)
│   │   ├── memory/                    # Memory panel UI
│   │   ├── tasks/                     # Task board UI
│   │   ├── extensions/                # Extension and skill management UI
│   │   ├── prompts/                   # Prompt template editor
│   │   ├── companion/                 # Companion pairing and status UI
│   │   ├── subagents/                 # Subagent progress UI
│   │   ├── command-palette/           # Command palette overlay
│   │   ├── command-center/            # Command center panel
│   │   ├── scratch-pad/               # Scratch pad panel
│   │   ├── dialogs/                   # Shared dialog components
│   │   ├── onboarding/                # First-launch onboarding wizard
│   │   ├── about/                     # About dialog
│   │   ├── docs/                      # In-app docs viewer
│   │   ├── layout/                    # Layout primitives (panels, resizable)
│   │   └── shared/                    # Shared UI primitives (buttons, icons, etc.)
│   ├── stores/                        # Zustand stores — one per domain
│   │   ├── tab-store.ts               # Tabs, active tab, closed-tab stack, web/desktop tabs
│   │   ├── chat-store.ts              # Messages per tab, streaming state, token counts
│   │   ├── sandbox-store.ts           # Staged diffs per tab, yolo mode
│   │   ├── git-store.ts               # Git status, branches, log, blame, stashes, conflicts, rebase
│   │   ├── project-store.ts           # Project path, file tree, file preview
│   │   ├── ui-store.ts                # Panel/sidebar visibility, settings modal, theme
│   │   ├── session-store.ts           # Historical session list for sidebar
│   │   ├── app-settings-store.ts      # Developer mode, keybinds, terminal prefs, theme
│   │   ├── memory-store.ts            # Memory count badge, last-update pulse
│   │   ├── desktop-store.ts           # Desktop container state, VNC connection, screenshots
│   │   ├── mcp-store.ts               # MCP server status, tools, config
│   │   ├── task-store.ts              # Task board state
│   │   ├── subagent-store.ts          # Active subagent status
│   │   ├── auth-store.ts              # Auth provider status
│   │   ├── extension-store.ts         # Installed extensions and skills
│   │   ├── prompt-store.ts            # Prompt template list
│   │   ├── dev-command-store.ts       # Dev command status and output
│   │   ├── output-window-store.ts     # Output window state
│   │   ├── command-palette-store.ts   # Command palette open/filter state
│   │   └── tunnel-output-store.ts     # Tunnel output state
│   ├── hooks/                         # React hooks for lifecycle + event management
│   │   ├── useAgentSession.ts         # Listens for AGENT_EVENT push, updates chat store
│   │   ├── useSandboxEvents.ts        # Listens for SANDBOX_STAGED_DIFF push
│   │   ├── useWorkspacePersistence.ts # Save/restore tab layout (debounced 500ms)
│   │   ├── useKeyboardShortcut.ts     # Global keyboard shortcut system
│   │   ├── useAuthEvents.ts           # OAuth flow events from main
│   │   ├── useFileWatcher.ts          # Reload file tree on PROJECT_FS_CHANGED
│   │   ├── useDesktopEvents.ts        # Desktop container state push events
│   │   ├── useMcpEvents.ts            # MCP server status and config push events
│   │   ├── useGitStatusEvents.ts      # Git status change push events
│   │   ├── useEditorEvents.ts         # Agent-triggered file/URL open events
│   │   ├── useWebTabEvents.ts         # Web tab open/error push events
│   │   ├── useSubagentEvents.ts       # Subagent progress push events
│   │   ├── useCompanionMode.ts        # Detect and configure companion browser mode
│   │   ├── useDetectedEditors.ts      # Detect installed code editors
│   │   ├── useDefaultCommands.ts      # Default dev command suggestions
│   │   ├── useHighlight.ts            # Syntax highlighting utilities
│   │   └── useTheme.ts                # Theme detection and application
│   └── lib/                           # Utilities
│       ├── ipc-client.ts              # Universal IPC client (Electron + companion WebSocket)
│       ├── keybindings.ts             # Keyboard shortcut definitions + override resolution
│       ├── markdown.tsx               # Markdown rendering (react-markdown + highlight.js)
│       └── utils.ts                   # General utility functions
├── docs/                              # Documentation (both human-readable and AI-readable)
├── resources/                         # Electron app resources (icons, etc.)
├── build/                             # Build artifacts (gitignored)
├── out/                               # electron-vite output (gitignored)
├── package.json                       # Dependencies and npm scripts
├── electron-vite.config.mjs           # electron-vite build configuration
├── vite.companion.mjs                 # Companion UI Vite build config
├── electron-builder.yml               # Electron Builder packaging config
├── vitest.config.ts                   # Vitest test configuration
├── tsconfig.json                      # Root TypeScript config
├── tsconfig.node.json                 # Main process tsconfig
└── tsconfig.web.json                  # Renderer tsconfig
```

## Key Files

| File | Role |
|------|------|
| `electron/main/index.ts` | App bootstrap — instantiates every service and registers every IPC handler |
| `electron/preload/index.ts` | The only bridge between Node and browser — exposes `window.api` |
| `electron/services/pi-session-manager.ts` | Owns the Pi SDK `AgentSession` per tab; central orchestrator |
| `electron/services/sandboxed-tools.ts` | Intercepts all agent file writes; creates StagedDiffs |
| `electron/services/staged-diffs.ts` | In-memory pending-diff store; apply/reject logic |
| `electron/services/desktop-service.ts` | Docker container lifecycle for virtual desktop |
| `electron/services/mcp-manager.ts` | MCP server connections, tool discovery, lifecycle |
| `electron/services/memory-tools.ts` | Agent memory tools (read, write, search, delete) |
| `electron/services/editor-tools.ts` | Agent GUI tools (show file, open URL, web tab) |
| `shared/ipc.ts` | ALL IPC channel name constants — never use raw strings |
| `shared/types.ts` | ALL types crossing the IPC boundary — the contract |
| `src/app.tsx` | React root; mounts stores, hooks, keyboard shortcuts, and layout |
| `src/lib/ipc-client.ts` | Universal IPC client — same API in Electron and companion browser mode |
| `src/stores/chat-store.ts` | Messages per tab, streaming state — most frequently updated store |
| `src/hooks/useAgentSession.ts` | Bridges `AGENT_EVENT` push events into the chat store |

## Module Boundaries

- `electron/ipc/*` → imports from `electron/services/*` and `shared/*`. Never imports from `src/`.
- `electron/services/*` → imports from `shared/types.ts` and each other (via constructor injection). Never imports from `src/`.
- `shared/*` → no project-internal imports. Pure TypeScript types and constants.
- `src/stores/*` → calls `window.api.invoke()` (via `src/lib/ipc-client.ts`). Never imports from `electron/`.
- `src/hooks/*` → calls `window.api.on()` and `window.api.invoke()`. Never imports from `electron/`.
- `src/components/*` → reads from stores via hooks. Never calls IPC directly.

## Changes Log

- 2026-03-06: Added Desktop, MCP, editor tools, memory tools, web tabs, git rebase/conflicts, theme, new hooks, attachment IPC
- 2026-02-24: Initial documentation generated
