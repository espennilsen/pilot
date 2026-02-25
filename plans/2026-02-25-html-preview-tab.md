---
task: "Add web tab for viewing HTML files and URLs, openable by users and AI agents"
status: in-progress
created: 2026-02-25
approach: "iframe with custom protocol for local files"
---

## Understanding

Add a new **web tab type** to Pilot that can render HTML content — both local HTML files from the project and remote URLs. Users should be able to open web tabs from the UI (e.g., from the file tree or context menu), and AI agents should be able to open them programmatically via a new `pilot_web` tool.

**Assumptions:**
- Web tabs are project-bound (like file tabs), since they typically preview project assets or related URLs
- Local HTML files need access to relative assets (CSS, JS, images) in the same directory — simple `srcdoc` won't work
- Security: web tabs should be sandboxed (no access to Electron APIs, Node.js, or the host app)
- Web tabs for the same URL/file should be deduplicated (like file tabs)
- The `pilot_open_url` tool currently opens URLs in the external browser — the new `pilot_web` tool opens them *inside* Pilot

**Decisions:**
- `pilot_open_url` remains as-is (external browser). `pilot_web` is the new in-app option — both tools serve different purposes.
- Web tabs are persisted across restarts in workspace.json — they're lightweight to restore.

## Approach

Add a `'web'` tab type that renders an `<iframe>` in the React component tree. Local files are served via a new `pilot-html://` custom protocol registered in the main process.

**How it works:**
- Register `pilot-html://` protocol scheme in main process (like existing `pilot-attachment://`)
- Protocol handler resolves local file paths, enforces project-jail security, and serves files with correct MIME types
- New `WebView` React component renders a sandboxed `<iframe>`:
  - **Local files:** iframe `src` is a `pilot-html://` URL (custom protocol serves the file)
  - **Remote URLs:** iframe `src` is the `https://` URL directly (no proxy)
- Navigation bar at top with URL display, refresh, and "open in browser" button
- New `addWebTab()` method on tab store with deduplication by URL/path
- Must ensure iframe navigation is not intercepted by any `will-navigate` / `setWindowOpenHandler` on the main window (currently none exist, but guard against future additions)

**Why iframe over WebContentsView:** Integrates naturally with the React component tree and existing tab architecture. No complex bounds-syncing between native views and DOM. The `sandbox` attribute provides security isolation. The iframe limitations (X-Frame-Options blocking on some external sites) are acceptable since the primary use case is viewing project HTML files and local dev servers.

## Task Breakdown

### Phase 1: Protocol & IPC Setup

- [ ] **1.1** Add `pilot-html://` scheme to `protocol.registerSchemesAsPrivileged()` in `electron/main/index.ts`
- [ ] **1.2** Add `protocol.handle('pilot-html', ...)` handler that:
  - Parses URL format: `pilot-html:///<projectPath>/<relativePath>`
  - Resolves against project root and validates path is within project (security jail)
  - Reads file from disk and returns with correct MIME type
  - Returns 404 for files outside project or non-existent files
- [ ] **1.3** Add IPC constants to `shared/ipc.ts`:
  - `WEB_TAB_OPEN: 'web-tab:open'` (main → renderer push)
- [ ] **1.4** Add types to `shared/types.ts`:
  - `WebTabOpenPayload { url: string; title?: string; projectPath: string | null }`

**Checkpoint:** Protocol handler serves a test HTML file via `pilot-html:///path/to/project/index.html` in Electron DevTools console.

### Phase 2: Tab System Integration

- [ ] **2.1** Extend `TabState.type` union to include `'web'` in `src/stores/tab-store.ts`
- [ ] **2.2** Add `addWebTab(url: string, projectPath: string | null, title?: string)` to tab store:
  - Deduplicates by URL (reuses existing tab if same URL is already open)
  - Sets `filePath` to the URL (local `pilot-html://...` or remote `https://...`)
  - Title from param or extracted from URL hostname/filename
- [ ] **2.3** Extend `SavedTabState.type` in `shared/types.ts` to include `'web'` for workspace persistence
- [ ] **2.4** Update workspace restore logic in `useWorkspacePersistence.ts` to handle `'web'` tabs

**Checkpoint:** Can programmatically call `addWebTab()` from DevTools console and see a new tab appear in the tab bar.

### Phase 3: Web Tab Component

- [ ] **3.1** Create `src/components/web/WebView.tsx`:
  - Renders a sandboxed `<iframe>` with the URL from the active web tab's `filePath`
  - iframe sandbox attributes: `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"` (no `allow-top-navigation`)
  - Full-height layout matching other tab content areas
- [ ] **3.2** Add a navigation/toolbar bar above the iframe:
  - URL display (read-only or editable for manual navigation)
  - Refresh button
  - "Open in external browser" button (calls `window.api.openExternal()`)
  - Loading indicator
- [ ] **3.3** Add `case 'web': return <WebView />;` to `MainLayout.tsx` switch
- [ ] **3.4** Add web tab icon in `Tab.tsx` (`Globe` from lucide-react)

**Checkpoint:** Opening a web tab shows an iframe loading the URL. Local HTML files render correctly with relative asset references.

### Phase 4: Agent Tool

- [ ] **4.1** Add `pilot_web` tool definition in `electron/services/editor-tools.ts`:
  - Parameters: `{ url: string, title?: string }` — accepts both local file paths and URLs
  - For local paths: resolve against projectPath and convert to `pilot-html://` URL
  - For remote URLs: pass through as-is
  - Broadcasts `IPC.WEB_TAB_OPEN` to renderer
  - Returns confirmation string to the agent
- [ ] **4.2** Create `useWebTabEvents.ts` hook in `src/hooks/`:
  - Listens for `IPC.WEB_TAB_OPEN`
  - Calls `useTabStore.getState().addWebTab()` with the payload
- [ ] **4.3** Register `useWebTabEvents()` in `src/app.tsx`

**Checkpoint:** Agent can call `pilot_web` tool and a web tab opens in the UI showing the content.

### Phase 5: User-Facing Entry Points

- [ ] **5.1** Add "Open in Web Tab" option to file tree context menu for `.html` files in the context panel
- [ ] **5.2** Add an IPC handler `WEB_TAB_OPEN_FILE` (renderer → main invoke) for the UI to request opening a web tab:
  - Converts file path to `pilot-html://` URL
  - Or: handle this entirely in the renderer by constructing the URL client-side
- [ ] **5.3** If a dev command detects a server URL (existing `DEV_SERVER_URL` event), offer an "Open in Web Tab" action
- [ ] **5.4** Add right-click context menu on links in chat messages (`src/lib/markdown.tsx`):
  - Default click behavior unchanged — still opens in external browser via `openExternal`
  - Right-click menu options: "Open in Web Tab" | "Copy Link"

**Checkpoint:** User can right-click an HTML file → "Open in Web Tab" and see it rendered in-app. Right-clicking a chat link offers "Open in Web Tab" as an alternative to the external browser.

### Phase 6: Polish & Verification

- [ ] **6.1** Ensure web tabs show correct icon and title in the tab bar
- [ ] **6.2** Handle error states (404, blocked URL, network errors) with a friendly error page in the iframe
- [ ] **6.3** Verify workspace persistence — web tabs survive app restart
- [ ] **6.4** Test cross-platform: verify `pilot-html://` protocol works on Windows, macOS, Linux (path separators)
- [ ] **6.5** Verify companion integration — `WEB_TAB_OPEN` events are forwarded to companion clients (automatic via `broadcastToRenderer`)

**Checkpoint:** Feature is complete, polished, and works across platforms.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| X-Frame-Options / CSP blocks iframe for some external URLs | Medium | Low | Show clear error with "Open in Browser" fallback. Primary use case is local files. |
| Path traversal in custom protocol handler | Low | High | Validate resolved path is within project root using `isWithinDir()` from `electron/utils/paths.ts`. Return 403. |
| Windows path separators in protocol URL | Medium | Medium | Normalize with `normalizePath()` from `electron/utils/paths.ts`. URL-encode special chars. |
| iframe sandbox too restrictive for some content | Low | Low | Start permissive (`allow-scripts allow-same-origin`), tighten if needed. "Open in Browser" as escape hatch. |
| Large files / complex sites slow down the app | Low | Medium | iframe runs in a separate renderer process automatically. Main app stays responsive. |

## Affected Files

**Create:**
- `src/components/web/WebView.tsx` — Web tab component with iframe and navigation bar
- `src/hooks/useWebTabEvents.ts` — Hook to handle agent-triggered web tab opening

**Modify:**
- `shared/ipc.ts` — Add `WEB_TAB_OPEN` channel constant
- `shared/types.ts` — Add `WebTabOpenPayload` type, extend `SavedTabState.type`
- `electron/main/index.ts` — Register `pilot-html://` protocol scheme and handler
- `electron/services/editor-tools.ts` — Add `pilot_web` tool definition
- `src/stores/tab-store.ts` — Add `'web'` to type union, add `addWebTab()` method
- `src/components/layout/MainLayout.tsx` — Add `case 'web'` to content switch
- `src/components/tabs/Tab.tsx` — Add web tab icon
- `src/app.tsx` — Register `useWebTabEvents()` hook
- `src/hooks/useWorkspacePersistence.ts` — Handle `'web'` tab type in restore
- File tree context menu component — Add "Open in Web Tab" option for HTML files
