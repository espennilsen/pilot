# Pilot Docs

## Product

| Document | Description |
|----------|-------------|
| [PRD.md](PRD.md) | Product requirements — features, architecture, data models, phasing |

## Architecture & Design

| Document | Description |
|----------|-------------|
| [architecture.md](architecture.md) | High-level architecture — process model, data flow, tech stack, key decisions. Includes bash jail path analysis, session metadata persistence, and configurable file tree filtering. |
| [ipc-reference.md](ipc-reference.md) | Complete IPC channel reference — every channel, direction, args, returns. Includes session management (update-meta, delete), gitignore check, and skill toggle channels. |
| [services.md](services.md) | Main process services — all service classes, methods, responsibilities. Covers session-metadata persistence, bash jail enforcement, skill toggle, and file tree filtering. |
| [stores-and-hooks.md](stores-and-hooks.md) | Renderer state — all Zustand stores and React hooks with full API. Includes session archive/delete, hidden paths, and skill toggle store actions. |
| [settings.md](settings.md) | Settings layers, storage locations, schemas, and IPC reference. Covers hiddenPaths (gitignore-syntax file tree filtering) and session-metadata.json. |
| [memory.md](memory.md) | Memory system — two-tier storage, auto-extraction, manual commands |

## Companion (Remote Access)

| Document | Description |
|----------|-------------|
| [companion-implementation.md](companion-implementation.md) | Desktop-side implementation spec — server, IPC bridge, auth, discovery |
| [companion-api.md](companion-api.md) | Client API reference — protocol, WebSocket messages, IPC channels, REST |

## Developer Guide

| Document | Description |
|----------|-------------|
| [development.md](development.md) | Setup, scripts, adding features, conventions, debugging. CI builds on tag push only. |

## Quality

| Document | Description |
|----------|-------------|
| [code-review.md](code-review.md) | Code review findings — 25/38 resolved, 13 open items tracked |

## User Guides

| Document | Description |
|----------|-------------|
| [user/index.md](user/index.md) | User guide index — quick reference and navigation |
| [user/getting-started.md](user/getting-started.md) | First launch, opening projects, .gitignore prompt, first session |
| [user/sessions.md](user/sessions.md) | Session management — create, continue, archive, pin, delete, multi-tab |
| [user/agent.md](user/agent.md) | AI agent — tools, workflow, sandboxing, bash jail path analysis |
| [user/steering.md](user/steering.md) | Steering & follow-up — interrupt, queue, redirect |
| [user/keyboard-shortcuts.md](user/keyboard-shortcuts.md) | Complete keybindings reference |
| [user/memory.md](user/memory.md) | Two-tier memory system — global and project |
| [user/sidebar.md](user/sidebar.md) | Left sidebar — sessions, memory, tasks panes |
| [user/context-panel.md](user/context-panel.md) | Right panel — files (configurable hidden patterns), git, changes tabs |
| [user/settings.md](user/settings.md) | Settings panel — all tabs including Files (hidden patterns) and skill toggles |
| [user/companion.md](user/companion.md) | Companion access — mobile, remote, pairing |
| [user/tasks.md](user/tasks.md) | Task management — board, lifecycle, agent integration |
