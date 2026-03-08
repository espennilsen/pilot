# Roadmap

> Last updated: 2026-03-08

Current state: **Cross-platform alpha**. Core chat, sandbox, git, companion, memory, tasks, desktop, and subagent features work on macOS, Windows, and Linux. Nightly builds ship automatically via GitHub Actions. All platform epics and code quality work are complete.

---

## Planned — Next Up

Features planned for the next development cycle. Ordered by priority.

### High Priority

| Feature | Description |
|---------|-------------|
| **Auto-update** | OTA updates via `electron-updater` + GitHub Releases. Requires code signing (Apple Developer cert for macOS, optional for Windows). |
| **Code signing** | Sign and notarize builds for macOS (required for auto-update and Gatekeeper) and Windows (removes SmartScreen warnings). |

### Medium Priority

| Feature | Description |
|---------|-------------|
| **Extension Marketplace** | Browse and install extensions/skills from a community registry (beyond zip import). |
| **Multi-Agent Backends** | Support for multiple AI agent backends (not just Pi SDK). |

### Low Priority

| Feature | Description |
|---------|-------------|
| **Collaborative Sessions** | Share a session link for pair-programming with AI. |
| **Voice Input** | Local AI speech-to-text for hands-free prompting (Whisper.cpp, MLX). Cloud STT (Deepgram, AssemblyAI) as opt-in. |
| **Custom Themes** | User-created themes with a theme editor. |

---

## Recently Completed

| Date | Milestone |
|------|-----------|
| 2026-03-08 | Git submodule support — list, init, deinit, update, sync from git panel |
| 2026-03-07 | Task review approval — approve/reject tasks in review status from UI |
| 2026-03-07 | Refactor: extract SessionToolInjector to isolate private SDK access |
| 2026-03-07 | Fix kanban board columns not hiding when excluded by status filter |
| 2026-03-07 | Dependency update — pi-coding-agent 0.55.3→0.57.0, Electron 40.6.1→40.8.0 |
| 2026-03-06 | Desktop screenshot grid overlay — always-on coordinate grid for agent precision |
| 2026-03-06 | Git interactive rebase — visual rebase editor with drag-to-reorder |
| 2026-03-04 | Memory tools — search, category normalization, and improved UX |
| 2026-02-28 | Desktop — Docker-based virtual display for agent GUI automation |
| 2026-02-27 | AI-assisted git conflict resolution with agent integration |
| 2026-02-25 | Nightly CI builds — macOS, Windows, Linux via GitHub Actions |
| 2026-02-25 | Agent memory tools — `pilot_memory_read/add/remove` |
| 2026-02-25 | System prompt settings — editable with live refresh on active sessions |
| 2026-02-25 | Skill .md file import in settings |
| 2026-02-25 | File editor — direct edit mode with syntax highlighting overlay |
| 2026-02-25 | Markdown preview toggle for `.md`/`.mdx` files |
| 2026-02-25 | Prompt library reorganized by category |
| 2026-02-24 | Light theme — dark/light/system modes, terminal theme, hljs overrides |
| 2026-02-24 | MVC migration complete — all 19 large files decomposed |
| 2026-02-24 | Full documentation suite (14 docs + 8 user guides) |
| 2026-02-23 | Cross-platform support — Windows + Linux in a single 48-file commit |
| 2026-02-23 | Companion app — WebSocket bridge, pairing, TLS, Tailscale/Cloudflare tunnels |
| 2026-02-23 | Companion auth hardening — token persistence, device trust, PIN refresh |
| 2026-02-23 | Configurable logger with syslog support and daily rotation |
| 2026-02-22 | `web_fetch` tool for agent |
| 2026-02-22 | Jail enforcement on bash tool via path analysis |
| 2026-02-22 | Session delete, archive/pin persistence |
| 2026-02-22 | File tree hidden patterns with `.gitignore` syntax |

## Completed Epics

| Epic | Completed |
|------|-----------|
| 🪟 Windows platform support (12 tasks) | 2026-02-23 |
| 🐧 Linux platform support (8 tasks) | 2026-02-23 |
| 📱 Companion app — server, auth, TLS, discovery, remote access | 2026-02-23 |
| 🏗️ Code quality — MVC migration, 71 review findings, 64 catch blocks, logger | 2026-02-24 |
| 🖥️ Desktop — Docker sandbox with virtual display | 2026-02-28 |
| ⚔️ AI-assisted git conflict resolution | 2026-02-27 |
| 🔀 Git interactive rebase UI | 2026-03-06 |
| 📦 Git submodule support | 2026-03-08 |
| ✅ Task review approval (approve/reject from UI) | 2026-03-07 |

---

## Non-Functional Targets

| Requirement | Target |
|-------------|--------|
| **Platforms** | macOS 12+, Windows 10+, Linux (Wayland + X11) |
| **Cold start** | < 3 seconds |
| **Input latency** | < 50ms |
| **Idle memory** | < 200 MB |
| **Active session** | < 500 MB |
| **Session scale** | 10,000+ sessions without degradation |
| **Accessibility** | Full keyboard nav, screen reader compatible, reduced motion |
| **Offline** | Launches and shows history; agent features degrade gracefully |
