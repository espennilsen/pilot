# Sessions

Sessions are the core of Pilot's workflow. Each session is an independent conversation with the AI agent, preserving full context, tool execution history, and project associations.

---

## What is a Session?

A **session** is:
- A persistent chat conversation with the AI agent
- Associated with zero or one project
- Stored as a `.jsonl` file in `~/.config/.pilot/sessions/`
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
- The session is saved to `~/.config/.pilot/sessions/<session-id>.jsonl`

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
~/.config/.pilot/sessions/<session-id>.jsonl
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

Delete old sessions:

1. **Sessions Sidebar**  
   Right-click a session → "Delete Session"

2. **Manual Deletion**  
   Remove the `.jsonl` file from `~/.config/.pilot/sessions/`

**Warning**: Deleted sessions cannot be recovered.

---

## Session Context

### What Gets Included in Session Context

Every agent message includes:

1. **System Prompt**  
   - Base instructions for the AI agent
   - Tool definitions and usage guidelines
   - Project-specific context (if assigned)

2. **Memory Injection**  
   - [Global memory](./memory.md#global-memory) from `~/.config/.pilot/MEMORY.md`
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
- **Close Finished Sessions**: Keep the tab bar clean by closing sessions when work is complete

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
