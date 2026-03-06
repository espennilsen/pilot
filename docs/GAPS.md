# Feature Gap Analysis

Competitive comparison of Pilot against major AI desktop/web apps: **ChatGPT**, **Claude**, **Perplexity**, **Gemini**, **Manus**, **Cursor**, and **Windsurf**.

Last updated: 2026-03-02

---

## Current Strengths

Features where Pilot is **on par or ahead** of competitors.

| Feature | Status | Notes |
|---|---|---|
| Diff staging / sandbox | ✅ Ahead | Review-before-apply with accept/reject per diff. No competitor has this in a chat UI. |
| Subagents | ✅ Ahead | Parallel task execution with file scope isolation. Only CLI agents (Claude Code, Codex) offer similar. |
| Git integration | ✅ Ahead | Branch, commit, blame, stash, diff — deeper than any chat app. |
| Terminal / dev commands | ✅ On par | PTY + streaming output. Matches Cursor/Windsurf. |
| Desktop automation | ✅ Unique | Screenshot, mouse/keyboard, browser automation in virtual display. |
| Memory system | ✅ On par | Two-tier (global + project) Markdown memory with system prompt injection. Matches ChatGPT memory. |
| Image upload | ✅ On par | Drag-drop, paste, file picker. Images displayed in chat. |
| Prompt templates | ✅ On par | Slash commands, prompt library with variable substitution, built-in + user-defined. |
| Extended thinking | ✅ On par | Collapsible thinking blocks, streamed incrementally. Matches Claude web. |
| Dark mode / themes | ✅ On par | Light/dark/system with OS sync. |
| Session management | ✅ Ahead | Tabs, pin, archive, closed-tab recovery, workspace persistence. |
| File mentions (@file) | ✅ On par | Autocomplete in chat input. Matches Cursor. |
| Companion mode | ✅ Unique | Mobile/web companion client over WebSocket. |

---

## Missing Features

### P0 — Table Stakes (High impact, low effort)

#### Chat Export

**Who has it:** ChatGPT, Claude, Gemini, Perplexity — all of them.

Every major competitor lets users export conversations. Pilot has none.

**What's needed:**
- Export conversation to Markdown
- Export conversation to JSON
- Copy entire conversation to clipboard
- Optional: PDF export

**Implementation path:** Session data already lives in `.jsonl` files. Add a formatter that converts session messages to Markdown/JSON. Add an IPC channel (`SESSION_EXPORT`) and a UI trigger (menu item or button in session header). Low effort — mostly formatting logic.

**Files to touch:**
- `shared/ipc.ts` — add `SESSION_EXPORT` channel
- `electron/ipc/session.ts` — handle export
- `src/components/chat/` — add export button/menu

---

#### Message-Level Actions

**Who has it:** ChatGPT (copy, regenerate, rate), Claude (copy, retry), Gemini (copy, rate, modify).

Pilot messages have no action buttons. Users can't copy, regenerate, or interact with individual messages.

**What's needed:**
- Copy message content to clipboard
- Regenerate response (resend with same input)
- Edit & resend a user message
- Optional: thumbs up/down rating for feedback

**Implementation path:** Add a hover action bar to `MessageBubble`. Copy is trivial. Regenerate means truncating the message list and resending — needs a `resendFrom(messageIndex)` action in the chat store.

**Files to touch:**
- `src/components/chat/MessageBubble.tsx` — add action bar
- `src/stores/chat-store.ts` — add `regenerate`, `editAndResend` actions
- `electron/ipc/agent.ts` — handle regenerate

---

### P1 — High Impact (Core competitive features)

#### Web Search + Citations

**Who has it:** Perplexity (core product), ChatGPT (browse with Bing), Claude (web search tool), Gemini (Google Search).

Pilot has zero web search capability. This is increasingly expected in AI assistants.

**What's needed:**
- Search the web from within a conversation
- Inline citations with source URLs in responses
- "Search the web" toggle or automatic trigger
- Source preview on hover/click

**Implementation path:** The Pi SDK supports extensions. A Brave Search or Tavily extension can provide the search tool. The UI needs:
1. A citation renderer in message bubbles (numbered references, clickable URLs)
2. A source panel or expandable section showing search results
3. Optional toggle to enable/disable web search per message

This is the feature Perplexity built their entire product around. High differentiation potential.

**Files to touch:**
- Pi SDK extension (new) — search tool integration
- `src/components/chat/MessageBubble.tsx` — citation rendering
- `src/components/chat/` — source panel component
- `shared/types.ts` — citation/source types

---

#### AI Follow-Up Suggestions

**Who has it:** ChatGPT (suggested replies), Gemini (follow-up chips), Perplexity (related questions).

After each response, competitors show 2–3 clickable suggestion chips. Pilot has slash commands but no contextual AI suggestions.

**What's needed:**
- After each assistant response, generate 2–3 contextual follow-up suggestions
- Render as clickable chips below the message
- Clicking a chip sends it as a new user message
- Optional: context-aware (e.g., "Run the tests", "Explain that function", "Show me the diff")

**Implementation path:** After the agent response completes, make a lightweight follow-up call (or parse the response) to generate suggestions. Render as buttons below the last message. Low-medium effort.

**Files to touch:**
- `src/stores/chat-store.ts` — suggestion state
- `src/components/chat/` — suggestion chips component
- `electron/services/pi-session-manager.ts` — generate suggestions after response

---

#### Artifacts / Canvas / Live Preview

**Who has it:** Claude (artifacts pane — HTML, React, SVG, Mermaid), ChatGPT (Canvas — co-edit code/docs).

Pilot has basic HTML preview via `pilot_web` tool, but no true artifact system.

**What's needed:**
- Dedicated artifact pane (side panel) for rendered output
- Live HTML/CSS/JS execution in sandboxed iframe
- React/SVG/Mermaid rendering
- "Open in artifact" action from code blocks
- Co-editing: AI and user can edit the same document side-by-side
- Version history for artifacts

**Implementation path:** Extend the existing web preview panel into a proper artifact renderer. Key challenges:
1. Sandboxed iframe with CSP for safe execution
2. Detecting artifact-worthy content in responses (code blocks with HTML/React/SVG)
3. Two-way sync between code and preview
4. Persisting artifacts across messages

This is Claude's most distinctive feature. Medium-high effort but very high impact.

**Files to touch:**
- `src/components/` — new `artifacts/` domain folder
- `src/stores/` — new `artifact-store.ts`
- `shared/types.ts` — artifact types
- `shared/ipc.ts` — artifact channels
- `electron/ipc/` — new `artifacts.ts`
- `src/components/chat/MessageBubble.tsx` — "Open as artifact" action on code blocks

---

### P2 — Important (Power user features, medium impact)

#### Custom Instructions UI

**Who has it:** ChatGPT (custom instructions), Claude (project instructions), Gemini (gems).

Pilot's memory system serves a similar purpose, but there's no dedicated UI for editing system-level instructions.

**What's needed:**
- Settings panel for "always do X" global instructions
- Per-project instruction editor (beyond `.pilot/` config files)
- Toggle instructions on/off without deleting them

**Implementation path:** Surface the existing memory system with a better UI. Add a "Custom Instructions" section in settings that writes to global/project memory. Low effort since the backend (memory manager) already exists.

**Files to touch:**
- `src/components/settings/` — custom instructions panel
- `electron/services/memory-manager.ts` — minor API additions
- `src/stores/memory-store.ts` — instruction-specific state

---

#### Conversation Branching / Forking

**Who has it:** ChatGPT (edit message → branch), Claude (retry → alternate response).

Pilot conversations are linear. Users can't branch at a message to explore alternatives.

**What's needed:**
- Edit a previous user message and fork the conversation from that point
- Retry an assistant response to get an alternative
- Navigate between branches (tree view or arrow navigation)
- Visual indicator showing branch points

**Implementation path:** The session model would need tree-based message storage instead of a linear array. Each message gets a parent pointer. The UI shows the "active path" with navigation arrows at branch points. This is a non-trivial architecture change to the chat store and session persistence.

**Files to touch:**
- `shared/types.ts` — message tree structure
- `src/stores/chat-store.ts` — tree-based message management
- `src/components/chat/` — branch navigation UI
- `electron/services/pi-session-manager.ts` — tree-aware session handling
- Session `.jsonl` format changes

---

#### Message Bookmarks / Favorites

**Who has it:** ChatGPT (star messages), Notion AI (save blocks).

Pilot supports session-level pinning but not message-level bookmarking.

**What's needed:**
- Star/bookmark individual messages
- Bookmarks panel in sidebar
- Quick-jump to bookmarked messages
- Optional: tag/categorise bookmarks

**Implementation path:** Add a `bookmarked` flag to message metadata. Store bookmarks in session data or a separate index. Add a sidebar section listing bookmarks with click-to-scroll. Low effort.

**Files to touch:**
- `shared/types.ts` — bookmark metadata on messages
- `src/stores/chat-store.ts` — bookmark actions
- `src/components/sidebar/` — bookmarks panel
- `src/components/chat/MessageBubble.tsx` — bookmark button

---

### P3 — Nice to Have (Lower priority or niche)

#### Voice Input / Output

**Who has it:** ChatGPT (Advanced Voice Mode), Claude (voice input), Gemini (voice).

Pilot has zero voice implementation. For a coding-focused tool this is lower priority, but it's increasingly expected.

**What's needed:**
- Microphone input → speech-to-text (Whisper API or Web Speech API)
- Text-to-speech output for responses (ElevenLabs, OpenAI TTS)
- Voice activity detection
- Push-to-talk or voice activation mode

**Implementation path:** High effort. Requires audio capture in Electron, streaming transcription, and TTS playback. Web Speech API works for basic input; production quality needs Whisper. Consider as a later-phase feature.

---

#### Multi-Model Comparison

**Who has it:** Poe (side-by-side), TypingMind (compare mode), Chatbot Arena.

Pilot can switch models but can't compare responses side-by-side.

**What's needed:**
- "Compare" mode: send same prompt to 2–3 models simultaneously
- Side-by-side response display
- Pick winner / merge responses

**Implementation path:** Medium effort. Requires parallel session management and a split-pane UI. The tab system could support comparison tabs.

---

#### MCP (Model Context Protocol) Server Support

**Who has it:** Claude Desktop, Cursor, Windsurf, Cline.

Growing ecosystem of MCP servers for database access, API integration, and external services.

**What's needed:**
- MCP client in the main process
- Configuration UI for adding/removing MCP servers
- Tool discovery from MCP servers
- MCP tool execution within agent sessions

**Implementation path:** The Pi SDK uses its own extension system. MCP compatibility would either mean SDK-level support or an adapter extension that bridges MCP servers into Pi's tool system. Medium-high effort depending on SDK support.

---

## Summary Matrix

| Feature | Impact | Effort | Priority | Status |
|---|---|---|---|---|
| Chat export (MD/JSON) | High | Low | **P0** | ❌ Missing |
| Message actions (copy, regenerate) | High | Low | **P0** | ❌ Missing |
| Web search + citations | Very High | Medium | **P1** | ❌ Missing |
| AI follow-up suggestions | High | Low-Medium | **P1** | ❌ Missing |
| Artifacts / live preview | Very High | Medium-High | **P1** | ⚠️ Basic HTML preview only |
| Custom instructions UI | Medium | Low | **P2** | ⚠️ Memory system workaround |
| Conversation branching | High | High | **P2** | ❌ Missing |
| Message bookmarks | Medium | Low | **P2** | ❌ Missing |
| Voice input/output | Medium | High | **P3** | ❌ Missing |
| Multi-model comparison | Medium | Medium | **P3** | ❌ Missing |
| MCP server support | Growing | Medium-High | **P3** | ❌ Missing |

---

## Recommended Implementation Order

**Phase 1 — Quick wins (1–2 weeks)**
1. Chat export (Markdown + JSON)
2. Message actions (copy, regenerate, edit & resend)
3. Message bookmarks
4. Custom instructions UI (surface existing memory system)

**Phase 2 — Competitive parity (2–4 weeks)**
5. Web search + citations (via Pi extension)
6. AI follow-up suggestions
7. Artifacts / live preview pane

**Phase 3 — Differentiation (4–8 weeks)**
8. Conversation branching
9. MCP server support
10. Voice input/output
11. Multi-model comparison
