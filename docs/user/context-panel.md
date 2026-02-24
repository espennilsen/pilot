# Context Panel

The context panel is a collapsible panel on the right side of the Pilot window. It provides quick access to your project's files, Git status, and pending changes without leaving your current workflow.

## Tabs

The context panel has three tabs, selectable via the tab bar at the top:

### Files

Browse your project's file tree. Click any file to open it in an editor tab.

- Displays the full directory structure of the active project
- Files and folders are expandable/collapsible
- Click a file to open it in a new editor tab
- Hidden files and dotfiles are shown by default (except those matching configured patterns)
- Customize which files are hidden via **Settings > Files** using `.gitignore` syntax patterns

### Git

View your project's Git status at a glance:

- Current branch
- Changed, staged, and untracked files
- Quick overview of your working tree

### Changes

Review pending changes from the AI agent's sandboxed edits:

- Shows a queue of staged diffs proposed by the agent
- Review each change before accepting or rejecting
- Diffs are displayed with syntax highlighting
- Pending change count is shown as a badge on the tab

## Show / Hide

Toggle the context panel with:

| Action | Shortcut |
|--------|----------|
| Toggle context panel | `Cmd+Shift+B` (macOS) / `Ctrl+Shift+B` |

The panel can also be toggled via the [Command Palette](keyboard-shortcuts.md).

## Resizing

Drag the left edge of the context panel to resize it. The width is remembered across sessions.

---

**See also:** [Sidebar](sidebar.md) · [Sessions](sessions.md) · [Keyboard Shortcuts](keyboard-shortcuts.md)
