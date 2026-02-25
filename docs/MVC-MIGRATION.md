# MVC Migration — Large File Decomposition

**Started:** 2026-02-24
**Pattern:** Strict MVC per module — Model (data/types/logic), View (pure rendering), Controller (event handling/orchestration), plus Helpers/Lib extraction.

---

## Migration Status

### Wave 1 (Complete)

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

### Wave 2 (Phase 2 — files still oversized after Wave 1 + new large files)

| # | File | LOC | Status | Notes |
|---|---|---|---|---|
| 12 | `src/components/chat/MessageInput.tsx` | 863 | ✅ Done | Extracted useImageAttachments (121), InputBanners (103), InputToolbar (168) |
| 13 | `electron/services/pi-session-manager.ts` | 732 | ✅ Done | Extracted pi-session-config.ts (121 LOC) — session config building |
| 13b | `electron/services/pi-session-manager.ts` | 672 | ✅ Done | Phase 3: Extracted commit (106), listing (115), commands (137), memory (103) |
| 14 | `src/components/settings/sections/CompanionSettings.tsx` | 659 | ✅ Done | Extracted CompanionPairing (207), CompanionDevices (64), CompanionRemoteAccess (184), types (24) |
| 15 | `electron/services/subagent-manager.ts` | 648 | ✅ Done | Extracted subagent-session.ts (163 LOC) — session startup logic |
| 16 | `src/components/docs/DocsViewer.tsx` | 483 | ✅ Done | Extracted docs-markdown.tsx (328 LOC) — markdown rendering pipeline |
| 17 | `electron/services/prompt-library.ts` | 578 | ✅ Done | Extracted prompt-seeder.ts (83 LOC), prompt-helpers.ts (119 LOC) |
| 18 | `electron/services/sandboxed-tools.ts` | 480 | ✅ Done | Extracted sandbox-path-helpers (path validation, command analysis, diff generation) |
| 19 | `src/components/prompts/PromptFillDialog.tsx` | 464 | ✅ Done | Extracted FilePickerInput into its own file |

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

## Wave 2 — Detailed Split Plans

### 12. MessageInput.tsx Phase 2 (863 → target ~350 LOC)

**Problem:** Wave 1 only extracted ModelPicker (170 LOC) and a 17-line helpers file. The main component still has keyboard navigation (~150 LOC), image attachment logic (~80 LOC), 274-line JSX return with inline toolbar, banners, and attachment pills.

**After:**
```
src/components/chat/
  MessageInput.tsx               — Core: state, textarea, submit, layout (~350 LOC)
  useMessageInputKeyboard.ts     — Hook: handleKeyDown, history nav, slash/mention/escape dispatch (~150 LOC)
  useImageAttachments.ts         — Hook: saveImageToDisk, addImageFiles, drop/paste/file handlers (~80 LOC)
  InputToolbar.tsx               — Bottom bar: thinking toggle, model picker, send/steer/stop buttons (~100 LOC)
  InputBanners.tsx               — Attached file pills, memory command banner, queued messages indicator (~80 LOC)
  ModelPicker.tsx                — (existing, 170 LOC)
  message-input-helpers.ts       — (existing, 17 LOC)
```

**Extraction targets:**
- `useMessageInputKeyboard` — all of `handleKeyDown()`: mention menu nav, slash menu nav, history up/down, Enter/Alt+Enter/Cmd+Enter, Escape, Shift+Tab. Plus `isOnFirstLine()`, `isOnLastLine()`, `resetHistory()`.
- `useImageAttachments` — `saveImageToDisk()`, `addImageFiles()`, `handleDrop()`, `handlePaste()`, `handleFileChange()`, `handleFileClick()`, `removeImage()`. Returns `{ images, isDragging, addImageFiles, handleDrop, handlePaste, handleFileClick, handleFileChange, removeImage, fileInputRef }`.
- `InputToolbar` — thinking button, model selector button, ModelPicker popup, send/steer/stop/follow-up buttons. Receives callbacks as props.
- `InputBanners` — attached file pills with remove, memory command hint, queued steering/follow-up indicators.

### 13. pi-session-manager.ts Phase 2 (732 → target ~400 LOC)

**Problem:** Wave 1 extracted 3 pure helpers (113 LOC). The class still has event forwarding/mapping interleaved with session lifecycle, and session config building (extension loading, system prompt assembly, sandbox options) inline in `createSession()`.

**After:**
```
electron/services/
  pi-session-manager.ts          — Core class: create/continue/dispose, public API (~400 LOC)
  pi-session-events.ts           — Event handler: handleAgentEvent(), event-to-IPC mapping, sendToRenderer (~150 LOC)
  pi-session-config.ts           — buildSessionOptions(): extension loading, system prompt assembly, sandbox config (~100 LOC)
  pi-session-helpers.ts          — (existing, 113 LOC)
```

**Extraction targets:**
- `pi-session-events.ts` — `handleAgentEvent()` switch/dispatch, `sendToRenderer()` helper, event payload transforms, companion bridge forwarding. These are pure mapping functions that don't need access to the session lifecycle.
- `pi-session-config.ts` — `buildSessionOptions()`: loads enabled extensions, assembles system prompt parts (memory injection, project context, AGENTS.md), builds sandbox config, resolves skill paths. Called by `createSession()` / `continueSession()`.

### 14. CompanionSettings.tsx (659 → target ~200 LOC)

**Problem:** Created during Wave 1 SettingsPanel split. Now has 3 interfaces, 15+ useState declarations, 10 handler functions, and ~390 LOC of JSX covering server config, PIN pairing, QR code, device management, and remote tunnel access — all in one component.

**After:**
```
src/components/settings/sections/
  CompanionSettings.tsx          — Shell: server toggle, protocol/port, auto-start (~200 LOC)
  companion/
    CompanionPairing.tsx         — PIN display + countdown, host selector, QR code generation/display (~180 LOC)
    CompanionDevices.tsx         — Paired device list, last-seen, revoke buttons (~80 LOC)
    CompanionRemoteAccess.tsx    — Tailscale/Cloudflare enable/disable, status, activation URL (~150 LOC)
    companion-settings-types.ts  — CompanionStatus, PairedDevice, RemoteAvailability interfaces (~30 LOC)
```

**Extraction targets:**
- `CompanionPairing` — PIN generation + expiry countdown, host dropdown (LAN/tunnel addresses), QR code generation + display. State: `pin`, `pinExpiry`, `qrDataUrl`, `qrHost`, `qrPort`, `qrVisible`, `selectedHost`.
- `CompanionDevices` — device list rendering, last-seen-ago calculation, revoke handler. State: `devices`.
- `CompanionRemoteAccess` — Tailscale/Cloudflare provider selection, enable/disable handlers, status display, activation URL listener, remote availability check. State: `remoteError`, `activationUrl`, `remoteAvail`.
- `companion-settings-types.ts` — Move the 3 interfaces (`CompanionStatus`, `PairedDevice`, `RemoteAvailability`) shared across sub-components.

### 15. subagent-manager.ts Phase 2 (648 → target ~350 LOC)

**Problem:** Wave 1 extracted only a 47-line helpers file. The `startSubagentSession()` method (~160 LOC) builds a full SDK session from scratch (loads extensions, creates sandbox, assembles system prompt, subscribes to events, handles timeout) — essentially duplicating session config logic. Pool creation and file ownership tracking are also self-contained.

**After:**
```
electron/services/
  subagent-manager.ts            — Core class: spawn, pool lifecycle, dispose, getters (~350 LOC)
  subagent-session.ts            — startSubagentSession(): SDK session setup, extension loading, sandbox, event subscription, timeout (~200 LOC)
  subagent-helpers.ts            — (existing, 47 LOC — expand with file ownership helpers)
```

**Extraction targets:**
- `subagent-session.ts` — `startSubagentSession(sub, projectPath, sessionManager)`: loads project settings, creates SettingsManager, builds sandbox options with file ownership callback, creates SDK session with extensions/skills/system prompt, subscribes to events (turn_end for token counting, agent_end for result extraction), sets up timeout, returns when session completes. This is a standalone async function that receives a `SubagentInternal` record and returns the result text.
- Expand `subagent-helpers.ts` — move `collectAllModifiedFiles()` and file ownership map logic here.

### 16. DocsViewer.tsx (483 → target ~160 LOC)

**Problem:** The file contains two completely independent concerns: (1) docs navigation/loading (~160 LOC) and (2) a full markdown-to-React rendering pipeline (~320 LOC) with block parsing, inline parsing, and 6+ block-type renderers. The rendering pipeline is reusable and has zero dependency on the docs navigation.

**After:**
```
src/components/docs/
  DocsViewer.tsx                 — Navigation, loading, breadcrumbs, back button, link interception (~160 LOC)
  docs-markdown.tsx              — MarkdownContent, DocBlock, InlineContent, renderInlineNodes, parseDocBlocks (~320 LOC)
```

**Extraction targets:**
- `docs-markdown.tsx` — everything below the `DocsViewer` component:
  - `MarkdownContent({ content, currentPage, onClick })` — parses content into blocks, renders block list
  - `parseDocBlocks(text)` — line-by-line markdown parser (~100 LOC): headings, code fences, tables, lists, blockquotes, paragraphs
  - `DocBlock({ block, currentPage })` — renders a single block by type (~100 LOC): heading with anchor, code with copy button, table, list, blockquote, paragraph
  - `InlineContent({ text })` + `renderInlineNodes(text)` — regex-based inline parser (~90 LOC): bold, italic, code, links (internal doc links vs external), images

### 17. prompt-library.ts Phase 2 (578 → target ~350 LOC)

**Problem:** Wave 1 extracted `prompt-parser.ts` (152 LOC) for parsing logic. The class still has `seedBuiltins()` (~80 LOC) — a completely self-contained async function that copies bundled prompts with version/hash checking — plus `computeConflicts()`, `validateCommand()`, and `fillTemplate()` which are pure logic that doesn't need class state.

**After:**
```
electron/services/
  prompt-library.ts              — Core class: lifecycle, loading, queries, CRUD, events (~350 LOC)
  prompt-seeder.ts               — seedBuiltins(bundledDir, globalDir): version check, hash compare, copy (~80 LOC)
  prompt-parser.ts               — (existing, 152 LOC)
  prompt-helpers.ts              — (new, expand) computeConflicts(), validateCommand(), fillTemplate() (~80 LOC)
```

**Extraction targets:**
- `prompt-seeder.ts` — `seedBuiltins(bundledDir: string, globalDir: string)`: reads bundled `.md` files, checks if dest exists, compares version numbers, verifies content hash to detect user edits, copies new/updated prompts. Zero class dependency — takes two directory paths, returns void.
- `prompt-helpers.ts` — pure functions extracted from the class:
  - `computeConflicts(prompts, commandRegistry)` — sorts by priority (project > user > builtin), detects system command and duplicate prompt conflicts, mutates `commandConflict` field.
  - `validateCommand(command, prompts, excludeId?)` — checks regex, system commands, duplicate commands. Returns `{ valid, error? }`.
  - `fillTemplate(content, values)` — replaces `{{var}}` placeholders, strips unfilled optionals.

### 18. sandboxed-tools.ts (480 → target ~290 LOC)

**Problem:** Pure path validation and command-path extraction functions (~170 LOC) are mixed into the same file as `createSandboxedTools()`. These are stateless utilities with no dependency on sandbox state.

**After:**
```
electron/services/
  sandboxed-tools.ts             — createSandboxedTools(), resolveBashApproval(), SandboxOptions (~290 LOC)
  sandbox-path-helpers.ts        — Path validation & command extraction helpers (~190 LOC)
```

**Extraction targets:**
- `sandbox-path-helpers.ts`:
  - `isWithinProject(projectRoot, filePath, allowedPaths)` — resolves and checks project jail
  - `isSystemPath(absPath)` — checks against system directory blocklist
  - `extractEnvExpansions(command)` — finds `$HOME`, `$USER` etc. in commands
  - `extractAbsolutePaths(command)` — regex extraction of absolute paths from shell commands
  - `extractRelativeEscapes(command)` — finds `../` escape patterns
  - `extractPathsFromCommand(command)` — combined path extraction pipeline
  - `findEscapingPaths(command, projectRoot, allowedPaths)` — top-level check for jail-escaping paths
  - `generateUnifiedDiff(oldContent, newContent, contextLines)` — pure diff generation

### 19. PromptFillDialog.tsx (464 → target ~290 LOC)

**Problem:** `FilePickerInput` (~160 LOC) is a fully self-contained component with its own state (query, results, menu visibility, keyboard nav, debounced search) inlined at the bottom of the file. Also `AutoGrowTextarea` (~50 LOC) is a standalone forwardRef component.

**After:**
```
src/components/prompts/
  PromptFillDialog.tsx           — Main dialog: variable form, preview, insert (~290 LOC)
  FilePickerInput.tsx            — File search input with autocomplete dropdown (~160 LOC)
```

**Extraction targets:**
- `FilePickerInput.tsx` — self-contained forwardRef component: text input with debounced file search via IPC, dropdown menu with keyboard navigation (ArrowUp/Down, Enter, Escape), selected file display, loading state. Imports `FileMention` type. Zero dependency on PromptFillDialog state.
- `AutoGrowTextarea` stays in PromptFillDialog (only ~50 LOC, tightly coupled to the form).

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

### 12. MessageInput.tsx Phase 2 ✅ (863 → 558 LOC)
- `useImageAttachments.ts` (121 LOC) — hook for image drag/drop/paste/file-picker, saves to disk via IPC
- `InputBanners.tsx` (103 LOC) — attached file pills, memory command banner, queued messages indicator
- `InputToolbar.tsx` (168 LOC) — bottom bar: thinking toggle, model picker, send/steer/stop/follow-up buttons

### 13. pi-session-manager.ts Phase 2 ✅ (732 → 672 LOC)
- `pi-session-config.ts` (121 LOC) — `buildSessionConfig()`: sandbox options, extension/skill loading, memory/task context, resource loader, custom tools

### 13b. pi-session-manager.ts Phase 3 ✅ (672 → 349 LOC)
- `pi-session-commit.ts` (106 LOC) — `generateCommitMessage()`: model selection, prompt building, `completeSimple()` call
- `pi-session-listing.ts` (115 LOC) — `listSessions()`, `listAllSessions()`, `deleteSession()`: session persistence queries
- `pi-session-commands.ts` (137 LOC) — `getSlashCommands()`, `handlePossibleTaskCommand()`, `handlePossibleMemoryCommand()`: command routing/aggregation
- `pi-session-memory.ts` (103 LOC) — `extractMemoriesInBackground()`: background cheap-model call for memory extraction

### 14. CompanionSettings.tsx ✅ (659 → 200 LOC)
- `companion/CompanionPairing.tsx` (207 LOC) — PIN display + countdown, host selector, QR code generation/display
- `companion/CompanionDevices.tsx` (64 LOC) — paired device list, last-seen formatting, revoke buttons
- `companion/CompanionRemoteAccess.tsx` (184 LOC) — Tailscale/Cloudflare enable/disable, status, activation URL
- `companion/companion-settings-types.ts` (24 LOC) — `CompanionStatus`, `PairedDevice`, `RemoteAvailability` interfaces

### 15. subagent-manager.ts Phase 2 ✅ (648 → 530 LOC)
- `subagent-session.ts` (163 LOC) — `startSubagentSession()`: SDK session setup, extension loading, sandbox, event subscription, timeout

### 16. DocsViewer.tsx ✅ (483 → 157 LOC)
- `docs-markdown.tsx` (328 LOC) — `MarkdownContent`, `parseDocBlocks`, `DocBlock`, `InlineContent`, `renderInlineNodes`

### 17. prompt-library.ts Phase 2 ✅ (578 → 451 LOC)
- `prompt-seeder.ts` (83 LOC) — `seedBuiltins()`: version check, hash compare, copy bundled prompts
- `prompt-helpers.ts` (119 LOC) — `computeConflicts()`, `validateCommand()`, `fillTemplate()` pure functions

### 18. sandboxed-tools.ts ✅ (480 → 277 LOC)
- `sandbox-path-helpers.ts` (221 LOC) — `generateUnifiedDiff()`, `isWithinProject()`, `isSystemPath()`, `extractEnvExpansions()`, `extractAbsolutePaths()`, `extractRelativeEscapes()`, `extractPathsFromCommand()`, `findEscapingPaths()`

### 19. PromptFillDialog.tsx ✅ (464 → 287 LOC)
- `FilePickerInput.tsx` (184 LOC) — self-contained file search input with autocomplete dropdown, keyboard nav, multi-file pill display

