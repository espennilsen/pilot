# Agent

Pilot's **AI agent** is a context-aware coding assistant powered by the Pi SDK. It can read and write files, execute commands, manage tasks, and maintain memory across sessions — all within a sandboxed environment that requires your approval for file changes.

---

## What is the Agent?

The agent is:
- **AI-powered**: Uses large language models (OpenAI, Anthropic, Google, etc.)
- **Tool-equipped**: Can read/write files, run bash commands, query git, manage tasks
- **Context-aware**: Has access to project memory, file structure, git history, task lists
- **Sandboxed**: All file modifications are staged for your review before being applied
- **Conversational**: Responds to natural language requests and questions

---

## How the Agent Works

### 1. You Send a Message

Type your request in the chat input:
```
Refactor the IPC handlers to use async/await
```

### 2. Agent Analyzes Context

The agent receives:
- **Your message**
- **Chat history** (previous conversation in this session)
- **Memory context** ([global and project](./memory.md))
- **System prompt** (instructions on how to assist you)
- **Tool definitions** (available tools and their parameters)

### 3. Agent Decides on Actions

The agent chooses to:
- **Respond directly** (answer a question, provide guidance)
- **Use tools** (read files, execute commands, create tasks)
- **Ask for clarification** (if the request is ambiguous)

### 4. Tool Execution

If the agent uses tools:
- **Read-only tools** (`read`, `bash`, `pilot_task_query`) execute immediately
- **Write tools** (`write`, `edit`, `pilot_task_create`) are **sandboxed** — staged for review

### 5. You Review Changes

For sandboxed operations:
- **Diff panel** opens in the [Context Panel](./context-panel.md#changes-tab)
- You see the proposed changes (before/after)
- You **accept** or **reject** the changes
- Agent continues after your decision

### 6. Agent Responds

The agent:
- Explains what it did
- Shows the results of tool executions
- Asks follow-up questions if needed
- Waits for your next message

---

## Steering & Follow-up

While the agent is actively working, you can redirect it or queue follow-up instructions without waiting:

- **Steer** (`Enter` while streaming) — Interrupts after the current tool. The agent sees your message immediately.
- **Follow-up** (`Alt+Enter` while streaming) — Queued until the agent finishes all current work.
- **Stop** (click stop button) — Aborts entirely.

Pending messages appear as colored pills above the input. See the full **[Steering & Follow-up guide](steering.md)** for details, examples, and tips.

---

## Agent Tools

### File Tools

#### `read`

**Purpose**: Read file contents.

**Usage**:
```
Read src/app.tsx
```

**Behavior**:
- Returns full file contents
- Truncated if very large (>50KB)
- Not sandboxed (no approval needed)

#### `write`

**Purpose**: Create a new file or overwrite an existing file.

**Usage**:
```
Create a new component at src/components/TaskCard.tsx
```

**Behavior**:
- **Sandboxed** — staged for review
- Diff shows full file contents (create = all green lines)
- Applied to disk only after you accept

#### `edit`

**Purpose**: Make surgical edits to an existing file (find and replace).

**Usage**:
```
In src/app.tsx, replace the old event handler with the new one
```

**Behavior**:
- **Sandboxed** — staged for review
- Diff shows only the changed lines (context included)
- More precise than `write` for small changes
- Fails if the "old text" doesn't match exactly (prevents accidental edits)

### Shell Tools

#### `bash`

**Purpose**: Execute shell commands in the project directory.

**Usage**:
```
Run npm install to add the new dependency
```

**Behavior**:
- Executes in the project root
- Returns stdout and stderr
- **Sandboxed for destructive commands** (rm, mv, etc.) — you must approve
- Read-only commands (ls, cat, grep) execute immediately

**Security**: Commands are restricted to the project directory (cannot escape the project jail).

### Task Tools

See [Tasks documentation](./tasks.md#agent-integration) for details.

#### `pilot_task_create`

Create a new task.

#### `pilot_task_update`

Update an existing task.

#### `pilot_task_query`

Query tasks with filters.

#### `pilot_task_comment`

Add a comment to a task.

### Memory Tools (Coming Soon)

The agent can read memory using slash commands (see below), but direct memory modification tools are planned for a future release.

---

## Tool Execution

### Sandboxed vs. Immediate Execution

| Tool | Sandboxed? | Approval Required? |
|------|------------|--------------------|
| `read` | No | No |
| `write` | **Yes** | **Yes** |
| `edit` | **Yes** | **Yes** |
| `bash` (read-only) | No | No |
| `bash` (destructive) | **Yes** | **Yes** |
| `pilot_task_create` | **Yes** | **Yes** |
| `pilot_task_update` | **Yes** | **Yes** |
| `pilot_task_query` | No | No |
| `pilot_task_comment` | **Yes** | **Yes** |

### Reviewing Staged Changes

When the agent uses a sandboxed tool:

1. **Context Panel Switches to Changes Tab**  
   The right panel automatically shows the Changes tab

2. **Diff Appears**  
   - File path at the top
   - Red lines: deletions
   - Green lines: additions
   - Gray lines: context (unchanged)

3. **Accept or Reject**  
   - Click **Accept** to apply the change to disk
   - Click **Reject** to discard the change
   - Click **Accept All** to apply all pending changes at once

4. **Agent Continues**  
   After you review, the agent receives feedback:
   - "User accepted the change" → agent knows it succeeded
   - "User rejected the change" → agent can try a different approach

### YOLO Mode

**YOLO mode** (You Only Live Once) auto-accepts all file changes.

**Enable YOLO Mode**:
1. Open [Settings](./settings.md#project): `Cmd+,` → Project tab
2. Toggle **"YOLO Mode"**
3. **Warning**: All file changes will be applied immediately without review

**When to Use YOLO Mode**:
- Prototyping or experimenting
- Working on a throwaway branch
- You trust the agent completely (risky!)

**When NOT to Use YOLO Mode**:
- Production code
- Shared branches
- Critical files
- Anytime mistakes could be costly

**Disabling YOLO Mode**:
- Open Settings and toggle it off
- Returns to normal sandboxed behavior

---

## Slash Commands

Slash commands are special messages that trigger specific agent behaviors.

### Available Slash Commands

| Command | Description |
|---------|-------------|
| `/tasks` | Show all tasks for the current project |
| `/tasks open` | Show only open tasks |
| `/tasks P0` | Show only P0 (critical) tasks |
| `/tasks bug` | Show only bugs |
| `/memory` | Show all memory entries |
| `/memory global` | Show only global memory |
| `/memory project` | Show only project memory |
| `/git` | Show git status and recent commits |
| `/git status` | Show git status (uncommitted changes) |
| `/git log` | Show recent commit history |
| `/files` | List project files (directory tree) |
| `/help` | Show help and available commands |

### Using Slash Commands

Type a slash command in the chat input and press Enter:

```
/tasks open
```

The agent will:
1. Recognize the slash command
2. Execute the appropriate tool (`pilot_task_query`, memory read, git status, etc.)
3. Format the results in a readable way
4. Display the response in the chat

**Example**:
```
User: /tasks P0
Agent: Here are your P0 tasks:
- TASK-001 (open): Fix memory injection bug
- TASK-015 (in_progress): Resolve git status not updating
```

---

## Agent Context

### What the Agent Knows

In every message, the agent has access to:

1. **Project Context**  
   - Current project path
   - File tree structure (summarized)
   - Programming languages detected
   - README contents (if present)

2. **Memory**  
   - [Global memory](./memory.md#global-memory) (your preferences, conventions)
   - [Project memory](./memory.md#project-memory) (team context, checked into git)

3. **Git State**  
   - Current branch
   - Uncommitted changes (staged, unstaged)
   - Recent commit history

4. **Tasks**  
   - Open tasks (via `/tasks` or `pilot_task_query`)
   - Task dependencies and blockers

5. **Chat History**  
   - All previous messages in the session
   - Tool execution results
   - User feedback (accepted/rejected changes)

6. **Active Files**  
   - Files you've opened in the file preview
   - Selected lines or regions

### What the Agent Doesn't Know

- **Other sessions**: Sessions are isolated (no cross-session context)
- **Other projects**: Only the current project's context is loaded
- **Your local environment**: Cannot access files outside the project directory
- **External services**: Cannot make network requests (unless you run `bash curl ...`)
- **Your screen**: Cannot see the UI (only what you tell it)

---

## Agent Limitations

### Context Window

AI models have a **context window limit** (e.g., 128K tokens for GPT-4).

**What happens when the limit is reached?**
- Older messages are summarized or truncated
- Memory is always preserved (highest priority)
- Tool results are truncated to fit

**Best Practices**:
- Start a new session for unrelated work (keeps context focused)
- Extract important context to [Memory](./memory.md) (preserved across sessions)
- Use multiple tabs for parallel work (each has its own context)

### Tool Limitations

- **File size**: Very large files (>50KB) are truncated when read
- **Bash timeout**: Long-running commands may time out
- **Project jail**: The agent cannot access files outside the project directory
- **No network access**: The agent cannot make HTTP requests directly (use `bash curl ...` if needed)

### Model Limitations

- **Knowledge cutoff**: The model's training data has a cutoff date (ask the agent for its cutoff)
- **Hallucinations**: The agent may generate incorrect information (always verify critical details)
- **No real-time data**: The agent doesn't have access to live data (stock prices, weather, etc.)

---

## Multi-Model Support

Pilot supports multiple AI providers and models:

### Switching Models

**In a Session**:
1. Click the **model name** in the chat header
2. Select a different model from the dropdown
3. The next message will use the new model

**In Settings**:
1. Open Settings: `Cmd+,` → General tab
2. Set the **default model** for new sessions

### Supported Providers

| Provider | Models | Notes |
|----------|--------|-------|
| **OpenAI** | GPT-4, GPT-4 Turbo, GPT-3.5 Turbo | Best general-purpose performance |
| **Anthropic** | Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku | Excellent code generation, long context |
| **Google** | Gemini 1.5 Pro, Gemini 1.5 Flash | Fast, cost-effective |
| **Local** | Ollama models (Llama, CodeLlama, etc.) | Privacy, no API costs |

**API Keys**: Configure in Settings → Auth tab.

### Model Characteristics

| Model | Strengths | Use When |
|-------|-----------|----------|
| **GPT-4 Turbo** | Strong reasoning, broad knowledge | Complex tasks, planning, architecture |
| **Claude 3.5 Sonnet** | Excellent code quality, precise edits | Refactoring, code review, tests |
| **Gemini 1.5 Pro** | Fast, long context, cost-effective | Large codebases, many files |
| **GPT-3.5 Turbo** | Fast, cheap | Simple tasks, prototyping |

---

## Agent Best Practices

### Clear Instructions

**Good**:
```
Refactor the IPC handlers in electron/ipc/ to use async/await instead of callbacks
```

**Poor**:
```
Fix the code
```

Be specific about:
- **What** needs to be done
- **Where** in the codebase
- **Why** (if context helps)

### Iterative Refinement

Don't expect perfection on the first try:
1. Ask the agent to make a change
2. Review the result
3. Ask for adjustments if needed
4. Repeat until satisfied

**Example**:
```
User: Add a new button to the sidebar
Agent: [Proposes code]
User: The button should be blue and have an icon
Agent: [Updates code]
User: Perfect, accept the change
```

### Use Slash Commands

Slash commands provide structured data:
- `/tasks` is better than "show me the tasks"
- `/git status` is better than "what changed"
- `/memory` is better than "what do you remember"

### Let the Agent Plan

For complex tasks, ask the agent to plan first:
```
User: I need to add a terminal feature
Agent: Here's my plan:
1. Add a TerminalService in electron/services/
2. Create a Terminal UI component in src/components/
3. Add IPC handlers for terminal operations
4. Integrate with the dev commands system

Should I proceed?
User: Yes, go ahead
Agent: [Starts implementing step 1...]
```

### Review All Changes

Even in YOLO mode, review the changes afterward:
- Check git diff: `git diff`
- Test the changes: Run the app, run tests
- Revert if needed: `git checkout -- <file>`

---

## Security & Privacy

### Sandboxing

Pilot's sandboxing protects you from:
- **Accidental deletions**: File changes are staged, not applied immediately
- **Path traversal**: Agent cannot access files outside the project directory
- **Destructive commands**: `rm`, `mv`, and other dangerous bash commands require approval

### API Key Security

- API keys are stored in `<PILOT_DIR>/auth.json`
- File permissions are set to `600` (readable only by you)
- Keys are never included in memory or sent to the agent
- OAuth tokens are refreshed automatically

### Data Privacy

**What's sent to AI providers**:
- Your messages
- Project context (file paths, file contents the agent reads)
- Memory entries
- Tool execution results

**What's NOT sent**:
- API keys or credentials
- Files the agent hasn't read
- Other projects' data
- Your system information (beyond project directory)

**Best Practices**:
- Don't include secrets in memory or code
- Use environment variables for API keys
- Review memory before sharing projects (`.pilot/MEMORY.md` may be committed)
- Use global memory for personal preferences that shouldn't be committed to git

---

## Troubleshooting

### Agent Not Responding

**Check**:
1. Model is selected (click model name in chat header)
2. API key is configured (Settings → Auth)
3. Internet connection is active
4. Check developer console for errors (`Cmd+Shift+I`)

### Agent Making Incorrect Changes

**Solutions**:
1. **Reject the change** (click "Reject" in the diff panel)
2. **Clarify your request**: Be more specific about what you want
3. **Provide examples**: Show the agent what you expect
4. **Update memory**: Add conventions or patterns to [Memory](./memory.md)

### Agent Can't Find Files

**Check**:
1. Project is assigned to the session (project name in tab header)
2. File exists at the path you mentioned
3. File is not outside the project directory

**Solution**:
```
User: List files in src/components/
Agent: [Shows file tree]
User: Read src/components/TaskCard.tsx
```

### Tool Execution Fails

**Check the error message**:
- "File not found" → Check the path
- "Permission denied" → Check file permissions
- "Command not found" → Check if the tool is installed (npm, git, etc.)

---

## Related Documentation

- **[Sessions](./sessions.md)** — How sessions work and context management
- **[Memory](./memory.md)** — How to provide context to the agent
- **[Tasks](./tasks.md)** — Agent task tools and integration
- **[Context Panel](./context-panel.md)** — Reviewing staged changes
- **[Settings](./settings.md)** — Configuring models, API keys, YOLO mode

[← Back to Documentation](./index.md)
