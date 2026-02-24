# MVC Migration — Large File Decomposition

**Started:** 2026-02-24
**Pattern:** Strict MVC per module — Model (data/types/logic), View (pure rendering), Controller (event handling/orchestration), plus Helpers/Lib extraction.

---

## Migration Status

| # | File | LOC | Status | Notes |
|---|---|---|---|---|
| 1 | `src/components/settings/SettingsPanel.tsx` | 1,768 | ✅ Done | Split into per-tab components + shared helpers |
| 2 | `src/components/chat/MessageInput.tsx` | 1,041 | ✅ Done | Extracted ModelPicker, message-input-helpers |
| 3 | `electron/services/pi-session-manager.ts` | 842 | ✅ Done | Extracted pi-session-helpers (callCheapModel, getSessionDir, decodeDirName) |
| 4 | `electron/services/task-manager.ts` | 789 | ✅ Done | Extract types/interfaces, query helpers, dependency logic |
| 5 | `electron/services/prompt-library.ts` | 703 | ✅ Done | Extracted prompt-parser (parsing, constants, variable extraction) |
| 6 | `electron/services/subagent-manager.ts` | 675 | ✅ Done | Extracted subagent-helpers (types, constants, buildPoolResult) |
| 7 | `src/components/sidebar/SidebarTasksPane.tsx` | 635 | ✅ Done | Extracted SidebarTaskDetail, task-constants |
| 8 | `src/components/context/FileTree.tsx` | 590 | ✅ Done | Extracted FileTreeNode, file-tree-helpers |
| 9 | `electron/services/companion-remote.ts` | 569 | ✅ Done | Extracted companion-tailscale, companion-cloudflare |
| 10 | `src/components/onboarding/WelcomeScreen.tsx` | 554 | ✅ Done | Extracted AuthStep, ToolsStep, ProjectStep |
| 11 | `electron/services/companion-server.ts` | 515 | ✅ Done | Extracted companion-server-types, companion-routes |

---

## MVC Mapping for This Project

| MVC Layer | Electron (Main) | React (Renderer) |
|---|---|---|
| **Model** | `types.ts` — interfaces, enums, constants | `types.ts` + store state shape |
| **View** | N/A | Pure components (JSX only, no logic) |
| **Controller** | Service class methods, IPC handlers | Hooks, event handlers, store actions |
| **Helpers/Lib** | Pure utility functions (`*-helpers.ts`) | Pure utility functions (`*-helpers.ts`) |

---

## Detailed Split Plans

### 1. SettingsPanel.tsx (1,768 → ~8 files)

**Before:** One mega-component with 10+ inline section components and helpers.

**After:**
```
src/components/settings/
  SettingsPanel.tsx              — Shell: modal, tab nav, routes to sections (~100 LOC)
  sections/
    GeneralSettings.tsx          — General settings section
    AuthSettings.tsx             — Auth & Models section
    ProjectSettings.tsx          — Project settings section
    FilesSettings.tsx            — Files settings section
    CompanionSettings.tsx        — Companion section
    PromptsSettings.tsx          — Prompts section (thin wrapper)
    KeybindingsSettings.tsx      — Keybindings section
    ExtensionsSettings.tsx       — Extensions section (thin wrapper)
    SkillsSettings.tsx           — Skills section (thin wrapper)
    DeveloperSettings.tsx        — Developer settings section
  settings-helpers.ts            — Shared helpers: SettingRow, Toggle, isMac, ReopenWelcomeButton
```

### 2. MessageInput.tsx (1,041 → ~5 files)

**Before:** One component with toolbar, slash commands, file attachments, paste handling, prompt fill.

**After:**
```
src/components/chat/
  MessageInput.tsx               — Main input: textarea, submit (~200 LOC)
  MessageInputToolbar.tsx        — Toolbar buttons (model, yolo, stop, etc.)
  SlashCommandMenu.tsx           — Slash command dropdown + logic
  AttachmentManager.tsx          — File attachment UI + paste handler
  message-input-helpers.ts       — Text manipulation, file reading, constants
```

### 3. pi-session-manager.ts (842 → ~3 files)

**Before:** One class with session lifecycle + event forwarding + helper logic.

**After:**
```
electron/services/
  pi-session-manager.ts          — Core class: create/continue/dispose sessions (~400 LOC)
  pi-session-events.ts           — Event forwarding & mapping logic
  pi-session-helpers.ts          — Pure helpers: prompt building, config merging
```

### 4. task-manager.ts (789 → ~3 files)

**Before:** One class with types + CRUD + queries + dependency graph + file I/O.

**After:**
```
electron/services/
  task-manager.ts                — Core class: CRUD, persistence (~350 LOC)
  task-types.ts                  — All interfaces, types, enums
  task-helpers.ts                — Query filtering, dependency resolution, sorting
```

### 5. prompt-library.ts (703 → ~3 files)

**Before:** One class with file I/O + parsing + variable extraction + watching.

**After:**
```
electron/services/
  prompt-library.ts              — Core class: CRUD, watching, change callbacks (~350 LOC)
  prompt-parser.ts               — Markdown/frontmatter parsing, variable extraction
  prompt-types.ts                — Types, interfaces (if enough to extract)
```

### 6. subagent-manager.ts (675 → ~3 files)

**Before:** One class with session creation + pool management + event handling.

**After:**
```
electron/services/
  subagent-manager.ts            — Core class: spawn, lifecycle (~300 LOC)
  subagent-pool.ts               — Pool management: create, send, list, kill
  subagent-helpers.ts            — Config building, event mapping, types
```

### 7. SidebarTasksPane.tsx (635 → ~4 files)

**After:**
```
src/components/sidebar/
  SidebarTasksPane.tsx           — Container: layout, tab switching (~100 LOC)
  tasks/TaskList.tsx             — Task list rendering
  tasks/TaskFilters.tsx          — Filter bar/controls
  tasks/task-helpers.ts          — Sorting, filtering, formatting helpers
```

### 8. FileTree.tsx (590 → ~4 files)

**After:**
```
src/components/context/
  FileTree.tsx                   — Container + tree state (~200 LOC)
  FileTreeNode.tsx               — Single node rendering + expand/collapse
  FileTreeContextMenu.tsx        — Right-click context menu
  file-tree-helpers.ts           — Path utils, sort, filter, icon mapping
```

### 9. companion-remote.ts (569 → ~3 files)

**After:**
```
electron/services/
  companion-remote.ts            — CompanionRemote class (~200 LOC)
  companion-tailscale.ts         — Tailscale funnel setup + types
  companion-cloudflare.ts        — Cloudflare tunnel setup + types
```

### 10. WelcomeScreen.tsx (554 → ~4 files)

**After:**
```
src/components/onboarding/
  WelcomeScreen.tsx              — Shell: step nav, progress (~100 LOC)
  steps/WelcomeStep.tsx          — Welcome/intro step
  steps/SetupStep.tsx            — Config/setup step  
  steps/ProjectStep.tsx          — Project selection step
  welcome-helpers.ts             — Validation, step logic
```

### 11. companion-server.ts (515 → ~3 files)

**After:**
```
electron/services/
  companion-server.ts            — CompanionServer class: start/stop (~200 LOC)
  companion-routes.ts            — REST route handlers
  companion-ws.ts                — WebSocket handlers + auth
  companion-server-types.ts      — Interfaces (WSMessage, config, etc.)
```

---

## Completed Splits

### 1. SettingsPanel.tsx ✅ (1,768 → 116 LOC)
Split into 10 section components + `settings-helpers.tsx`. See `src/components/settings/sections/`.

### 2. MessageInput.tsx ✅ (1,041 → 863 LOC)
- `ModelPicker.tsx` (170 LOC) — self-contained model selector popup
- `message-input-helpers.ts` (17 LOC) — shared types (`ModelInfo`, `ImageAttachment`) and constants (`SUPPORTED_IMAGE_TYPES`)

### 3. pi-session-manager.ts ✅ (842 → 732 LOC)
- `pi-session-helpers.ts` (113 LOC) — `callCheapModel()`, `getSessionDir()`, `decodeDirName()` pure functions

### 4. task-manager.ts ✅ (789 → 455 LOC)
Pre-existing split into `task-types.ts`, `task-helpers.ts`, `task-tools.ts`.

### 5. prompt-library.ts ✅ (703 → 578 LOC)
- `prompt-parser.ts` (152 LOC) — parsing constants, `parsePromptFile()`, `extractVariables()`, `computeHash()`, `slugify()`

### 6. subagent-manager.ts ✅ (675 → 648 LOC)
- `subagent-helpers.ts` (47 LOC) — types (`SubagentInternal`, `PoolInternal`), constants, `buildPoolResult()`

### 7. SidebarTasksPane.tsx ✅ (635 → 340 LOC)
- `tasks/SidebarTaskDetail.tsx` (254 LOC) — task detail view component
- `tasks/task-constants.ts` (54 LOC) — status/priority/type config arrays

### 8. FileTree.tsx ✅ (590 → 279 LOC)
- `FileTreeNode.tsx` (163 LOC) — tree node component + file icon helper
- `file-tree-helpers.tsx` (158 LOC) — `buildMenuItems()`, `InlineInput`, `MenuState` type

### 9. companion-remote.ts ✅ (569 → 244 LOC)
- `companion-tailscale.ts` (230 LOC) — `setupTailscaleProxy()`, `runTailscaleFunnel()`, Tailscale types
- `companion-cloudflare.ts` (111 LOC) — `setupCloudflareTunnel()`, `CloudflareTunnelInfo`

### 10. WelcomeScreen.tsx ✅ (554 → 138 LOC)
- `steps/AuthStep.tsx` (249 LOC) — auth provider cards, OAuth flow UI
- `steps/ToolsStep.tsx` (143 LOC) — terminal/editor detection
- `steps/ProjectStep.tsx` (53 LOC) — project selection

### 11. companion-server.ts ✅ (515 → 333 LOC)
- `companion-server-types.ts` (61 LOC) — all interfaces and WS message types
- `companion-routes.ts` (144 LOC) — Express route setup function

