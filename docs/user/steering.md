# Steering & Follow-up

Pilot lets you send messages to the AI agent while it's actively working. This mirrors the steering system from the Pi TUI — you can redirect the agent mid-task or queue instructions for after it finishes.

## Overview

When the agent is **streaming** (actively generating a response or running tools), the chat input switches to **steering mode**. You have three options:

| Action | Key | What happens |
|--------|-----|-------------|
| **Steer** | `Enter` | Interrupts the agent after its current tool finishes. Remaining queued tools are skipped. The agent sees your message immediately. |
| **Follow-up** | `Alt+Enter` | Queues your message. It's delivered only after the agent finishes all current work (tool calls, steering messages). |
| **Stop** | Click stop button | Aborts the agent entirely. All queued messages are discarded. |

When the agent is **idle**, `Enter` sends a normal message as usual.

## Steering (Enter)

Steering lets you **redirect the agent while it's working**. This is useful when:

- The agent is going down the wrong path
- You want to add context or constraints mid-task
- You need to change priorities before it finishes

**How it works:**

1. Type your message while the agent is streaming
2. Press `Enter`
3. The agent finishes its current tool execution
4. Remaining queued tool calls are **skipped**
5. Your steering message is delivered as a new user message
6. The agent responds to your steering instruction

You can queue multiple steering messages. They're delivered one at a time by default (configurable via `steeringMode` setting).

## Follow-up (Alt+Enter)

Follow-up messages are **queued for later** — the agent won't see them until it's completely done with its current work. This is useful when:

- You want to add a next step without interrupting current work
- You have additional instructions that should come after the agent finishes
- You want to chain tasks: "after you're done with X, also do Y"

**How it works:**

1. Type your message while the agent is streaming
2. Press `Alt+Enter` (or `Option+Enter` on macOS)
3. Your message is queued as a follow-up
4. The agent continues its current work uninterrupted
5. After all tool calls and steering messages are processed, your follow-up is delivered
6. The agent starts a new response for your follow-up

## Visual Indicators

### Input Area

When the agent is streaming:

- The input border turns **amber** to indicate steering mode
- The placeholder text changes to *"Steer the agent (Alt+Enter to follow-up)..."*
- Two action buttons appear when you type:
  - **Amber ⚡ button** — Steer (Enter)
  - **Blue 🕐 button** — Follow-up (Alt+Enter)
- When input is empty, only the **red ■ Stop** button is shown

### Queued Messages

Pending messages appear as colored pills above the input box:

- **Amber pills with ⚡** — Pending steering messages (will interrupt)
- **Blue pills with 🕐** — Pending follow-up messages (will wait)

The pills are automatically cleared when:

- The agent finishes its response (`agent_end`)
- Messages are consumed by the agent (`turn_end` refreshes the queue)
- You abort the agent (all queued messages are discarded)

## Examples

### Redirecting a wrong approach

The agent starts refactoring a file the wrong way:

1. Agent is streaming, running tools...
2. You type: *"Stop — use the strategy pattern instead of if/else chains"*
3. Press `Enter` to steer
4. Agent finishes current tool, skips remaining tools, reads your message
5. Agent follows your new direction

### Chaining tasks

The agent is implementing a feature:

1. Agent is streaming, writing code...
2. You type: *"After you're done, also add unit tests for the new functions"*
3. Press `Alt+Enter` to queue as follow-up
4. Agent finishes the feature implementation
5. Agent then sees your follow-up and writes the tests

### Multiple steering messages

1. Agent is working on a complex task...
2. You steer: *"Focus on the error handling first"* → `Enter`
3. You follow-up: *"Then update the README"* → `Alt+Enter`
4. Agent finishes current tool, gets the steering message about error handling
5. After completing error handling, gets the follow-up about README

## Tips

- **Steer early, steer often** — Don't wait for the agent to finish if it's going the wrong way. A quick steer saves time.
- **Use follow-up for sequences** — Queue your next task as a follow-up so you don't forget while the agent works.
- **Alt+Enter is safe** — Follow-ups never interrupt. Use them when you're not sure if the agent needs redirecting.
- **Watch the queue pills** — They show what's pending so you know what the agent will see next.
- **Stop is final** — Aborting discards all queued messages. Use steer if you want to redirect rather than stop.

---

**See also:** [Agent](agent.md) · [Sessions](sessions.md) · [Keyboard Shortcuts](keyboard-shortcuts.md)
