# Project Structure

> Last updated: 2026-02-24

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
│   │   ├── auth.ts                    # API keys and OAuth flows
│   │   ├── companion.ts               # Companion server control (enable, pair, tunnel)
│   │   ├── dev-commands.ts            # Dev command spawn/stop/stream
│   │   ├── extensions.ts              # Extension and skill management
│   │   ├── git.ts                     # Git operations (status, commit, branch, etc.)
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
│   │   ├── terminal.ts                # PTY terminal create/resize/dispose
│   │   └── workspace.ts               # Tab layout save/restore
│   └── services/                      # Business logic — one class per domain
│       ├── pi-session-manager.ts      # SDK AgentSession lifecycle per tab
│       ├── sandboxed-tools.ts         # File tool interception + diff staging
│       ├── staged-diffs.ts            # In-memory StagedDiff store per tab
│       ├── git-service.ts             # simple-git wrapper
│       ├── memory-manager.ts          # Two-tier MEMORY.md read/write + extraction
│       ├── dev-commands.ts            # Child process spawning for dev commands
│       ├── terminal-service.ts        # node-pty PTY management
│       ├── extension-manager.ts       # Extension/skill discovery and toggle
│       ├── workspace-state.ts         # Tab layout persistence to workspace.json
│       ├── app-settings.ts            # PilotAppSettings read/write
│       ├── pilot-paths.ts             # Cross-platform path utilities
│       ├── logger.ts                  # Structured logger (file + syslog transport)
│       ├── session-metadata.ts        # Session pin/archive metadata persistence
│       ├── task-manager.ts            # Task board CRUD backed by pi task system
│       ├── subagent-manager.ts        # Parallel subagent pool management
│       ├── prompt-library.ts          # Slash-command prompt template CRUD
│       ├── command-registry.ts        # Agent slash-command registry
│       ├── web-fetch-tool.ts          # HTTP fetch tool for agent
│       ├── orchestrator-prompt.ts     # System prompt assembly for orchestrator mode
│       ├── companion-server.ts        # HTTPS + WebSocket server
│       ├── companion-auth.ts          # PIN/QR pairing, session token management
│       ├── companion-discovery.ts     # mDNS/Bonjour advertisement
│       ├── companion-ipc-bridge.ts    # Forwards IPC push events to companion clients
│       ├── companion-remote.ts        # Remote tunnel management
│       └── companion-tls.ts           # Self-signed certificate generation
├── shared/                            # Shared between main and renderer (no Node.js-only imports)
│   ├── ipc.ts                         # All IPC channel name constants (single source of truth)
│   └── types.ts                       # All serializable types crossing the IPC boundary
├── src/                               # Renderer process (React, no Node.js)
│   ├── app.tsx                        # React root — keyboard shortcuts, lifecycle
│   ├── components/                    # UI — one folder per domain
│   │   ├── chat/                      # Chat messages, input, streaming
│   │   ├── sidebar/                   # Left sidebar (sessions, memory, tasks panes)
│   │   ├── context/                   # Right panel (files, git, changes tabs)
│   │   ├── sandbox/                   # Diff review UI (Monaco side-by-side)
│   │   ├── terminal/                  # Terminal UI (xterm.js)
│   │   ├── settings/                  # Settings modal (all tabs)
│   │   ├── git/                       # Git status, commit, branch, log
│   │   ├── tab-bar/                   # Tab bar at top of window
│   │   ├── status-bar/                # Bottom status bar
│   │   ├── editor/                    # File editor (Monaco)
│   │   ├── memory/                    # Memory panel UI
│   │   ├── tasks/                     # Task board UI
│   │   ├── extensions/                # Extension and skill management UI
│   │   ├── prompts/                   # Prompt template editor
│   │   ├── companion/                 # Companion pairing and status UI
│   │   ├── subagents/                 # Subagent progress UI
│   │   ├── command-palette/           # Command palette overlay
│   │   ├── command-center/            # Command center panel
│   │   ├── scratch-pad/               # Scratch pad panel
│   │   ├── onboarding/                # First-launch onboarding wizard
│   │   ├── about/                     # About dialog
│   │   ├── docs/                      # In-app docs viewer
│   │   ├── layout/                    # Layout primitives (panels, resizable)
│   │   └── shared/                    # Shared UI primitives (buttons, icons, etc.)
│   ├── stores/                        # Zustand stores — one per domain
│   │   ├── tab-store.ts               # Tabs, active tab, closed-tab stack
│   │   ├── chat-store.ts              # Messages per tab, streaming state, token counts
│   │   ├── sandbox-store.ts           # Staged diffs per tab, yolo mode
│   │   ├── git-store.ts               # Git status, branches, log, blame, stashes
│   │   ├── project-store.ts           # Project path, file tree, file preview
│   │   ├── ui-store.ts                # Panel/sidebar visibility, settings modal
│   │   ├── session-store.ts           # Historical session list for sidebar
│   │   ├── app-settings-store.ts      # Developer mode, keybinds, terminal prefs
│   │   ├── memory-store.ts            # Memory count badge, last-update pulse
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
│   │   └── useFileWatcher.ts          # Reload file tree on PROJECT_FS_CHANGED
│   └── lib/                           # Utilities
│       ├── ipc-client.ts              # Universal IPC client (Electron + companion WebSocket)
│       ├── keybindings.ts             # Keyboard shortcut definitions + override resolution
│       ├── markdown.tsx               # Markdown rendering (react-markdown + highlight.js)
│       └── utils.ts                   # General utility functions
├── docs/                              # Documentation (both human-readable and AI-readable)
│   ├── INDEX.md                       # AI doc index (this set)
│   ├── OVERVIEW.md                    # Project overview (this set)
│   ├── STRUCTURE.md                   # Directory map (this file)
│   ├── ARCHITECTURE.md                # Component relationships and data flow
│   ├── DATA_MODEL.md                  # Key types and data structures
│   ├── CONFIGURATION.md               # All config knobs
│   ├── PATTERNS.md                    # Coding conventions and patterns
│   ├── DEVELOPMENT.md                 # Local setup and dev workflow
│   ├── GLOSSARY.md                    # Domain terminology
│   ├── architecture.md                # Detailed architecture (developer-authored)
│   ├── ipc-reference.md               # Complete IPC channel reference
│   ├── services.md                    # Main process services reference
│   ├── stores-and-hooks.md            # Renderer stores and hooks reference
│   ├── settings.md                    # Settings layers and schemas
│   ├── memory.md                      # Memory system deep-dive
│   ├── development.md                 # Developer guide
│   ├── companion.md                   # Companion API spec
│   ├── companion-implementation.md    # Companion implementation guide
│   └── user/                          # User-facing guides
├── resources/                         # Electron app resources (icons, etc.)
├── build/                             # Build artifacts (gitignored)
├── out/                               # electron-vite output (gitignored)
├── package.json                       # Dependencies and npm scripts
├── electron-vite.config.mjs           # electron-vite build configuration
├── vite.companion.mjs                 # Companion UI Vite build config
├── electron-builder.yml               # Electron Builder packaging config
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

- 2026-02-24: Initial documentation generated
