# Sessions

Sessions are the core of Pilot's workflow. Each session is an independent conversation with the AI agent, preserving full context, tool execution history, and project associations.

---

## What is a Session?

> **Config directory** is platform-dependent: `~/.config/pilot/` (macOS/Linux), `%APPDATA%\pilot\` (Windows). Documentation uses `<PILOT_DIR>` as shorthand.

A **session** is:
- A persistent chat conversation with the AI agent
- Associated with zero or one project
- Stored as a `.jsonl` file in `<PILOT_DIR>/sessions/`
- Resumable at any time — full context is preserved
- Isolated from other sessions (no cross-session context leakage)

Sessions are powered by the **Pi SDK**, which handles streaming, tool execution, and state management.

---

## Creating Sessions

### New Session

Create a new session in several ways:

1. **Keyboard**: `Cmd+N`
2. **Menu**: `File` → `New Session`
3. **Command Palette**: `Cmd+K` → "New Session"
4. **Tab Bar**: Click the `+` button

When you create a new session:
- A new tab opens in the tab bar
- You're prompted to assign a project (optional)
- A unique session ID is generated
- The session is saved to `<PILOT_DIR>/sessions/<session-id>.jsonl`

### Naming Sessions

Sessions are automatically titled based on the conversation:
- The first user message becomes the initial title
- The agent may suggest a better title as the conversation progresses
- Titles appear in the tab header and the Sessions sidebar pane

---

## Session Lifecycle

### Active Sessions

The current tab shows the active session:
- Chat history is displayed in the message pane
- New messages are sent to the active session's agent
- Tool executions are scoped to the session's project (if assigned)

### Continuing Sessions

Resume a previous session:

1. **Sessions Sidebar**  
   Click the Sessions icon in the activity bar → Select a session from the list

2. **Command Palette**  
   `Cmd+K` → "Continue Session..." → Select from recent sessions

3. **Reopen Closed Tab**  
   `Cmd+Shift+T` reopens the last closed tab (preserves session state)

When you continue a session:
- Full chat history is restored
- Project association is restored
- Memory context is re-injected
- Previous tool executions are visible (but not re-applied)

### Closing Sessions

Close the active session:
- **Keyboard**: `Cmd+W`
- **Tab Bar**: Click the `×` on the tab
- **Command Palette**: `Cmd+K` → "Close Tab"

Closed sessions are:
- Removed from the tab bar
- Added to the closed-tab stack (reopen with `Cmd+Shift+T`)
- Still accessible from the Sessions sidebar
- Fully preserved on disk

---

## Managing Sessions

Pilot provides several ways to organize and manage your sessions in the Sessions sidebar.

### Pinning Sessions

Pin important sessions to keep them at the top of the Sessions list:

1. **Hover over a session** in the Sessions sidebar  
   A pin icon appears on the right

2. **Click the pin icon** to pin the session  
   Pinned sessions move to the top of the list and show a filled pin icon

3. **Click the pin icon again** to unpin

**Pin state persists** — pinned sessions remain at the top across app restarts.

Use pinning for:
- Active projects you're working on daily
- Reference conversations you frequently consult
- Sessions you want to keep easily accessible

### Archiving Sessions

Archive completed or paused sessions to keep your Sessions list clean:

1. **Hover over a session** in the Sessions sidebar  
   An archive icon appears alongside the pin icon

2. **Click the archive icon** to archive the session  
   The session is removed from the default list view

3. **Right-click a session** → "Archive" (also available in context menu)

**Viewing Archived Sessions**:
- A **"Show archived"** toggle appears below the search bar when you have archived sessions
- Click to reveal all archived sessions (they appear with a dimmed style)
- Click **"Hide archived"** to hide them again

**Unarchiving**:
- When viewing archived sessions, hover over one and click the **ArchiveRestore icon**
- Or right-click → "Unarchive"
- The session returns to the main list

**Archive state persists** — archived sessions stay hidden across app restarts.

Use archiving for:
- Completed features or resolved bugs
- Experiments or research that didn't pan out
- Old sessions you want to keep but don't need to see daily

### Deleting Sessions

Permanently delete sessions you no longer need:

1. **Right-click a session** in the Sessions sidebar  
   Select "Delete Session" (marked with a trash icon in red/danger style)

2. **Confirm deletion**  
   A native dialog appears: *"Delete session 'title'? This cannot be undone."*

3. **Confirm** to permanently delete the session

**What gets deleted**:
- The `.jsonl` session file is removed from disk
- All session metadata is cleaned up
- The session cannot be recovered

**Warning**: Deletion is permanent and cannot be undone. Consider archiving instead if you might need the session later.

---

## Multi-Tab Workflow

Pilot supports multiple simultaneous sessions in tabs.

### Working with Multiple Tabs

**Creating Tabs**:
- `Cmd+T` — New tab (creates a new session)
- `Cmd+N` — New session (same as new tab)

**Navigating Tabs**:
- `Cmd+1` through `Cmd+9` — Jump to tab 1-9
- `Cmd+Shift+[` — Previous tab
- `Cmd+Shift+]` — Next tab
- Click a tab in the tab bar

**Closing Tabs**:
- `Cmd+W` — Close active tab
- Click `×` on a tab

**Reopening Tabs**:
- `Cmd+Shift+T` — Reopen last closed tab (can be repeated to reopen multiple tabs)

### Tab Grouping

Tabs are visually grouped by project:

```
┌─────────────────────────────────────────┐
│ [Pilot] [Pilot] [MyApp] [MyApp] [General]│
│   └─┬─┘       └──┬──┘                   │
│   Same project  Same project   No project│
└─────────────────────────────────────────┘
```

- Tabs with the same project are grouped together
- Project name appears in the tab header
- Tabs without a project are shown individually

This makes it easy to:
- Work on multiple features in parallel
- Switch between projects quickly
- See at a glance which sessions belong to which project

---

## Project Assignment

### Assigning a Project to a Session

Sessions can be associated with a project folder:

**At Creation**:
- When you create a new session, you're prompted to select a project
- Press `Escape` to create a session without a project

**After Creation**:
- Use the command palette: `Cmd+K` → "Set Project for Session"
- Select a project from the file picker
- The tab updates to show the new project name

### Project Context

When a session is assigned to a project:

1. **Agent Tools Are Scoped**  
   - File operations (`read`, `write`, `edit`) are restricted to the project directory
   - Bash commands execute in the project root
   - File paths are resolved relative to the project

2. **Project Memory Is Loaded**  
   - [Memory entries](./memory.md) from `.pilot/MEMORY.md` are injected into the agent prompt
   - Memory provides context about the project, conventions, and history

3. **Tasks Are Available**  
   - The agent can query, create, and update [tasks](./tasks.md) from `.pilot/tasks.jsonl`
   - Use slash commands like `/tasks` to show the task list

4. **Git Integration**  
   - The [Context Panel](./context-panel.md#git-tab) shows git status, branches, and history
   - The agent can see uncommitted changes and suggest commits

### Sessions Without Projects

Sessions can be created without a project assignment:
- Useful for general questions, research, or testing
- Agent tools are restricted (no file operations)
- No project-specific memory is loaded
- Tasks are not available

---

## Session Storage

### Where Sessions Are Stored

Sessions are saved in the Pi SDK's session directory:
```
<PILOT_DIR>/sessions/<session-id>.jsonl
```

Each session file is a **JSON Lines** file where:
- Each line is a JSON object representing a turn (user message, agent response, tool execution)
- The file grows as the conversation continues
- Full history is preserved indefinitely

### Session Metadata

Session metadata is stored separately:
- Session title
- Created/updated timestamps
- Project association
- Token counts
- Model used

### Deleting Sessions

Sessions can be permanently deleted via the Sessions sidebar (see [Managing Sessions](#managing-sessions) above for the full workflow).

When a session is deleted:
- The `.jsonl` file is removed from `<PILOT_DIR>/sessions/`
- All session metadata is cleaned up
- A confirmation dialog protects against accidental deletion

**Manual Deletion**:  
You can also manually remove `.jsonl` files from `<PILOT_DIR>/sessions/` if needed.

**Warning**: Deleted sessions cannot be recovered. Consider archiving instead of deleting if you might need the session in the future.

---

## Session Context

### What Gets Included in Session Context

Every agent message includes:

1. **System Prompt**  
   - Base instructions for the AI agent
   - Tool definitions and usage guidelines
   - Project-specific context (if assigned)

2. **Memory Injection**  
   - [Global memory](./memory.md#global-memory) from `<PILOT_DIR>/MEMORY.md`
   - [Project memory](./memory.md#project-memory) from `.pilot/MEMORY.md`

3. **Chat History**  
   - All previous messages in the session
   - Tool execution results
   - User feedback (accept/reject file changes)

4. **Active Context**  
   - Files currently open in the file preview
   - Selected lines or regions
   - Task list (if using `/tasks` slash command)

### Context Window Management

Sessions can grow very long. Pilot handles context automatically:
- **Sliding Window**: Older messages are summarized or truncated when the context limit is reached
- **Tool Results**: Large tool outputs (e.g., file contents) are truncated in history
- **Memory Priority**: Memory entries are always included, even in long sessions

---

## Slash Commands

Use slash commands in any session to access special features:

| Command | Description |
|---------|-------------|
| `/tasks` | Show the task list for the current project |
| `/memory` | Show memory entries for the current project |
| `/git` | Show git status and recent commits |
| `/files` | List project files |

Slash commands are handled by the agent — type them in the chat input and press Enter.

See [Agent Documentation](./agent.md#slash-commands) for the complete list.

---

## Tips & Best Practices

### Session Organization

- **One Session Per Feature**: Create a new session for each distinct feature or bug fix
- **Name Sessions Clearly**: Use descriptive titles so you can find them later in the Sessions sidebar
- **Pin Active Work**: Pin the 2-3 sessions you're actively working on to keep them at the top
- **Archive Completed Work**: Archive sessions when features are done or bugs are resolved — keeps your list clean while preserving history
- **Close Finished Sessions**: Keep the tab bar clean by closing sessions when work is complete
- **Delete Rarely**: Only delete sessions you're certain you won't need — archiving is usually the better choice

### Multi-Project Workflows

- **Tab Groups**: Open one tab per project to work in parallel
- **Context Switching**: Use `Cmd+1-9` to jump between projects quickly
- **Memory Isolation**: Each project's memory is loaded only in its sessions — no cross-contamination

### Long Sessions

- **Create Checkpoints**: Periodically start a new session with a summary of the work so far
- **Extract Memory**: Use the "Extract to Memory" feature to preserve important context ([Memory docs](./memory.md#auto-extraction))
- **Review History**: Use the Sessions sidebar to review past conversations

---

## Related Documentation

- **[Getting Started](./getting-started.md)** — Creating your first session
- **[Agent](./agent.md)** — How the AI agent works
- **[Memory](./memory.md)** — Context preservation across sessions
- **[Tasks](./tasks.md)** — Task management within sessions
- **[Sidebar](./sidebar.md)** — Sessions sidebar pane

[← Back to Documentation](./index.md)
