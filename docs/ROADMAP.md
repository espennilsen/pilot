# Roadmap

> Last updated: 2026-02-25

Current state: **Cross-platform alpha**. Core chat, sandbox, git, companion, memory, tasks, and subagent features work on macOS, Windows, and Linux. Nightly builds ship automatically via GitHub Actions.

---

## In Progress

### 🪟 Windows Platform Support (epic)

Ship Pilot on Windows. 12 tasks, most in review.

| Priority | Task | Status |
|----------|------|--------|
| 🔴 Critical | Config paths — use `%APPDATA%` | Review |
| 🔴 Critical | Replace `which`/`mv`/`unzip` with cross-platform alternatives | Review |
| 🔴 Critical | Add NSIS/portable build target + `.ico` icon | ✅ Done |
| 🟠 High | Session path encoding — handle drive letters | Review |
| 🟠 High | Terminal & editor detection (`wt.exe`, PowerShell, `cmd`) | Review |
| 🟠 High | Keyboard shortcut labels — show `Ctrl` instead of `⌘` | Review |
| 🟡 Medium | Snap layouts & titlebar overlay | Review |
| 🟡 Medium | Process management — tree-kill and SIGTERM handling | Review |
| 🟡 Medium | Companion TLS — replace OpenSSL `/dev/stdin` with Node crypto | Review |
| 🟡 Medium | Path handling — drive letter case, tilde expansion, UNC paths | Review |
| 🔵 Low | CI/CD — GitHub Actions for Windows builds | ✅ Done |

### 🐧 Linux Platform Support (epic)

Ship Pilot on Linux. 8 tasks, most in review.

| Priority | Task | Status |
|----------|------|--------|
| 🔴 Critical | Config paths — respect `$XDG_CONFIG_HOME` | Review |
| 🔴 Critical | Add AppImage/deb build targets | ✅ Done |
| 🟠 High | Terminal detection & working-directory flags per terminal | Review |
| 🟠 High | Keyboard shortcut labels — show `Ctrl` instead of `⌘` | Review |
| 🟡 Medium | UI labels — "File Manager" and Linux-appropriate fonts | Review |
| 🔵 Low | Window chrome — test drag/resize across DEs | Review |
| 🔵 Low | CI/CD — GitHub Actions for Linux builds | ✅ Done |

### 🏗️ Code Quality

| Item | Status |
|------|--------|
| MVC migration — large file decomposition (19 items, 2 waves) | ✅ Done |
| Code review — resolve all 71 findings | ✅ Done |
| Annotate all 64 silent catch blocks | ✅ Done |
| Configurable logger with file rotation | ✅ Done |

---

## Planned — Post-MVP

Features planned after cross-platform shipping. Ordered by priority.

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
| **Git Interactive Rebase** | Visual interactive rebase editor within the app. |

### Low Priority

| Feature | Description |
|---------|-------------|
| **Git Submodule Support** | Manage and navigate submodules from the git panel. |
| **Collaborative Sessions** | Share a session link for pair-programming with AI. |
| **Voice Input** | Local AI speech-to-text for hands-free prompting (Whisper.cpp, MLX). Cloud STT (Deepgram, AssemblyAI) as opt-in. |
| **Custom Themes** | User-created themes with a theme editor. |

---

## Recently Completed

| Date | Milestone |
|------|-----------|
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
| 2026-02-23 | Cross-platform review — Windows (12 tasks) + Linux (8 tasks) created |
| 2026-02-23 | Companion auth hardening — token persistence, device trust, PIN refresh |
| 2026-02-23 | Configurable logger with syslog support and daily rotation |
| 2026-02-22 | `web_fetch` tool for agent |
| 2026-02-22 | Jail enforcement on bash tool via path analysis |
| 2026-02-22 | Session delete, archive/pin persistence |
| 2026-02-22 | File tree hidden patterns with `.gitignore` syntax |

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
