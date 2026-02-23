# Memory

Pilot's **memory system** preserves context across sessions, ensuring the AI agent remembers important project details, conventions, decisions, and history. Memory is organized into two tiers: global and project.

> **Config directory** is platform-dependent: `~/.config/.pilot/` (macOS/Linux), `%APPDATA%\.pilot\` (Windows). Documentation uses `<PILOT_DIR>` as shorthand.

---

## What is Memory?

Memory entries are:
- **Markdown-formatted notes** stored in `MEMORY.md` files
- **Automatically injected** into every agent session's system prompt
- **Searchable and editable** through the Memory sidebar pane
- **Auto-extracted** from conversations when the agent learns something important

Memory helps the agent:
- Understand project structure and conventions
- Remember past decisions and context
- Avoid repeating questions
- Provide more relevant and personalized assistance

---

## Two-Tier Memory System

Pilot uses a **two-tier memory architecture** to organize context:

```
┌─────────────────────────────────────────────┐
│ 1. Global Memory                            │
│    <PILOT_DIR>/MEMORY.md              │
│    • Shared across ALL projects             │
│    • Personal preferences and conventions   │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│ 2. Project Memory                           │
│    <project>/.pilot/MEMORY.md              │
│    • Shared with team (git-tracked)         │
│    • Project structure, conventions, docs   │
└─────────────────────────────────────────────┘
```

Both tiers are injected into the agent's system prompt when working on a project. The agent sees the full combined memory.

---

## Global Memory

### Location
```
<PILOT_DIR>/MEMORY.md
```

### Purpose

Global memory contains:
- **Your coding preferences**: editor settings, formatting style, language preferences
- **General conventions**: naming patterns, documentation standards, git workflow
- **Tool preferences**: favorite libraries, frameworks, testing approaches
- **Personal context**: timezone, working hours, availability

### When to Use Global Memory

Add entries to global memory when:
- The information applies to **all projects** you work on
- You want the agent to remember a personal preference
- The entry is generic (not project-specific)

### Example Global Memory Entries

```markdown
# Global Memory

## Coding Preferences
- Prefer TypeScript strict mode in all projects
- Use 2-space indentation (never tabs)
- Write tests for all public APIs

## Git Workflow
- Create feature branches from `main`
- Squash commits before merging
- Use Conventional Commits format

## Communication
- Available Mon-Fri 9am-5pm GMT+1
- Prefer async communication (Slack, email)
```

---

## Project Memory

### Location
```
<project>/.pilot/MEMORY.md
```

### Purpose

Project memory contains:
- **Project structure**: architecture, module organization, key files
- **Team conventions**: code style, review process, deployment workflow
- **Technical decisions**: framework choices, design patterns, APIs
- **Domain knowledge**: business logic, terminology, product context

### When to Use Project Memory

Add entries to project memory when:
- The information is **specific to this project**
- The team should **share this context** (can be git-tracked)
- You want all team members' agents to know about it
- The entry documents architecture, conventions, or decisions

### Example Project Memory Entries

```markdown
# Pilot Memory

## Architecture
- Electron 40 main process handles SDK, git, file system
- React 19 renderer communicates via IPC bridge
- All types shared in `shared/types.ts`
- All IPC channel names in `shared/ipc.ts`

## Conventions
- One Zustand store per domain in `src/stores/`
- IPC handlers in `electron/ipc/<domain>.ts`
- Never mutate Zustand state — always return new objects
- Use `IPC.*` constants, never raw channel strings

## Testing
- Unit tests: `npm run test:unit`
- E2E tests: `npm run test:e2e`
- Coverage target: 80%+
```

### Git Integration

Project memory can be committed to git:
- **Recommended**: Track `.pilot/MEMORY.md` in version control
- Benefit: Team members share context automatically
- Caution: Don't include sensitive information (API keys, secrets)

Add to `.gitignore` if you prefer to keep it local:
```
.pilot/MEMORY.md
```

---

## Memory Sidebar Pane

### Accessing Memory

Open the Memory pane:
1. Click the **Memory icon** in the activity bar (left edge)
2. Press `Cmd+Shift+M`

The Memory pane shows:
- **Memory count badge** (number of entries across both tiers)
- **Tier tabs**: Global / Project
- **Markdown editor** for the selected tier
- **Auto-extract toggle**

### Editing Memory

Edit memory directly in the sidebar:
1. Select the tier tab (Global or Project)
2. Edit the Markdown content in the text area
3. Click **Save** (or press `Cmd+S`)

Changes take effect immediately — the next agent message will include the updated memory.

### Other Actions

- **Clear** — Reset the memory file to empty
- **Reload** — Re-read from disk (discards unsaved edits)
- **Open in Tab** — Open the memory file in the editor for a larger editing surface
- **Open All in Tabs** — Open both memory files in editor tabs

---

## Auto-Extraction

Pilot can **automatically extract** important information from conversations and add it to memory.

### How Auto-Extraction Works

After each agent response:
1. A lightweight background call analyzes the conversation
2. Identifies **context worth preserving**: decisions, conventions, preferences, corrections
3. Appends new entries to the appropriate memory file (global or project)
4. Shows a 🧠✨ pulse in the status bar

### Enabling/Disabling Auto-Extraction

Toggle auto-extraction in the Memory sidebar pane via the **Auto-extract** switch.

When disabled:
- Auto-extraction does not run
- Manual memory creation still works
- Existing memory is still injected into sessions

### Best Practices

- **Review regularly**: Auto-extracted entries may need refinement
- **Keep memory lean**: Delete outdated entries
- **Edit for clarity**: Rephrase entries to be concise and scannable

---

## Memory Injection

### How Memory Is Injected

When you start a session:

1. **Pilot loads all relevant memory**:
   - Global memory (always)
   - Project memory (if a project is assigned)

2. **Memory is formatted and wrapped**:
   ```xml
   <memory>
   The following are memories from past interactions.

   ## Global Memory
   [contents of <PILOT_DIR>/MEMORY.md]

   ## Project Memory
   [contents of .pilot/MEMORY.md]
   </memory>
   ```

3. **Memory is injected into the system prompt**:
   - Visible to the agent in every turn
   - If combined memory exceeds 50 KB, oldest entries are trimmed

---

## Memory Commands

### Hash Commands

Use these in the chat input:

| Command | Description |
|---------|-------------|
| `# remember <text>` | Save a memory entry (scope inferred from keywords) |
| `# forget <text>` | Remove the first matching memory entry |
| `/memory` | Open the memory settings panel |

### Scope Inference

The `# remember` command infers scope from keywords:
- Contains "always", "never", "I prefer", "I like", "my style", or "all projects" → **global**
- Everything else → **project**

### Agent Instructions

Ask the agent to manage memory:

```
Add this to project memory: We use Jest for testing
```

```
Remember that I prefer async/await over Promise chains
```

```
Update memory: We switched from Webpack to Vite
```

```
What's in memory about our testing conventions?
```

---

## Memory Best Practices

### What to Put in Memory

**Good memory entries**:
- Architecture decisions: "We use a monorepo with Turborepo"
- Conventions: "API routes go in `src/api/routes/`"
- Technical context: "Auth uses JWT with RSA-256 signing"
- Key files: "Main entry point is `electron/main/index.ts`"
- Team agreements: "PRs require 2 approvals"

**Poor memory entries**:
- Obvious information: "This is a Node.js project" (agent can infer this)
- Redundant entries: Duplicating information from README or docs
- Implementation details: Complete file contents (link to files instead)

### When to Use Each Tier

| Tier | Use When |
|------|----------|
| **Global** | Personal preferences, general conventions, applies to all projects |
| **Project** | Team knowledge, can be committed to git, project-specific context |

### Organizing Memory

Structure memory entries with Markdown headings:

```markdown
# Project Memory

## Architecture
- Main process: Node.js + Electron APIs
- Renderer process: React + Zustand

## File Structure
- `electron/` — Main process code
- `src/` — Renderer process code
- `shared/` — IPC contracts and types

## Conventions
- Use `IPC.*` constants, never raw strings
- All types in `shared/types.ts`
- Never mutate Zustand state
```

Use headings, lists, and code blocks to make memory scannable.

### Keeping Memory Fresh

Regularly review and update memory:
- **Delete outdated entries**: Remove old conventions, deprecated patterns
- **Update stale information**: Architecture changes, file moves, convention updates
- **Consolidate duplicates**: Merge similar entries into one clear statement
- **Add missing context**: Fill gaps discovered in conversations

---

## Memory and Privacy

### What's Shared

- **Global memory**: Stored locally in `<PILOT_DIR>/`, never committed to git
- **Project memory**: Lives in `<project>/.pilot/MEMORY.md`, can be committed to git

### What's Sent to AI Providers

Memory is included in the system prompt sent to AI providers (OpenAI, Anthropic, etc.):
- **Do not** include secrets, API keys, or credentials in memory
- **Do not** include personally identifiable information (PII)

If you need to reference sensitive information:
- Use placeholder values: `API_KEY=<see 1Password>`
- Link to secure storage: `Credentials in team vault`
- Store outside memory entirely

---

## Troubleshooting

### Memory Not Appearing in Sessions

**Check**:
1. Memory is enabled (toggle in Memory pane header)
2. Project is assigned to the session
3. Memory files exist at the expected paths
4. Refresh the session: Close and reopen the tab

### Auto-Extraction Not Working

**Check**:
1. Auto-extraction is enabled (Memory pane toggle)
2. The conversation includes context worth preserving
3. At least 30 seconds have passed since the last extraction

### Memory Injection Errors

**Check**:
1. Memory files are valid Markdown (no syntax errors)
2. File permissions allow reading `<PILOT_DIR>/` and `.pilot/`
3. Check the developer console (`Cmd+Shift+I`) for errors

---

## Related Documentation

- **[Sessions](./sessions.md)** — How memory is loaded into sessions
- **[Agent](./agent.md)** — How the agent uses memory
- **[Sidebar](./sidebar.md)** — Memory sidebar pane
- **[Settings](./settings.md)** — Memory settings and configuration

[← Back to Documentation](./index.md)
