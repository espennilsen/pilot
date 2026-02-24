# Documentation Index

> Last updated: 2026-02-24

This directory contains both AI-readable reference docs (UPPERCASE files) and developer-authored deep-dives (lowercase files). Start with OVERVIEW.md for a high-level understanding.

## Reading Order for New Agents

1. **[OVERVIEW.md](OVERVIEW.md)** — What Pilot is, tech stack, key concepts, entry points
2. **[STRUCTURE.md](STRUCTURE.md)** — Where things live in the codebase and module boundaries
3. **[ARCHITECTURE.md](ARCHITECTURE.md)** — How components connect, data flows, key abstractions
4. **[GLOSSARY.md](GLOSSARY.md)** — Domain terminology (read when a term is unclear)
5. **[DATA_MODEL.md](DATA_MODEL.md)** — Types, file-based persistence, settings schemas
6. **[PATTERNS.md](PATTERNS.md)** — Coding conventions to follow when writing new code
7. **[CONFIGURATION.md](CONFIGURATION.md)** — All config knobs, defaults, and file locations

## AI-Readable Reference Docs

| Document | Description |
|----------|-------------|
| [OVERVIEW.md](OVERVIEW.md) | Project purpose, tech stack, key concepts, entry points |
| [STRUCTURE.md](STRUCTURE.md) | Annotated directory tree, key files, module boundaries |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Component map, data flows, key abstractions, security model |
| [DATA_MODEL.md](DATA_MODEL.md) | Core types, IPC types, file-based persistence summary |
| [CONFIGURATION.md](CONFIGURATION.md) | All config files, keys, defaults, and file locations |
| [PATTERNS.md](PATTERNS.md) | IPC conventions, Zustand rules, error handling, cross-platform |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Setup, build, adding features, debugging, checklist |
| [GLOSSARY.md](GLOSSARY.md) | Definitions for all domain-specific and project-specific terms |

## Developer-Authored Deep-Dives

| Document | Description |
|----------|-------------|
| [architecture.md](architecture.md) | Full architecture overview with code examples and decision rationale |
| [ipc-reference.md](ipc-reference.md) | Complete IPC channel reference — every channel, direction, args, returns |
| [services.md](services.md) | Main process services — all classes, methods, responsibilities |
| [stores-and-hooks.md](stores-and-hooks.md) | Renderer state — all Zustand stores and React hooks with full API |
| [settings.md](settings.md) | Settings layers, schemas, IPC reference |
| [memory.md](memory.md) | Memory system architecture, file formats, extraction flow |
| [development.md](development.md) | Developer setup, scripts, conventions, debugging |
| [companion.md](companion.md) | Companion API spec — HTTPS + WebSocket protocol |
| [companion-implementation.md](companion-implementation.md) | Companion desktop implementation guide |
| [PRD.md](PRD.md) | Full product requirements document |

## User Guides

| Document | Description |
|----------|-------------|
| [user/index.md](user/index.md) | User guide index |
| [user/getting-started.md](user/getting-started.md) | First launch, opening projects, first session |
| [user/sessions.md](user/sessions.md) | Session management — create, continue, archive, pin, delete |
| [user/agent.md](user/agent.md) | AI agent — tools, workflow, sandboxing |
| [user/keyboard-shortcuts.md](user/keyboard-shortcuts.md) | Complete keybindings reference |
| [user/memory.md](user/memory.md) | Two-tier memory system |
| [user/companion.md](user/companion.md) | Companion remote access |
| [user/tasks.md](user/tasks.md) | Task management |

## Changes Log

- 2026-02-24: Initial documentation generated
