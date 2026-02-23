# Getting Started

Welcome to Pilot! This guide will walk you through your first launch, opening a project, and creating your first AI-assisted coding session.

> **Config directory** is platform-dependent: `~/.config/.pilot/` (macOS/Linux), `%APPDATA%\.pilot\` (Windows). Documentation uses `<PILOT_DIR>` as shorthand.

---

## First Launch

When you launch Pilot for the first time:

1. **Initial Setup Window**  
   Pilot will create its configuration directory at `<PILOT_DIR>/`

2. **Authentication**  
   Configure your AI provider credentials in [Settings](./settings.md#auth) (`Cmd+,` → Auth tab)
   - Add API keys for OpenAI, Anthropic, Google, or other providers
   - OAuth tokens are stored securely in `<PILOT_DIR>/auth.json`

3. **Model Selection**  
   Choose your preferred AI model from the settings panel or use the model switcher in any session

---

## Opening a Project

Pilot works with project folders on your local filesystem.

### Methods to Open a Project

1. **File Menu**  
   `File` → `Open Project...` → Select your project directory

2. **Keyboard Shortcut**  
   Press `Cmd+O` to open the project picker dialog

3. **New Session**  
   Create a new session (`Cmd+N`) and assign a project when prompted

### What Happens When You Open a Project

- Pilot indexes the project directory structure
- Git status is detected and displayed in the [Context Panel](./context-panel.md#git-tab)
- Project-specific memory is loaded (if `.pilot/MEMORY.md` exists)
- Task list is loaded from `.pilot/tasks.jsonl` (if present)
- The project path is displayed in the tab header

---

## Your First Session

### Creating a Session

1. **Start a New Session**  
   Press `Cmd+N` or click the `+` button in the tab bar

2. **Assign a Project**  
   - If you haven't opened a project yet, you'll be prompted to select one
   - Sessions can be created without a project for general queries

3. **Ask a Question**  
   Type your message in the chat input at the bottom:
   ```
   Show me the structure of this project
   ```

4. **Agent Response**  
   The AI agent will analyze your project and respond with insights

### Understanding Agent Tools

When the agent needs to interact with your codebase, it will use tools:

- **`read`** — Read file contents
- **`bash`** — Execute shell commands
- **`write`** — Create or modify files
- **`edit`** — Make surgical edits to existing files

**Important**: File-modifying tools are **sandboxed**. All changes are staged for your review before being applied to disk.

### Reviewing File Changes

When the agent proposes a file change:

1. **Diff Panel Appears**  
   The [Context Panel](./context-panel.md#changes-tab) switches to the Changes tab

2. **Review the Diff**  
   - Green lines: additions
   - Red lines: deletions
   - View the full before/after comparison

3. **Accept or Reject**  
   - Click **Accept** to apply the change to disk
   - Click **Reject** to discard the change
   - Click **Accept All** to apply all pending changes

4. **Continue the Conversation**  
   The agent will continue working after you've reviewed the changes

See [Agent Documentation](./agent.md#tool-execution) for more details.

---

## Multi-Tab Workflow

Pilot supports multiple simultaneous sessions:

### Working with Tabs

- **New Tab**: `Cmd+T` — Create a new session in a new tab
- **Switch Tabs**: `Cmd+1` through `Cmd+9` — Jump to tab by number
- **Close Tab**: `Cmd+W` — Close the active tab
- **Reopen Tab**: `Cmd+Shift+T` — Reopen the last closed tab

### Tab Grouping

Tabs are automatically grouped by project in the tab bar:
- Tabs working on the same project are visually grouped
- Project name appears in the tab header
- Switch between projects by selecting tabs

---

## Command Palette

Press `Cmd+K` to open the command palette — a quick way to access all Pilot features:

- Create new sessions
- Open projects
- Run dev commands
- Toggle UI panels
- Access settings
- Search keyboard shortcuts

Type to filter commands, use arrow keys to navigate, press `Enter` to execute.

---

## Exploring the Interface

### Sidebar (Left)

The [Sidebar](./sidebar.md) contains:
- **Sessions** — Browse and restore previous sessions
- **Memory** — View and edit memory entries (global and project)
- **Tasks** — Filter and view tasks with status/priority indicators

Toggle the sidebar with `Cmd+B`.

### Context Panel (Right)

The [Context Panel](./context-panel.md) shows:
- **Files** — Project directory tree with file preview
- **Git** — Status, branches, commit history
- **Changes** — Staged diffs from agent tool execution

Toggle the context panel with `Cmd+Shift+B`.

### Activity Bar

The activity bar on the left edge provides quick access to:
- Sessions pane
- Memory pane  
- Tasks pane
- Settings

Click an icon to show/hide its pane. The activity bar is always visible.

---

## Next Steps

Now that you've completed your first session:

1. **[Explore Sessions](./sessions.md)** — Learn about session management and multi-project workflows
2. **[Learn About Memory](./memory.md)** — Understand how Pilot preserves context across sessions
3. **[Create Tasks](./tasks.md)** — Start tracking work items with the integrated task manager
4. **[Master Keyboard Shortcuts](./keyboard-shortcuts.md)** — Speed up your workflow with keybindings
5. **[Configure Settings](./settings.md)** — Customize Pilot to match your preferences

---

**Tip**: Press `Cmd+/` anytime to view keyboard shortcuts, or press `Cmd+K` to access the command palette.

[← Back to Documentation](./index.md)
