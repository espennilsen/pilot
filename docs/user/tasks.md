# Tasks

Pilot includes an **integrated task management system** that helps you track work items, organize priorities, and collaborate with the AI agent. Tasks are stored in JSONL format and deeply integrated into the agent workflow.

---

## What are Tasks?

Tasks in Pilot are:
- **Work items** tracked in `.pilot/tasks.jsonl` (per project)
- **Agent-integrated** — the agent can create, update, query, and comment on tasks
- **Status-tracked** — `open`, `in_progress`, `review`, `done`
- **Prioritized** — `P0` (critical) through `P4` (low)
- **Typed** — `epic`, `task`, `bug`, `feature`
- **Dependency-aware** — tasks can block or depend on other tasks
- **Visualized** — kanban board, table view, and sidebar list

---

## Task Lifecycle

```
┌──────┐    ┌────────────┐    ┌────────┐    ┌──────┐
│ open │ ──>│ in_progress│ ──>│ review │ ──>│ done │
└──────┘    └────────────┘    └────────┘    └──────┘
    ↑              ↓               ↓            ↓
    └──────────────┴───────────────┴────────────┘
           (can move between any status)
```

### Task Statuses

| Status | Description | Icon |
|--------|-------------|------|
| `open` | Task is defined but not started | ⭕ |
| `in_progress` | Actively being worked on | 🔵 |
| `review` | Work complete, awaiting review | 🟡 |
| `done` | Completed and verified | ✅ |

---

## Task Properties

Every task has:

### Core Fields

- **`id`** — Unique identifier (e.g., `TASK-001`)
- **`title`** — Short description (shown in lists)
- **`description`** — Full details, acceptance criteria, notes (Markdown)
- **`status`** — `open`, `in_progress`, `review`, or `done`
- **`priority`** — `P0` (critical), `P1` (high), `P2` (medium), `P3` (low), `P4` (backlog)
- **`type`** — `epic`, `task`, `bug`, or `feature`

### Metadata

- **`created`** — ISO 8601 timestamp
- **`updated`** — ISO 8601 timestamp (updated on every change)
- **`assignee`** — Who's responsible (optional)
- **`tags`** — Array of strings (e.g., `["frontend", "urgent"]`)

### Dependencies

- **`depends_on`** — Array of task IDs this task depends on (blockers)
- **`blocks`** — Array of task IDs this task blocks

### Comments

- **`comments`** — Array of comment objects:
  ```json
  {
    "author": "agent",
    "timestamp": "2026-02-23T12:34:56Z",
    "body": "Started implementation in PR #123"
  }
  ```

---

## Creating Tasks

### Method 1: Task Board

1. Open the task board: `Cmd+Shift+T`
2. Click **"+ New Task"**
3. Fill in the form:
   - Title (required)
   - Description (optional, Markdown supported)
   - Status, priority, type
   - Dependencies (optional)
4. Click **"Create"**

### Method 2: Tasks Sidebar

1. Open the Tasks pane (click the Tasks icon in the activity bar)
2. Click **"+ New"** in the pane header
3. Fill in the quick-create form
4. Press `Enter` to create

### Method 3: Agent Integration

Ask the agent to create tasks:

```
Create a task to fix the memory injection bug
```

```
Add a P0 bug: "Git status not updating in context panel"
```

```
Create an epic for the terminal feature with 3 subtasks
```

The agent will create tasks using the `pilot_task_create` tool and confirm the details.

### Task ID Format

Task IDs are auto-generated:
- Format: `TASK-NNN` where `NNN` is zero-padded (e.g., `TASK-001`, `TASK-042`)
- IDs are sequential per project
- Once assigned, IDs never change

---

## Managing Tasks

### Updating Tasks

**Task Board**:
1. Click a task card to open the detail view
2. Edit any field (title, description, status, priority, etc.)
3. Changes save automatically

**Tasks Sidebar**:
1. Click a task in the list
2. Edit inline or open the detail panel
3. Changes save immediately

**Agent**:
```
Update TASK-003 status to in_progress
```

```
Change priority of TASK-007 to P1
```

```
Mark TASK-012 as done
```

The agent uses the `pilot_task_update` tool to modify tasks.

### Commenting on Tasks

**Task Board / Sidebar**:
1. Open the task detail view
2. Scroll to the comments section
3. Type your comment (Markdown supported)
4. Click **"Add Comment"**

**Agent**:
```
Comment on TASK-005: "Blocked by API rate limits, investigating alternatives"
```

The agent uses the `pilot_task_comment` tool. Comments are timestamped and attributed to "agent".

### Deleting Tasks

**Task Board**:
1. Open the task detail view
2. Click **"Delete Task"** (⚠️ button)
3. Confirm deletion

**Tasks Sidebar**:
1. Right-click a task
2. Select **"Delete"**
3. Confirm

**Warning**: Deleted tasks cannot be recovered.

---

## Task Board

### Opening the Task Board

Open the task board in several ways:
1. Press `Cmd+Shift+T`
2. `Cmd+K` → "Open Task Board"
3. Click **"Board"** in the Tasks sidebar header

The task board opens as a **full tab** (replaces the chat view).

### Board Views

The task board has two views:

#### Kanban View (Default)

```
┌─────────┬──────────────┬─────────┬──────┐
│  Open   │ In Progress  │ Review  │ Done │
├─────────┼──────────────┼─────────┼──────┤
│ TASK-001│ TASK-003     │ TASK-005│ ...  │
│ TASK-002│ TASK-004     │         │      │
│ ...     │ ...          │         │      │
└─────────┴──────────────┴─────────┴──────┘
```

- **Columns**: One per status (`open`, `in_progress`, `review`, `done`)
- **Cards**: Draggable between columns (updates status)
- **Color-coded**: Priority colors (P0=red, P1=orange, P2=yellow, P3=blue, P4=gray)
- **Icons**: Type icons (epic=📦, task=✅, bug=🐛, feature=✨)

**Drag & Drop**:
- Drag a card to another column to change its status
- Order within a column is preserved but has no semantic meaning

#### Table View

```
┌─────────┬───────────────────┬──────────┬──────────┬──────┐
│ ID      │ Title             │ Status   │ Priority │ Type │
├─────────┼───────────────────┼──────────┼──────────┼──────┤
│ TASK-001│ Fix memory bug    │ open     │ P0       │ bug  │
│ TASK-002│ Add terminal tab  │ in_prog  │ P1       │ feat │
│ ...     │ ...               │ ...      │ ...      │ ...  │
└─────────┴───────────────────┴──────────┴──────────┴──────┘
```

- **Sortable**: Click column headers to sort
- **Filterable**: Use the filter bar at the top
- **Compact**: See more tasks at once
- **Click to open**: Click a row to open the task detail panel

Switch views with the **toggle button** in the board header.

---

## Tasks Sidebar Pane

### Opening the Tasks Pane

Click the **Tasks icon** in the activity bar (left edge), or press `Cmd+Shift+T` and select "Sidebar" mode.

### Pane Layout

```
┌────────────────────────────────┐
│ Tasks              [×] [+]     │ ← Header (enable toggle, new button)
├────────────────────────────────┤
│ [Filter: All] [Sort: Priority] │ ← Filters
├────────────────────────────────┤
│ ⭕ P0 TASK-001: Fix memory bug│
│ 🔵 P1 TASK-003: Add terminal  │
│ 🟡 P2 TASK-005: Update docs   │
│ ✅ P2 TASK-007: Refactor IPC  │
│ ...                            │
└────────────────────────────────┘
```

### Filtering Tasks

Use the filter dropdown to show:
- **All Tasks** (default)
- **Open** — Status = `open`
- **In Progress** — Status = `in_progress`
- **Review** — Status = `review`
- **Done** — Status = `done`
- **Priority: P0** — Only critical tasks
- **Priority: P1** — High priority
- **Priority: P2** — Medium priority
- **Priority: P3** — Low priority
- **Priority: P4** — Backlog
- **Type: Bug** — Only bugs
- **Type: Feature** — Only features
- **Type: Epic** — Only epics

**Multi-select** (coming soon): Combine filters (e.g., "P0 or P1" + "Open or In Progress").

### Sorting Tasks

Use the sort dropdown to order by:
- **Priority** (default) — P0 first, P4 last
- **Status** — `open` → `in_progress` → `review` → `done`
- **Created** — Oldest first
- **Updated** — Recently updated first

### Task Count Badge

The Tasks icon in the activity bar shows a **badge** with the count of:
- Open tasks (status = `open` or `in_progress`)
- Excludes `review` and `done` tasks

---

## Agent Integration

### Agent Tools

The agent has four task-related tools:

#### `pilot_task_create`

Create a new task.

**Usage**:
```
Create a task to refactor the IPC bridge
```

**Parameters**:
- `title` (required): Short description
- `description` (optional): Full details (Markdown)
- `status` (optional): Initial status (default: `open`)
- `priority` (optional): Priority (default: `P2`)
- `type` (optional): Type (default: `task`)
- `depends_on` (optional): Array of task IDs this task depends on
- `tags` (optional): Array of tags

#### `pilot_task_update`

Update an existing task.

**Usage**:
```
Update TASK-003 status to done
```

**Parameters**:
- `id` (required): Task ID (e.g., `TASK-003`)
- Any fields to update (`title`, `description`, `status`, `priority`, `type`, `depends_on`, `tags`)

#### `pilot_task_query`

Query tasks with filters.

**Usage**:
```
Show me all P0 and P1 tasks
```

**Parameters**:
- `status` (optional): Filter by status
- `priority` (optional): Filter by priority
- `type` (optional): Filter by type
- `tags` (optional): Filter by tags
- `limit` (optional): Max number of results (default: 50)

**Returns**: Array of matching tasks.

#### `pilot_task_comment`

Add a comment to a task.

**Usage**:
```
Comment on TASK-007: "Fixed in commit abc123"
```

**Parameters**:
- `id` (required): Task ID
- `body` (required): Comment text (Markdown supported)

### Agent Workflow Examples

**Bug Triage**:
```
User: There's a bug where the git status doesn't update
Agent: I'll create a task for that.
[Uses pilot_task_create]
Created TASK-015: "Git status not updating in context panel" (P1, bug, open)
```

**Feature Planning**:
```
User: Plan the terminal feature
Agent: I'll create an epic with subtasks.
[Uses pilot_task_create multiple times]
Created:
- TASK-020: Terminal feature (epic, P1)
- TASK-021: Implement PTY backend (task, depends_on: TASK-020)
- TASK-022: Add terminal UI component (task, depends_on: TASK-020)
- TASK-023: Integrate with dev commands (task, depends_on: TASK-021, TASK-022)
```

**Progress Check**:
```
User: /tasks
Agent: [Uses pilot_task_query]
Here are the open tasks:
- TASK-001 (P0, bug): Fix memory injection — in_progress
- TASK-003 (P1, feature): Add terminal tab — open
- TASK-007 (P2, task): Update docs — review
```

### Slash Commands

| Command | Description |
|---------|-------------|
| `/tasks` | Show all tasks for the current project |
| `/tasks open` | Show only open tasks |
| `/tasks P0` | Show only P0 tasks |
| `/tasks bug` | Show only bugs |

The agent will use `pilot_task_query` to fetch and display the results.

---

## Task Storage

### File Format

Tasks are stored in **JSON Lines** format:
```
<project>/.pilot/tasks.jsonl
```

Each line is a JSON object representing one task:
```json
{"id":"TASK-001","title":"Fix memory bug","status":"open","priority":"P0","type":"bug","created":"2026-02-23T12:00:00Z","updated":"2026-02-23T12:00:00Z"}
{"id":"TASK-002","title":"Add terminal","status":"in_progress","priority":"P1","type":"feature","created":"2026-02-23T13:00:00Z","updated":"2026-02-23T14:30:00Z"}
```

**Why JSONL?**
- **Git-friendly**: Line-based format minimizes merge conflicts
- **Append-only**: New tasks are added as new lines
- **Human-readable**: Easy to inspect, edit, or grep
- **Agent-friendly**: Simple for the AI to parse and modify

### File Location

Tasks are stored per project:
```
<project>/.pilot/tasks.jsonl
```

**Git Integration**:
- **Recommended**: Track `tasks.jsonl` in version control
- Benefit: Team members share tasks
- Caution: Updates may conflict — resolve with care

Add to `.gitignore` if you prefer local-only tasks:
```
.pilot/tasks.jsonl
```

### Backup and Recovery

Tasks are just text files — back them up like any code:
- Committed to git → backed up with the repo
- Not committed → back up manually or use Time Machine

**Recovering deleted tasks**:
- If tracked in git: `git checkout HEAD -- .pilot/tasks.jsonl`
- If not: Restore from backup

---

## Task Dependencies

### Defining Dependencies

Tasks can depend on other tasks:

```
TASK-021 depends on TASK-020
  ↓
TASK-020 must be completed before TASK-021 can start
```

**Create dependencies**:
1. Open a task in the detail view
2. Add task IDs to the "Depends On" field (comma-separated)
3. Save

**Agent**:
```
Create TASK-025 that depends on TASK-023 and TASK-024
```

### Visualizing Dependencies

Dependencies are shown:
- **Task detail panel**: "Depends On" and "Blocks" sections
- **Kanban board**: Dependency lines (coming soon)
- **Table view**: Dependency column

### Blocking Tasks

When you mark a task as a blocker, it automatically updates the `blocks` field of dependent tasks:

```
TASK-020 blocks TASK-021, TASK-022
```

This is the inverse of `depends_on` — maintained automatically.

---

## Task Types

### Epic

**Purpose**: Large body of work, broken into subtasks.

**Properties**:
- Has multiple child tasks
- Tracked at a high level
- Completion depends on subtasks

**Example**:
```
TASK-010 (epic): "Terminal Feature"
├─ TASK-011 (task): "Implement PTY backend"
├─ TASK-012 (task): "Add terminal UI"
└─ TASK-013 (task): "Integrate with dev commands"
```

### Task

**Purpose**: Standard work item.

**Properties**:
- Clear deliverable
- Can be completed in one sitting or a few days
- Most common type

**Example**:
```
TASK-020 (task): "Refactor IPC handlers to use async/await"
```

### Bug

**Purpose**: Fix a defect or incorrect behavior.

**Properties**:
- Always has a reproduction case (in description)
- Often higher priority than features
- Includes "Expected" vs "Actual" behavior

**Example**:
```
TASK-030 (bug): "Git status not updating after file changes"
Description:
- Expected: Git status refreshes when files change
- Actual: Git status is stale until manual refresh
- Reproduction: Edit a file, observe git tab
```

### Feature

**Purpose**: New functionality or enhancement.

**Properties**:
- Adds value or capability
- Has acceptance criteria
- May require design/planning

**Example**:
```
TASK-040 (feature): "Add diff syntax highlighting in Changes tab"
Description:
- Syntax-highlight code in diffs
- Use same theme as editor
- Support all languages
```

---

## Priorities

| Priority | Label | Description | Example Use Case |
|----------|-------|-------------|------------------|
| **P0** | Critical | Blocking work, must fix ASAP | Crash bug, data loss, security vulnerability |
| **P1** | High | Important, high impact | Key feature, major bug, deadline approaching |
| **P2** | Medium | Standard priority | Regular tasks, improvements |
| **P3** | Low | Nice-to-have, low urgency | Refactoring, small enhancements |
| **P4** | Backlog | Future work, not scheduled | Ideas, long-term improvements |

### Priority Guidelines

- **P0**: Drop everything, fix immediately
- **P1**: Work on this week
- **P2**: Work on this sprint/month
- **P3**: Work on when time allows
- **P4**: Revisit during planning

---

## Enabling/Disabling Tasks

### Toggle Tasks System

Disable the task system entirely:
1. Open the Tasks pane
2. Click the **toggle switch** in the pane header
3. Tasks are hidden from the UI and unavailable to the agent

When disabled:
- Tasks pane shows "Tasks disabled"
- Agent tools (`pilot_task_*`) return errors
- Task board is inaccessible
- No task data is loaded or modified

### Why Disable Tasks?

- **Simplify UI**: If you don't use task management
- **Performance**: Reduce overhead for projects with many tasks
- **Privacy**: Prevent agent from seeing task data

---

## Tips & Best Practices

### Task Naming

- **Be specific**: "Fix memory injection bug" > "Fix bug"
- **Start with a verb**: "Add terminal tab", "Refactor IPC handlers", "Update docs"
- **Keep it short**: Aim for <50 characters (details go in description)

### Task Descriptions

- **Use Markdown**: Format with headings, lists, code blocks
- **Include context**: Why is this task needed?
- **Add acceptance criteria**: "Done when X, Y, Z are complete"
- **Link to resources**: PRs, issues, docs, design mocks

### Priority Management

- **Don't over-prioritize**: Most tasks should be P2 or P3
- **P0 should be rare**: Only for truly critical blockers
- **Reprioritize often**: Adjust as new information emerges

### Agent Collaboration

- **Ask the agent to triage**: "Review this bug and create a task"
- **Let the agent update status**: "Mark TASK-003 as done"
- **Use the agent for progress checks**: "/tasks in_progress"

### Team Collaboration

- **Commit tasks to git**: Share tasks with the team
- **Use comments**: Document progress, blockers, decisions
- **Review tasks in meetings**: Use the task board as an agenda

---

## Related Documentation

- **[Sessions](./sessions.md)** — Task context in agent sessions
- **[Agent](./agent.md)** — Agent task tools (`pilot_task_*`)
- **[Sidebar](./sidebar.md)** — Tasks sidebar pane
- **[Keyboard Shortcuts](./keyboard-shortcuts.md)** — Task-related shortcuts

[← Back to Documentation](./index.md)
