# Changelog

All notable changes to Pilot are documented here, grouped by date.

## 2026-02-28

### Added
- **MCP server support** — connect to Model Context Protocol servers via stdio, SSE, and streamable HTTP transports; auto-reconnect with exponential backoff; config file watching for external edits
- **MCP settings UI** — add/edit/remove/test/restart servers from settings panel; status bar indicator showing connected server count
- **MCP config** — global (`~/.config/.pilot/mcp.json`) and per-project (`.pilot/mcp.json`) configuration
- **Test framework** — vitest 4.0 with `test` and `test:watch` scripts; 31 smoke tests covering `paths.ts` utilities, `StagedDiffManager`, and IPC channel integrity

### Changed
- **Pi SDK** updated from 0.54.1 → 0.55.3
- **electron-vite** updated from 2.3.0 → 4.0.1 (supports vite 5/6/7)
- **@vitejs/plugin-react** updated from 4.7.0 → 5.1.4
- **lucide-react** updated from 0.462.0 → 0.575.0
- **Patch updates** — electron 40.6.0→40.6.1, tailwindcss 4.2.0→4.2.1, @tailwindcss/vite 4.2.0→4.2.1, autoprefixer 10.4.24→10.4.27, simple-git 3.32.1→3.32.3

## 2026-02-25

### Added
- **Web tabs** — open URLs and local HTML files in an embedded browser tab (`pilot_web` agent tool)
- **HTML preview** — Globe button in file editor opens `.html`/`.htm` files in a web tab; Pencil button in web tab opens the source back in the editor
- **Agent tools** — `pilot_show_file` (open files in editor with line highlighting), `pilot_open_url` (open links in browser), `pilot_web` (open web tabs)
- **Memory tools** — agent can read and write global and project memory files
- **System prompt settings** — view and edit default/user system prompts, live-refresh on active sessions
- **Nightly build CI** — automated nightly builds for macOS, Windows, and Linux with GitHub Actions
- **Theme system** — UI polish and theming support
- **Skills upload** — allow uploading `.md` files as skills directly in settings
- **Screenshot** — add screenshot to README
- **Nightly build status badge** in README
- **Build-from-source instructions** in README

### Changed
- **Sandbox jail hardened** — read, grep, find, and ls tools now enforce jail path checks; bash safe prefixes derived from `$PATH` dynamically instead of hardcoded list
- **Config directory renamed** from `.pilot` to `pilot` (e.g. `~/.config/pilot/`) with automatic migration from the legacy path
- **Live sandbox settings** — jail, yolo mode, and allowed paths changes apply immediately to active sessions without restart
- **Allowed paths UI** — manage external allowed paths in Project Settings
- **Rebrand** — Pilot described as an Integrated Agentic Environment (IAE)
- **Default system prompt** updated to "You are Pilot, an AI agent"
- **Prompt settings** organized by category instead of source
- **MVC decomposition** — extract submodules from large files for better maintainability
- **Shell IPC improvements** and docs index update
- **README** slimmed down, architecture section removed

### Fixed
- Iframe load failures detected via main process `did-fail-load` event
- Blocked iframe detection for sites using X-Frame-Options headers
- Error state shown when sites block iframe embedding
- Agent no longer gets stuck after `pilot_web` tool execution
- CSP `frame-src` added to allow web tab iframes
- Editor tools corrected: execute signature and return type
- Markdown links no longer open companion auth dialog
- Relative file links from markdown preview open in new editor tabs
- Markdown table rendering and scroll position preserved across preview toggle
- Skill scanner discovers direct `.md` files in skills directory
- Copy-wasm plugin no longer crashes in CI when WASM file or output dir is missing
- Linux desktop entry config fixed for electron-builder v26
- macOS nightly build: hardened runtime disabled for ad-hoc signing
- Nightly `.deb` build: author email set, macOS entitlements patched
- Nightly release: empty artifacts filtered before upload
- Missing source files added for build (`pi-session-commit.ts` and others)

## 2026-02-24

### Added
- **Web fetch tool** — agent can fetch URLs directly
- **Session management** — delete button and archive toggle for sessions
- **Configurable file tree** — hidden file patterns using `.gitignore` syntax
- **Structured logging** — configurable logger with file rotation, syslog support, and daily log rotation with 14-day retention
- **Companion PIN refresh** — reduced PIN expiry to 30 seconds with a refresh button
- **Image attachments** — fixed and improved image attachment support in context panel

### Changed
- **MVC migration** — complete decomposition of all 11 large files into smaller modules
- **CI** — only build on tag push, remove stray PDF artifact
- **Documentation** — updated README and all docs for recent features
- **Code quality** — resolved all 71 code review findings, annotated all 64 silent catch blocks

### Fixed
- Bash tool jail enforcement via intelligent path analysis
- Session archive/pin state now persists to disk
- Skill/extension import works in sandboxed renderer; skill enable/disable toggle added
- Companion clients no longer re-authenticate on every connection
- Companion auth token persistence, output listeners, and token revocation
- Companion token no longer lost on tab close despite trusted device
- React "Cannot update component while rendering another" error in TaskKanban/Sidebar
- Suppressed misleading companion server log on startup

## 2026-02-23

### Added
- **Windows and Linux support** — cross-platform builds and platform-specific path handling
- **Tunnel output streaming** — Tailscale/Cloudflare tunnel output shown in a floating popup
- **Context panel collapse button** — collapse the right panel from its bottom-left corner
- **Wingman companion app** — link to companion app repo added to docs

### Fixed
- Race condition when accepting multiple edits to the same file
- Duplicate React keys in markdown inline rendering
- Nested button in AgentsPanel subagent row
- Slash commands not showing prompt templates on first open
- Tailscale cert directory uses `PILOT_APP_DIR` instead of hardcoded path
- Instant scroll to bottom on tab switch instead of slow smooth scroll
- Companion ↔ desktop real-time message sync
- Companion title bar pushed below iOS safe area (clock/notch)
- QR code uses the effective dropdown host (tunnel URL when available)
- QR code port handling: omit port for Tailscale funnel (standard HTTPS 443), hide from display label when using default port
- Tunnel output popup no longer auto-opens when enabling Tailscale/Cloudflare
