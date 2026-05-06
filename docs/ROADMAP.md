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
| **Custom Themes** | ✅ User-created themes with a theme editor. See [detailed plan](#custom-themes-plan) below. |

---

## Custom Themes Plan

> **Status:** ✅ Complete
> **Completed:** 2026-03-13
> **Complexity:** Medium — touches CSS variables, xterm, hljs, main process chrome, settings persistence, and companion sync.

### Goal

Let users create, edit, import, export, and share custom color themes beyond the built-in dark/light presets.

### Current State

The app has a solid but minimal theme system:
- **3 modes:** dark, light, system (OS-follows)
- **11 CSS variables** in `src/styles/globals.css` via Tailwind v4 `@theme` block: `bg-base`, `bg-surface`, `bg-elevated`, `text-primary`, `text-secondary`, `accent`, `success`, `error`, `warning`, `border`, plus fonts and radii
- **Terminal:** Hardcoded `XTERM_THEME_DARK` / `XTERM_THEME_LIGHT` objects in `Terminal.tsx` (16 ANSI colors + cursor/selection/bg/fg)
- **Syntax highlighting:** `highlight.js` atom-one-dark base with `[data-theme="light"]` CSS overrides in `globals.css`
- **Window chrome:** Main process receives `APP_THEME_CHANGED` to update titlebar overlay and background color
- **Persistence:** `localStorage['pilot-theme']` for early apply; `app-settings.json` for IPC sync
- **No custom palette UI** — only a `<select>` dropdown in GeneralSettings

### Design

#### Theme File Format

Each theme is a JSON file stored in `<PILOT_DIR>/themes/<slug>.json`:

```jsonc
{
  "name": "Nord",
  "slug": "nord",
  "author": "User",
  "base": "dark",           // "dark" | "light" — determines fallback semantics
  "version": 1,
  "colors": {
    // App chrome (maps 1:1 to CSS variables)
    "bg-base": "#2e3440",
    "bg-surface": "#3b4252",
    "bg-elevated": "#434c5e",
    "text-primary": "#eceff4",
    "text-secondary": "#d8dee9",
    "accent": "#88c0d0",
    "success": "#a3be8c",
    "error": "#bf616a",
    "warning": "#ebcb8b",
    "border": "#4c566a"
  },
  "terminal": {
    // Optional — falls back to base dark/light palette if omitted
    "background": "#2e3440",
    "foreground": "#eceff4",
    "cursor": "#88c0d0",
    "selectionBackground": "#88c0d040",
    "black": "#3b4252",
    "red": "#bf616a",
    "green": "#a3be8c",
    "yellow": "#ebcb8b",
    "blue": "#81a1c1",
    "magenta": "#b48ead",
    "cyan": "#88c0d0",
    "white": "#e5e9f0",
    "brightBlack": "#4c566a",
    "brightRed": "#bf616a",
    "brightGreen": "#a3be8c",
    "brightYellow": "#ebcb8b",
    "brightBlue": "#81a1c1",
    "brightMagenta": "#b48ead",
    "brightCyan": "#8fbcbb",
    "brightWhite": "#eceff4"
  },
  "syntax": {
    // Optional — highlight.js token overrides
    "comment": "#616e88",
    "keyword": "#81a1c1",
    "string": "#a3be8c",
    "number": "#b48ead",
    "function": "#88c0d0",
    "variable": "#d8dee9",
    "type": "#8fbcbb",
    "operator": "#81a1c1"
  }
}
```

**Key decisions:**
- `base` field determines which built-in theme to inherit from — unset keys fall back to the base palette
- `terminal` and `syntax` sections are optional — omit to keep the base theme's defaults
- `slug` is the unique identifier, auto-derived from name on create
- `version` field for future schema migrations

#### Type Changes (`shared/types.ts`)

```typescript
export type ThemeMode = 'dark' | 'light' | 'system' | 'custom';

export interface CustomTheme {
  name: string;
  slug: string;
  author: string;
  base: 'dark' | 'light';
  version: number;
  colors: Record<string, string>;      // app chrome CSS variables
  terminal?: Record<string, string>;   // xterm color overrides
  syntax?: Record<string, string>;     // hljs token overrides
}

// In PilotAppSettings:
//   theme: ThemeMode            (existing, extended with 'custom')
//   customThemeSlug?: string    (which custom theme is active)
```

#### IPC Channels (`shared/ipc.ts`)

| Channel | Direction | Args | Returns |
|---------|-----------|------|---------|
| `THEME_LIST` | invoke | — | `CustomTheme[]` |
| `THEME_GET` | invoke | `slug: string` | `CustomTheme \| null` |
| `THEME_SAVE` | invoke | `theme: CustomTheme` | `void` |
| `THEME_DELETE` | invoke | `slug: string` | `void` |
| `THEME_IMPORT` | invoke | — (opens file dialog) | `CustomTheme \| null` |
| `THEME_EXPORT` | invoke | `slug: string` (opens save dialog) | `void` |

#### New Service: `ThemeService` (`electron/services/theme-service.ts`)

Responsibilities:
- CRUD operations on `<PILOT_DIR>/themes/*.json`
- Validate theme JSON against schema (reject malformed files)
- List available themes (built-in + custom)
- Import: read `.json` from file dialog, validate, copy to themes dir
- Export: write theme JSON to user-chosen location
- Provide resolved theme palette to main process for window chrome updates

#### New Store: `useThemeStore` (`src/stores/theme-store.ts`)

```typescript
interface ThemeStore {
  customThemes: CustomTheme[];
  activeCustomTheme: CustomTheme | null;
  loadThemes: () => Promise<void>;
  applyCustomTheme: (slug: string) => void;
  saveTheme: (theme: CustomTheme) => Promise<void>;
  deleteTheme: (slug: string) => Promise<void>;
  importTheme: () => Promise<void>;
  exportTheme: (slug: string) => Promise<void>;
}
```

#### Theme Application Flow

```
User selects custom theme
  → useAppSettingsStore.setTheme('custom')
  → useAppSettingsStore.setCustomThemeSlug(slug)
  → useThemeStore.applyCustomTheme(slug)
      → Load theme JSON via IPC
      → Inject CSS variables onto document.documentElement.style
      → Update xterm instances with terminal palette
      → Inject hljs overrides via <style> element
      → Notify main process (APP_THEME_CHANGED) with resolved base + chrome colors
```

**Early apply (`main.tsx`):** Cache the active custom theme's CSS variables in `localStorage['pilot-custom-theme-css']` so they can be applied before React mounts (prevents flash).

#### Theme Editor UI

New settings section: **Settings → Appearance → Theme Editor**

**Components:**
- `src/components/settings/sections/ThemeSettings.tsx` — replaces the current theme `<select>` in GeneralSettings
- `src/components/settings/ThemeEditor.tsx` — full editor panel
- `src/components/settings/ThemePreview.tsx` — live preview card showing sample UI

**Editor layout:**

```
┌─────────────────────────────────────────────────────────┐
│  Theme: [Nord ▼]  [New] [Duplicate] [Import] [Export]   │
├───────────────────────────┬─────────────────────────────┤
│  App Colors               │                             │
│  ┌──────────────────────┐ │   ┌──────────────────────┐  │
│  │ Background    #2e3440│ │   │   Live Preview       │  │
│  │ Surface       #3b4252│ │   │   ┌───────────────┐  │  │
│  │ Elevated      #434c5e│ │   │   │ Sample chat   │  │  │
│  │ Text Primary  #eceff4│ │   │   │ message with  │  │  │
│  │ Text Sec.     #d8dee9│ │   │   │ code block    │  │  │
│  │ Accent        #88c0d0│ │   │   │ and buttons   │  │  │
│  │ Success       #a3be8c│ │   │   └───────────────┘  │  │
│  │ Error         #bf616a│ │   │                      │  │
│  │ Warning       #ebcb8b│ │   │   ┌───────────────┐  │  │
│  │ Border        #4c566a│ │   │   │ Terminal      │  │  │
│  └──────────────────────┘ │   │   └───────────────┘  │  │
│                           │   └──────────────────────┘  │
│  Terminal Colors          │                             │
│  [16 ANSI color grid]     │                             │
│                           │                             │
│  Syntax Colors            │                             │
│  [Token → color map]      │                             │
│                           │                             │
│  Base: [Dark ▼]           │                             │
│  [Save]  [Reset]          │                             │
├───────────────────────────┴─────────────────────────────┤
│  [Delete Theme]                                         │
└─────────────────────────────────────────────────────────┘
```

**Color picker:** Inline hex input + click-to-open native color picker (`<input type="color">`). No external dependency needed.

#### Built-in Theme Presets

Ship 4–6 popular presets as read-only themes (bundled in app resources, not editable but duplicatable):

| Theme | Base | Accent |
|-------|------|--------|
| **Pilot Dark** | Current dark | `#4fc3f7` |
| **Pilot Light** | Current light | `#0b7dda` |
| **Nord** | Dark | `#88c0d0` |
| **Solarized Dark** | Dark | `#268bd2` |
| **Solarized Light** | Light | `#268bd2` |
| **Monokai** | Dark | `#a6e22e` |

Built-in themes are stored in `electron/resources/themes/` and copied to the themes dir on first launch (with a `builtIn: true` flag to prevent deletion).

#### Companion Impact

- Custom theme slug is included in `APP_THEME_CHANGED` payload → companion can request the full theme via `THEME_GET`
- Companion renders its own UI, so it applies the CSS variable palette independently
- Theme editor is desktop-only (not mirrored to companion)

### Implementation Phases

#### Phase 1 — Theme Infrastructure (foundation) ✅

| # | Task | Files | Status |
|---|------|-------|--------|
| 1 | Define `CustomTheme` type and extended `ThemeMode` | `shared/types.ts` | ✅ |
| 2 | Add `THEME_*` IPC channel constants | `shared/ipc.ts` | ✅ |
| 3 | Create `ThemeService` — CRUD, validate, import/export | `electron/services/theme-service.ts` | ✅ |
| 4 | Register `THEME_*` IPC handlers | `electron/ipc/theme.ts`, `electron/main/index.ts` | ✅ |
| 5 | Add `customThemeSlug` to `PilotAppSettings` | `shared/types.ts`, `electron/services/app-settings.ts`, `src/stores/app-settings-store.ts` | ✅ |
| 6 | Create `useThemeStore` | `src/stores/theme-store.ts` | ✅ |
| 7 | Update `useTheme` hook to apply custom CSS variables | `src/hooks/useTheme.ts` | ✅ |
| 8 | Update `applyThemeEarly()` for custom theme flash prevention | `src/hooks/useTheme.ts` | ✅ |
| 9 | Update terminal to consume custom theme palette | `src/components/terminal/Terminal.tsx` | ✅ |
| 10 | Update hljs to consume custom syntax colors | `src/hooks/useTheme.ts` (dynamic `<style>` injection) | ✅ |
| 11 | Update main process chrome color resolution | `electron/main/index.ts` | ✅ |

#### Phase 2 — Theme Selector & Presets ✅

| # | Task | Files | Status |
|---|------|-------|--------|
| 12 | Bundle 4 built-in theme presets (Nord, Solarized Dark/Light, Monokai) | `resources/themes/*.json` | ✅ |
| 13 | Copy built-in themes on first launch | `ThemeService` | ✅ |
| 14 | New Appearance settings tab with theme picker grid (thumbnail cards) | `src/components/settings/sections/AppearanceSettings.tsx`, `src/components/settings/SettingsPanel.tsx`, `src/stores/ui-store.ts` | ✅ |
| 15 | Show active theme preview in settings | `src/components/settings/ThemePreview.tsx` | ✅ |

#### Phase 3 — Theme Editor ✅

| # | Task | Files | Status |
|---|------|-------|--------|
| 16 | Build theme editor panel with color pickers | `src/components/settings/ThemeEditor.tsx` | ✅ |
| 17 | Live preview component (sample chat, code block, terminal) | `src/components/settings/ThemePreview.tsx` | ✅ |
| 18 | New / Duplicate / Save / Delete actions | `ThemeEditor.tsx`, `useThemeStore` | ✅ |
| 19 | Import / Export via file dialogs | `AppearanceSettings.tsx`, `ThemeService` | ✅ |
| 20 | Reset within editor session | `ThemeEditor.tsx` | ✅ |

#### Phase 4 — Polish & Companion ✅

| # | Task | Files | Status |
|---|------|-------|--------|
| 21 | Companion gets theme via `THEME_GET` IPC (auto-forwarded by bridge) | Existing companion bridge architecture | ✅ |
| 22 | Live preview with sample UI shows contrast in real-time | `ThemePreview.tsx` | ✅ |
| 23 | Color picker grid uses native `<input type="color">` + hex input | `ThemeEditor.tsx` | ✅ |
| 24 | User guide: `docs/user/themes.md` | `docs/user/themes.md`, `docs/INDEX.md` | ✅ |
| 25 | Update `docs/CONFIGURATION.md` with themes dir and format | `docs/CONFIGURATION.md` | ✅ |

### Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| CSS variable injection XSS | Validate all color values match `/^#[0-9a-fA-F]{6,8}$/` before injection |
| Unreadable UI from bad contrast | Show WCAG contrast warnings in editor; require AA ratio for text on bg |
| Theme file corruption | Validate against JSON schema on load; fall back to built-in dark on error |
| Flash of wrong theme on launch | Cache resolved CSS variables in `localStorage` for pre-React apply |
| Companion desync | Send full theme payload on connect; companion falls back to dark if missing |
| Breaking changes to theme format | `version` field enables future migration scripts |

### Not in Scope (for now)

- **Per-project themes** — could be added later via `.pilot/theme.json`
- **Theme marketplace / sharing hub** — import/export covers this use case initially
- **Animated themes** — no gradient animations or dynamic color cycling
- **Font customization** — font family and size are separate settings, not part of theme

---

## Recently Completed

| Date | Milestone |
|------|-----------|
| 2026-03-13 | Custom themes — theme editor, 4 built-in presets (Nord, Solarized Dark/Light, Monokai), import/export, live preview |
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
