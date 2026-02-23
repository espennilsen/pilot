# Sidebar

The **sidebar** is Pilot's left panel, providing quick access to sessions, memory, and tasks. It consists of an always-visible **activity bar** and collapsible **panes** for each feature.

---

## Sidebar Layout

```
┌─┬──────────────────────────┐
│A│ Sessions                 │
│c│ ┌──────────────────────┐ │
│t│ │ Pilot Session        │ │
│i│ │ Memory System Doc    │ │
│v│ │ Task Manager         │ │
│i│ └──────────────────────┘ │
│t│                          │
│y│ Memory                   │
│ │ ┌──────────────────────┐ │
│B│ │ Global: 3 entries    │ │
│a│ │ Project: 7 entries   │ │
│r│ │ Personal: 2 entries  │ │
│ │ └──────────────────────┘ │
│ │                          │
│ │ Tasks                    │
│ │ ┌──────────────────────┐ │
│ │ │ P0 TASK-001: Bug fix │ │
│ │ │ P1 TASK-003: Feature │ │
│ │ └──────────────────────┘ │
└─┴──────────────────────────┘
```

- **Activity Bar** (left edge): Always visible, icons for each pane
- **Panes** (right of activity bar): Expand/collapse when you click an activity bar icon
- **Toggle sidebar**: `Cmd+B` hides/shows the entire sidebar

---

## Activity Bar

The activity bar is the narrow column on the far left with icons:

### Icons

| Icon | Pane | Shortcut |
|------|------|----------|
| 💬 | Sessions | `Cmd+Shift+S` |
| 🧠 | Memory | `Cmd+Shift+M` |
| ✅ | Tasks | `Cmd+Shift+T` |
| ⚙️ | Settings | `Cmd+,` |

### Behavior

- **Click an icon**: Toggle the corresponding pane (expand if collapsed, collapse if expanded)
- **Current pane indicator**: The active pane's icon is highlighted
- **Badge**: Icons show notification badges (e.g., task count, memory update indicator)

### Always Visible

The activity bar is always visible, even when the sidebar is collapsed (`Cmd+B`):
- When sidebar is hidden, only the activity bar remains
- Click an icon to re-expand the sidebar and show that pane
- This provides quick access without taking up screen space

---

## Sessions Pane

### Purpose

The Sessions pane shows:
- **Recent sessions**: List of recent chat sessions
- **Session metadata**: Title, project, last updated timestamp
- **Continue session**: Click to restore a previous session in a new tab

### Opening the Sessions Pane

1. Click the **💬 icon** in the activity bar
2. Press `Cmd+Shift+S`

### Session List

Sessions are displayed as cards:

```
┌────────────────────────────────┐
│ 💬 Sessions              [×]  │ ← Header
├────────────────────────────────┤
│ [Search sessions...]           │ ← Search bar
├────────────────────────────────┤
│ Pilot Development              │ ← Session title
│ in Pilot                       │ ← Project
│ 2 hours ago                    │ ← Last updated
├────────────────────────────────┤
│ Memory System Docs             │
│ in Pilot                       │
│ Yesterday                      │
├────────────────────────────────┤
│ Fix Git Status Bug             │
│ No project                     │
│ 3 days ago                     │
└────────────────────────────────┘
```

**Sorting**:
- By default, sessions are sorted by "last updated" (most recent first)
- Click the sort dropdown to change:
  - **Last Updated** (default)
  - **Created Date** (oldest or newest first)
  - **Project** (grouped by project name)
  - **Alphabetical** (by session title)

### Session Actions

**Click a session**:
- Opens the session in a new tab
- Full chat history is restored
- Project association is restored
- Memory context is re-injected

**Right-click a session**:
- **Continue Session** — Same as click
- **Rename Session** — Edit the session title
- **Delete Session** — Permanently delete (cannot be undone)
- **Show in Finder** — Open the `.jsonl` file location

**Keyboard**:
- `↑` `↓` — Navigate sessions
- `Enter` — Open selected session
- `F2` — Rename selected session
- `Delete` — Delete selected session

### Searching Sessions

Type in the search bar to filter sessions:
- Matches session title, project name, or message content
- Real-time filtering (no need to press Enter)
- Clear with `Esc` or click the `×` in the search bar

**Example**:
```
Search: "memory"
Results:
- Memory System Docs
- Fix memory injection bug
```

### Session Metadata

Each session card shows:
- **Title**: Auto-generated from conversation or manually set
- **Project**: Project name or "No project"
- **Timestamp**: Relative time (e.g., "2 hours ago") or absolute date
- **Message count** (hover): Number of messages in the session

### Empty State

If no sessions exist:
```
┌────────────────────────────────┐
│ No sessions yet                │
│                                │
│ Press Cmd+N to create a new    │
│ session and start chatting     │
└────────────────────────────────┘
```

---

## Memory Pane

### Purpose

The Memory pane shows:
- **Memory entries** across both tiers (global, project)
- **Memory count badge** (number of entries)
- **Enable/disable toggle** for the memory system
- **Quick add** button for new entries

### Opening the Memory Pane

1. Click the **🧠 icon** in the activity bar
2. Press `Cmd+Shift+M`

### Pane Layout

```
┌────────────────────────────────┐
│ 🧠 Memory         [Toggle] [+] │ ← Header with toggle and new button
├────────────────────────────────┤
│ [Global] [Project] [Personal]  │ ← Tier tabs
├────────────────────────────────┤
│ Coding Preferences             │ ← Entry title (heading)
│ • Prefer TypeScript strict...  │ ← Entry preview
├────────────────────────────────┤
│ Git Workflow                   │
│ • Create feature branches...   │
├────────────────────────────────┤
│ Project Architecture           │
│ • Electron main process...     │
└────────────────────────────────┘
```

### Tier Tabs

Switch between memory tiers:
- **Global** — `~/.config/.pilot/MEMORY.md`
- **Project** — `<project>/.pilot/MEMORY.md` (shared with team)

Click a tab to show entries from that tier.

**Keyboard**: `Tab` cycles through tiers.

### Memory Entries

Each entry shows:
- **Title**: First heading in the entry (e.g., `## Coding Preferences`)
- **Preview**: First few lines of content
- **Metadata**: Last updated timestamp (on hover)

**Click an entry**:
- Opens the entry detail view (expanded)
- Shows full Markdown content
- Edit or delete the entry

**Keyboard**:
- `↑` `↓` — Navigate entries
- `Enter` — Open selected entry
- `Delete` — Delete selected entry

### Creating Memory Entries

**Quick Add**:
1. Click the **[+]** button in the pane header
2. A blank entry editor opens
3. Type your Markdown content
4. Press `Cmd+S` or click **Save**

**Full Form**:
1. `Cmd+K` → "New Memory Entry"
2. Fill in:
   - **Tier**: Global / Project / Personal
   - **Title**: Heading for the entry
   - **Content**: Markdown body
3. Click **Create**

**Agent-Assisted**:
```
User: Remember that we use Conventional Commits
Agent: I'll add that to memory.
[Creates entry in project memory]
```

See [Memory documentation](./memory.md#creating-memory-entries) for details.

### Editing Memory Entries

1. Click an entry to open it
2. Click **Edit** button
3. Modify the Markdown content
4. Click **Save** or press `Cmd+S`

Changes take effect immediately (next agent message includes the update).

### Deleting Memory Entries

1. Click an entry to open it
2. Click **Delete** button (trash icon)
3. Confirm deletion

**Warning**: Deleted entries cannot be recovered.

### Memory Count Badge

The 🧠 icon in the activity bar shows a badge with the total number of memory entries across all tiers.

**Example**:
```
🧠 (12)  ← 12 memory entries total
```

The badge updates in real-time as entries are added or removed.

### Enable/Disable Toggle

The toggle switch in the pane header enables/disables the memory system:

**Enabled** (default):
- Memory entries are injected into agent sessions
- Auto-extraction runs (if enabled in settings)
- Badge shows entry count

**Disabled**:
- Memory is not injected (agent has no memory context)
- Auto-extraction does not run
- Badge is hidden
- Pane shows "Memory disabled"

**Use case**: Disable memory for a session where you don't want historical context.

---

## Tasks Pane

### Purpose

The Tasks pane shows:
- **Filtered task list** (by status, priority, type)
- **Task count badge** (number of open tasks)
- **Enable/disable toggle** for the task system
- **Quick add** button for new tasks
- **Task board link** (opens full kanban/table view)

### Opening the Tasks Pane

1. Click the **✅ icon** in the activity bar
2. Press `Cmd+Shift+T`

### Pane Layout

```
┌────────────────────────────────┐
│ ✅ Tasks          [Toggle] [+] │ ← Header with toggle and new button
├────────────────────────────────┤
│ [Filter: All] [Sort: Priority] │ ← Filter and sort dropdowns
├────────────────────────────────┤
│ ⭕ P0 TASK-001: Fix memory bug│
│ 🔵 P1 TASK-003: Add terminal  │
│ 🟡 P2 TASK-005: Update docs   │
│ ✅ P2 TASK-007: Refactor IPC  │
├────────────────────────────────┤
│ [Open Task Board]              │ ← Button to open full board
└────────────────────────────────┘
```

### Task List

Tasks are displayed as compact cards:

```
⭕ P0 TASK-001: Fix memory injection bug
   ↑   ↑    ↑         ↑
Status│  Task ID    Title
    Priority
```

**Status Icons**:
- ⭕ `open`
- 🔵 `in_progress`
- 🟡 `review`
- ✅ `done`

**Priority Colors**:
- Red: P0 (critical)
- Orange: P1 (high)
- Yellow: P2 (medium)
- Blue: P3 (low)
- Gray: P4 (backlog)

### Filtering Tasks

Use the filter dropdown to show specific tasks:

**By Status**:
- All Tasks (default)
- Open
- In Progress
- Review
- Done

**By Priority**:
- All Priorities (default)
- P0 (Critical)
- P1 (High)
- P2 (Medium)
- P3 (Low)
- P4 (Backlog)

**By Type**:
- All Types (default)
- Epic
- Task
- Bug
- Feature

**Combining filters** (coming soon): Select multiple filters (e.g., "P0 or P1" + "Open or In Progress").

### Sorting Tasks

Use the sort dropdown to order tasks:
- **Priority** (default) — P0 first, P4 last
- **Status** — `open` → `in_progress` → `review` → `done`
- **Created** — Oldest first
- **Updated** — Recently updated first

### Task Actions

**Click a task**:
- Opens the task detail panel (overlay)
- Shows full description, comments, dependencies
- Edit fields inline

**Right-click a task**:
- **Edit Task** — Same as click
- **Mark as Done** — Change status to `done`
- **Delete Task** — Permanently delete
- **Copy Task ID** — Copy to clipboard (e.g., `TASK-001`)

**Keyboard**:
- `↑` `↓` — Navigate tasks
- `Enter` — Open selected task
- `Delete` — Delete selected task
- `Space` — Toggle task status (open ↔ in_progress)

### Creating Tasks

**Quick Add**:
1. Click the **[+]** button in the pane header
2. Type the task title
3. Press `Enter` (creates with defaults: `open`, `P2`, `task`)

**Full Form**:
1. `Cmd+K` → "New Task"
2. Fill in:
   - Title (required)
   - Description (optional, Markdown)
   - Status, priority, type
   - Dependencies
3. Click **Create**

**Agent-Assisted**:
```
User: Create a task to fix the git status bug
Agent: Created TASK-015: "Fix git status not updating" (P1, bug, open)
```

See [Tasks documentation](./tasks.md#creating-tasks) for details.

### Task Count Badge

The ✅ icon in the activity bar shows a badge with the number of **open tasks** (status = `open` or `in_progress`).

**Example**:
```
✅ (5)  ← 5 open tasks
```

Completed tasks (`review`, `done`) are not counted in the badge.

### Enable/Disable Toggle

The toggle switch in the pane header enables/disables the task system:

**Enabled** (default):
- Tasks are visible in the pane
- Agent can use task tools (`pilot_task_*`)
- Badge shows open task count

**Disabled**:
- Tasks are hidden from the UI
- Agent task tools return errors
- Badge is hidden
- Pane shows "Tasks disabled"

**Use case**: Disable tasks if you don't use task management or for performance (large task lists).

### Task Board Link

Click **"Open Task Board"** at the bottom of the pane to open the full task board:
- Opens as a tab (replaces chat view)
- Shows kanban or table view
- Full task management features

See [Tasks documentation](./tasks.md#task-board) for task board details.

---

## Sidebar Behavior

### Expanding/Collapsing Panes

- **Click an activity bar icon**: Toggle the pane (expand if collapsed, collapse if expanded)
- **Click the same icon again**: Collapse the pane
- **Click a different icon**: Switch to that pane (previous pane collapses)

**Example**:
1. Click 💬 → Sessions pane expands
2. Click 🧠 → Memory pane expands, Sessions pane collapses
3. Click 🧠 again → Memory pane collapses

### Sidebar Width

The sidebar width is **adjustable**:
1. Hover over the right edge of the sidebar (cursor changes to resize)
2. Click and drag to resize
3. Release to set the new width

**Limits**: Minimum 200px, maximum 600px.

**Reset**: Double-click the resize handle to reset to default width (250px).

### Hiding the Sidebar

**Toggle sidebar**: `Cmd+B`

When hidden:
- Only the activity bar remains visible
- Click an activity bar icon to re-show the sidebar and open that pane

**Use case**: Maximize chat area for long conversations or code review.

---

## Sidebar Settings

### Auto-Expand Panes

**Purpose**: Automatically expand panes when relevant events occur.

**Options** (Settings → General → Sidebar):
- **Enabled** (default):
  - Sessions pane expands when you create a new session
  - Memory pane expands when memory is auto-extracted
  - Tasks pane expands when a task is created
- **Disabled**: Panes remain collapsed unless you manually open them

### Pane Order

**Purpose**: Customize the order of panes in the activity bar.

**How to reorder**:
1. Settings → General → Sidebar → Pane Order
2. Drag and drop pane names to reorder
3. Click **Save**

**Default order**: Sessions, Memory, Tasks.

### Default Pane

**Purpose**: Which pane is open when Pilot launches.

**Options**:
- **Sessions** (default)
- **Memory**
- **Tasks**
- **None** (sidebar collapsed on launch)

---

## Tips & Best Practices

### Keyboard-First Workflow

Use shortcuts to access panes without clicking:
- `Cmd+Shift+S` — Sessions pane
- `Cmd+Shift+M` — Memory pane
- `Cmd+Shift+T` — Tasks pane
- `Cmd+B` — Toggle sidebar

### Badge Awareness

Check activity bar badges for notifications:
- 🧠 (12) — 12 memory entries (may have unread updates)
- ✅ (5) — 5 open tasks (items needing attention)

### Multi-Pane Workflow

Keep the sidebar open and switch between panes as you work:
1. Start in Sessions pane (review recent work)
2. Switch to Tasks pane (check what's next)
3. Switch to Memory pane (verify context is up-to-date)

### Pane Width

Adjust pane width to match your workflow:
- **Narrow** (200px): Maximize chat area, show pane icons and titles only
- **Medium** (250px, default): Balanced
- **Wide** (400px+): Show full task descriptions, memory previews

---

## Related Documentation

- **[Sessions](./sessions.md)** — Session management and history
- **[Memory](./memory.md)** — Memory system and auto-extraction
- **[Tasks](./tasks.md)** — Task management and board
- **[Keyboard Shortcuts](./keyboard-shortcuts.md)** — Sidebar shortcuts

[← Back to Documentation](./index.md)
