# Documentation Index

> Last updated: 2026-03-10 (rev 2)

Start with OVERVIEW.md for a high-level understanding, then follow the reading order below.

## Reading Order for New Agents

1. **[OVERVIEW.md](OVERVIEW.md)** — What Pilot is, tech stack, key concepts, entry points
2. **[STRUCTURE.md](STRUCTURE.md)** — Where things live in the codebase and module boundaries
3. **[ARCHITECTURE.md](ARCHITECTURE.md)** — How components connect, data flows, key abstractions
4. **[GLOSSARY.md](GLOSSARY.md)** — Domain terminology (read when a term is unclear)
5. **[DATA-MODEL.md](DATA-MODEL.md)** — Types, file-based persistence, settings schemas
6. **[PATTERNS.md](PATTERNS.md)** — Coding conventions to follow when writing new code
7. **[CONFIGURATION.md](CONFIGURATION.md)** — All config knobs, defaults, and file locations

## Reference Docs

| Document | Description |
|----------|-------------|
| [OVERVIEW.md](OVERVIEW.md) | Project purpose, tech stack, key concepts, entry points |
| [STRUCTURE.md](STRUCTURE.md) | Annotated directory tree, key files, module boundaries |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Full architecture overview — component map, data flows, security model, code examples |
| [DATA-MODEL.md](DATA-MODEL.md) | Core types, IPC types, file-based persistence summary |
| [CONFIGURATION.md](CONFIGURATION.md) | All config files, keys, defaults, and file locations |
| [PATTERNS.md](PATTERNS.md) | IPC conventions, Zustand rules, error handling, cross-platform, agent tools |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Setup, build, adding features, debugging, checklist |
| [IPC-REFERENCE.md](IPC-REFERENCE.md) | Complete IPC channel reference — every channel, direction, args, returns |
| [SERVICES.md](SERVICES.md) | Main process services — all classes, methods, responsibilities |
| [STORES-AND-HOOKS.md](STORES-AND-HOOKS.md) | Renderer state — all Zustand stores and React hooks with full API |
| [SETTINGS.md](SETTINGS.md) | Settings layers, schemas, IPC reference |
| [MEMORY.md](MEMORY.md) | Memory system architecture, file formats, extraction flow |
| [DESKTOP.md](DESKTOP.md) | Desktop virtual display — architecture, Docker container, agent tools, IPC, settings |
| [COMPANION.md](COMPANION.md) | Companion API spec — HTTPS + WebSocket protocol |
| [COMPANION-IMPLEMENTATION.md](COMPANION-IMPLEMENTATION.md) | Companion desktop implementation guide |
| [PRD.md](PRD.md) | Full product requirements document |
| [ROADMAP.md](ROADMAP.md) | What's in progress, planned post-MVP, and recently completed |
| [GLOSSARY.md](GLOSSARY.md) | Definitions for all domain-specific and project-specific terms |
| [GAPS.md](GAPS.md) | Competitive feature gap analysis |

## User Guides

| Document | Description |
|----------|-------------|
| [user/index.md](user/index.md) | User guide index |
| [user/getting-started.md](user/getting-started.md) | First launch, opening projects, first session |
| [user/sessions.md](user/sessions.md) | Session management — create, continue, archive, pin, delete |
| [user/agent.md](user/agent.md) | AI agent — tools, workflow, sandboxing |
| [user/steering.md](user/steering.md) | Steering & follow-up — redirect or queue messages while the agent works |
| [user/keyboard-shortcuts.md](user/keyboard-shortcuts.md) | Complete keybindings reference |
| [user/memory.md](user/memory.md) | Two-tier memory system |
| [user/tasks.md](user/tasks.md) | Task management |
| [user/sidebar.md](user/sidebar.md) | Left sidebar — sessions, memory, tasks panes |
| [user/context-panel.md](user/context-panel.md) | Right panel — files, git, changes tabs |
| [user/settings.md](user/settings.md) | Configuration, auth, extensions, preferences |
| [user/themes.md](user/themes.md) | Custom themes — create, edit, import, export color themes |
| [user/companion.md](user/companion.md) | Companion remote access |
| [user/desktop.md](user/desktop.md) | Desktop virtual display — agent-controlled browser testing and GUI automation |

## Changes Log

- 2026-03-10: Updated all docs for git submodules, task review approval, SessionToolInjector, shell confirm dialog, Electron 40.8
- 2026-03-10: Standardised all doc filenames to UPPERCASE, merged reference tables, added missing user guides
- 2026-03-06: Updated all AI-readable reference docs for Desktop, MCP, interactive rebase, memory tools, editor tools, web tabs, theme support
- 2026-02-24: Added Desktop feature documentation (DESKTOP.md, user/desktop.md)
- 2026-02-24: Initial documentation generated
