# Phase 3 — Agent Integration

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Enable plugins to interact with the AI agent — register custom tools (via SessionToolInjector), register skills (injected into system prompt), listen to agent events (tool_call, tool_result, etc.), and have those events forwarded through PluginBridge to the Extension Host. User approval gates all agent-side capabilities.

**Architecture:** Three interception points: (1) `SandboxedTools` gains a generic tool wrapper that calls `pluginBridge.forwardAgentEvent()` before/after every tool execution, (2) `PilotSessionManager` forwards agent lifecycle events to `pluginBridge`, (3) `pi-session-config.ts` accepts plugin skills for system prompt injection. Tool registration flows through `SessionToolInjector` (already exists).

**Tech Stack:** Pi SDK, SessionToolInjector, sandboxed-tools.ts, pi-session-config.ts, plugin-bridge.ts (Phase 1).

---

## Task 1: Add Generic Tool Wrapper to SandboxedTools

**Files:**
- Modify: `electron/services/sandboxed-tools.ts`

**Step 1: Import PluginBridge**

At the top of `sandboxed-tools.ts`:

```typescript
import { pluginBridge } from './plugin-bridge';
```

**Step 2: Add the generic tool wrapper function**

Add this function before `createSandboxedTools`:

```typescript
/**
 * Wrap a tool definition with plugin before/after interception.
 * The wrapper calls pluginBridge.forwardAgentEvent('tool_call') before
 * execution and pluginBridge.forwardAgentEvent('tool_result') after.
 *
 * Short-circuits to a direct passthrough if no plugin is interested in
 * this tool's events.
 */
function wrapToolWithPluginHooks(tool: ToolDefinition): ToolDefinition {
  return {
    name: tool.name,
    label: tool.label,
    description: tool.description,
    parameters: tool.parameters,
    promptSnippet: (tool as any).promptSnippet,
    promptGuidelines: (tool as any).promptGuidelines,
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      // Only forward if plugins have subscribed to tool events
      const hasToolCallSubs = pluginBridge.hasSubscribersFor('tool_call');
      const hasToolResultSubs = pluginBridge.hasSubscribersFor('tool_result');

      if (!hasToolCallSubs && !hasToolResultSubs) {
        // Fast path: no plugins interested, execute directly
        return tool.execute(toolCallId, params, signal, onUpdate, ctx);
      }

      // Before: forward to plugins, allow blocking
      if (hasToolCallSubs) {
        const beforeResult = await pluginBridge.forwardAgentEvent({
          name: 'tool_call',
          toolName: tool.name,
          toolCallId,
          input: params as Record<string, unknown>,
        });

        if (beforeResult.block) {
          return {
            content: [{
              type: 'text',
              text: `Tool "${tool.name}" blocked by plugin: ${beforeResult.reason || 'No reason given'}`,
            }],
            details: { blocked: true, reason: beforeResult.reason },
          };
        }

        // Apply input mutations from plugins
        if (beforeResult.patchedInput) {
          Object.assign(params, beforeResult.patchedInput);
        }
      }

      // Execute the actual tool
      const result = await tool.execute(toolCallId, params, signal, onUpdate, ctx);

      // After: forward result to plugins, allow modification
      if (hasToolResultSubs) {
        const afterResult = await pluginBridge.forwardAgentEvent({
          name: 'tool_result',
          toolName: tool.name,
          toolCallId,
          input: params as Record<string, unknown>,
          result,
        });

        if (afterResult.modifiedResult !== undefined) {
          return afterResult.modifiedResult;
        }
      }

      return result;
    },
  } as ToolDefinition;
}
```

**Step 3: Wrap all tools with plugin hooks**

At the end of `createSandboxedTools`, before the return statement, wrap every tool:

```typescript
  // Wrap all tools with plugin interception hooks
  const wrappedTools = [sandboxedEdit, sandboxedWrite, sandboxedBash].map(wrapToolWithPluginHooks);
  const wrappedReadOnlyTools = readOnlyToolDefs.map(wrapToolWithPluginHooks);

  return {
    tools: wrappedTools,
    readOnlyTools: wrappedReadOnlyTools,
  };
```

**Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p tsconfig.node.json 2>&1 | head -20
```

**Step 5: Commit**

```bash
git add electron/services/sandboxed-tools.ts
git commit -m "feat(plugins): add generic tool wrapper for plugin interception"
```

---

### Task 2: Forward Agent Events Through PluginBridge

**Files:**
- Modify: `electron/services/pi-session-manager.ts`

**Step 1: Import PluginBridge**

At the top of `pi-session-manager.ts`:

```typescript
import { pluginBridge } from './plugin-bridge';
```

**Step 2: Forward session events to PluginBridge**

In the `initSession` method (or wherever session event listeners are set up), after the existing event listener, add plugin forwarding. Look for the pattern where events are broadcast to the renderer and add a forward call:

```typescript
session.on('event', (event: AgentSessionEvent) => {
  // Existing: broadcast to renderer
  this.sendToRenderer(IPC.AGENT_EVENT, { tabId, event });

  // New: forward agent lifecycle events to PluginBridge
  const eventMapping: Record<string, string> = {
    'agent_start': 'agent_start',
    'agent_end': 'agent_end',
    'turn_start': 'turn_start',
    'turn_end': 'turn_end',
  };

  const mappedName = eventMapping[event.type];
  if (mappedName && pluginBridge.hasSubscribersFor(mappedName)) {
    pluginBridge.forwardAgentEvent({
      name: mappedName,
      message: event,
    }).catch(err => {
      console.error(`Plugin agent event forward failed (${mappedName}):`, err);
    });
  }
});
```

**Step 3: Also forward message events**

If PilotSessionManager has access to message_start/update/end events, forward those too:

```typescript
// Forward message events to plugin subscribers
if (event.type === 'message_end' && pluginBridge.hasSubscribersFor('message_end')) {
  pluginBridge.forwardAgentEvent({
    name: 'message_end',
    message: event,
  }).catch(() => {});
}
```

**Step 4: Forward session lifecycle events**

On session create/continue/dispose:

```typescript
// On session creation:
pluginBridge.forwardAgentEvent({
  name: 'session_start',
  prompt: `Session started for tab ${tabId}`,
}).catch(() => {});

// On session disposal:
pluginBridge.forwardAgentEvent({
  name: 'session_shutdown',
  prompt: `Session shutting down for tab ${tabId}`,
}).catch(() => {});
```

**Step 5: Commit**

```bash
git add electron/services/pi-session-manager.ts
git commit -m "feat(plugins): forward agent events through PluginBridge"
```

---

### Task 3: Wire Plugin Tool Registration Through SessionToolInjector

**Files:**
- Modify: `electron/services/plugin-bridge.ts`

**Step 1: Add tool registration handling**

In `PluginBridge`, add a method to register tools with the active sessions. This needs a reference to `PilotSessionManager`:

```typescript
private sessionManager: any = null;

/** Set the PilotSessionManager reference (called during wiring). */
setSessionManager(sm: any): void {
  this.sessionManager = sm;
}

/**
 * Register a tool from a plugin with all active agent sessions.
 * Uses SessionToolInjector for runtime injection.
 */
async registerPluginTool(
  pluginId: string,
  toolDefinition: any,
  projectPath: string,
): Promise<void> {
  if (!this.checkPermission(pluginId, 'agent:tools')) {
    throw new Error(`Plugin ${pluginId} lacks agent:tools permission`);
  }

  // User approval must happen before this is called.
  // The actual approval flow is in Task 5.

  // Inject into all sessions for the given project
  if (this.sessionManager) {
    const session = this.sessionManager.getSessionForProject?.(projectPath);
    if (session) {
      const { injectTools } = require('./session-tool-injector');
      injectTools(session, [toolDefinition]);
    }
  }
}
```

**Step 2: Handle agent/registerTool RPC with full implementation**

In `handleIncomingRequest` within `plugin-bridge.ts`, update the `agent/registerTool` case:

```typescript
case 'agent/registerTool': {
  const p = params as {
    pluginId: string;
    toolName: string;
    toolDefinition: any;
    projectPath: string;
  };
  if (!this.checkPermission(p.pluginId, 'agent:tools')) {
    this.sendResponse(id!, {
      error: { code: -32001, message: 'Permission denied: agent:tools required' }
    });
    return;
  }

  try {
    await this.registerPluginTool(p.pluginId, p.toolDefinition, p.projectPath);
    this.sendResponse(id!, { result: { ok: true } });
  } catch (err) {
    this.sendResponse(id!, {
      error: {
        code: -32000,
        message: err instanceof Error ? err.message : 'Failed to register tool',
      }
    });
  }
  break;
}
```

**Step 3: Wire sessionManager reference in main/index.ts**

In `electron/main/index.ts`, after creating the sessionManager, set the reference:

```typescript
pluginBridge.setSessionManager(sessionManager);
```

**Step 4: Commit**

```bash
git add electron/services/plugin-bridge.ts electron/main/index.ts
git commit -m "feat(plugins): wire plugin tool registration through SessionToolInjector"
```

---

### Task 4: Add Plugin Skill Injection to Prompt Assembly

**Files:**
- Modify: `electron/services/pi-session-config.ts`
- Modify: `electron/services/plugin-bridge.ts`

**Step 1: Add skill storage to PluginBridge**

In `plugin-bridge.ts`, add a skill registry:

```typescript
private pluginSkills = new Map<string, Array<{ skillId: string; content: string }>>();

/** Register a skill from a plugin. */
registerSkill(pluginId: string, skillId: string, content: string): void {
  if (!this.pluginSkills.has(pluginId)) {
    this.pluginSkills.set(pluginId, []);
  }
  this.pluginSkills.get(pluginId)!.push({ skillId, content });
}

/** Remove a skill. */
removeSkill(pluginId: string, skillId: string): void {
  const skills = this.pluginSkills.get(pluginId);
  if (skills) {
    const idx = skills.findIndex(s => s.skillId === skillId);
    if (idx >= 0) skills.splice(idx, 1);
  }
}

/** Get all plugin skills as a concatenated string for prompt injection. */
getAllSkills(): string {
  const parts: string[] = [];
  for (const skills of this.pluginSkills.values()) {
    for (const skill of skills) {
      parts.push(skill.content);
    }
  }
  return parts.join('\n\n');
}
```

**Step 2: Handle agent/registerSkill RPC**

In `handleIncomingRequest`:

```typescript
case 'agent/registerSkill': {
  const p = params as { pluginId: string; skillId: string; content: string };
  if (!this.checkPermission(p.pluginId, 'agent:skills')) {
    this.sendResponse(id!, {
      error: { code: -32001, message: 'Permission denied: agent:skills required' }
    });
    return;
  }
  this.registerSkill(p.pluginId, p.skillId, p.content);
  this.sendResponse(id!, { result: { ok: true } });
  break;
}
```

**Step 3: Inject plugin skills into system prompt**

In `pi-session-config.ts`, in the `buildSessionConfig` function, after loading existing memory and skills context, inject plugin skills:

```typescript
import { pluginBridge } from './plugin-bridge';

// ... in the system prompt assembly section:
const pluginSkills = pluginBridge.getAllSkills();
if (pluginSkills) {
  // Append plugin skills to the system prompt builder or resource loader
  // This depends on how skills are currently injected — 
  // typically they're appended to the custom system prompt
  systemPromptParts.push(pluginSkills);
}
```

**Step 4: Commit**

```bash
git add electron/services/plugin-bridge.ts electron/services/pi-session-config.ts
git commit -m "feat(plugins): add plugin skill injection to prompt assembly"
```

---

### Task 5: User Approval Flow for Agent Capabilities

**Files:**
- Modify: `electron/services/plugin-bridge.ts`
- Create: `src/components/plugins/PluginPermissionPrompt.tsx`

**Step 1: Add pending approval tracking to PluginBridge**

In `plugin-bridge.ts`:

```typescript
interface PendingApproval {
  pluginId: string;
  pluginName: string;
  requestedPermissions: Array<{ type: 'tool' | 'skill'; name: string; description?: string }>;
  resolve: (approved: boolean) => void;
}

private pendingApprovals = new Map<string, PendingApproval>();

/**
 * Request user approval for a plugin to add agent tools or skills.
 * Emits a PLUGIN_EVENT that the renderer picks up and shows an approval dialog.
 * Returns a Promise that resolves when the user approves or denies.
 */
requestAgentApproval(
  pluginId: string,
  pluginName: string,
  capabilities: Array<{ type: 'tool' | 'skill'; name: string; description?: string }>,
): Promise<boolean> {
  return new Promise((resolve) => {
    const approvalId = randomUUID();
    this.pendingApprovals.set(approvalId, {
      pluginId,
      pluginName,
      requestedPermissions: capabilities,
      resolve,
    });

    // Forward to renderer
    broadcastToRenderer(IPC.PLUGIN_EVENT, {
      type: 'agent-approval-required',
      pluginId,
      data: {
        approvalId,
        pluginId,
        pluginName,
        capabilities,
      },
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      if (this.pendingApprovals.has(approvalId)) {
        this.pendingApprovals.delete(approvalId);
        resolve(false);
      }
    }, 300_000);
  });
}

/** Resolve a pending approval (called from renderer via IPC). */
resolveApproval(approvalId: string, approved: boolean): void {
  const pending = this.pendingApprovals.get(approvalId);
  if (pending) {
    this.pendingApprovals.delete(approvalId);
    pending.resolve(approved);
  }
}
```

**Step 2: Add APPROVE_AGENT_CAPABILITY IPC channel**

In `shared/ipc.ts`:

```typescript
PLUGIN_APPROVE_AGENT_CAPABILITY: 'plugin:approve-agent-capability',
```

**Step 3: Register the IPC handler**

In `electron/ipc/plugins.ts`:

```typescript
ipcMain.handle(
  IPC.PLUGIN_APPROVE_AGENT_CAPABILITY,
  async (_event, approvalId: string, approved: boolean) => {
    pluginBridge.resolveApproval(approvalId, approved);
  }
);
```

**Step 4: Create the permission prompt UI in renderer**

Create `src/components/plugins/PluginPermissionPrompt.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { usePluginStore } from '../../stores/plugin-store';
import { IPC } from '../../../shared/ipc';
import { invoke, onEvent } from '../../lib/ipc-client';

interface ApprovalRequest {
  approvalId: string;
  pluginId: string;
  pluginName: string;
  capabilities: Array<{ type: 'tool' | 'skill'; name: string; description?: string }>;
}

export default function PluginPermissionPrompt() {
  const [request, setRequest] = useState<ApprovalRequest | null>(null);

  useEffect(() => {
    return onEvent(IPC.PLUGIN_EVENT, (payload: any) => {
      if (payload.type === 'agent-approval-required') {
        setRequest(payload.data);
      }
    });
  }, []);

  if (!request) return null;

  async function handleResponse(approved: boolean) {
    await invoke(IPC.PLUGIN_APPROVE_AGENT_CAPABILITY, request!.approvalId, approved);
    setRequest(null);
  }

  const tools = request.capabilities.filter(c => c.type === 'tool');
  const skills = request.capabilities.filter(c => c.type === 'skill');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-bg-elevated border border-border rounded-xl shadow-2xl w-96 p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-2">
          Plugin Request
        </h2>
        <p className="text-text-secondary text-sm mb-4">
          <strong className="text-text-primary">{request.pluginName}</strong> wants to add agent capabilities:
        </p>

        {tools.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-semibold text-text-secondary uppercase mb-1.5">Tools</p>
            {tools.map(t => (
              <div key={t.name} className="flex items-center gap-2 py-1">
                <span className="text-xs text-text-primary">• {t.name}</span>
                {t.description && (
                  <span className="text-xs text-text-secondary">{t.description}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {skills.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-text-secondary uppercase mb-1.5">Skills</p>
            {skills.map(s => (
              <div key={s.name} className="flex items-center gap-2 py-1">
                <span className="text-xs text-text-primary">• {s.name}</span>
                {s.description && (
                  <span className="text-xs text-text-secondary">{s.description}</span>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-text-secondary mb-4">
          These will be added to the coding agent. You can remove them later from Settings → Plugins.
        </p>

        <div className="flex gap-2 justify-end">
          <button
            onClick={() => handleResponse(false)}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Deny
          </button>
          <button
            onClick={() => handleResponse(true)}
            className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 5: Render the prompt in app.tsx**

In `src/app.tsx`, add:

```tsx
import PluginPermissionPrompt from './components/plugins/PluginPermissionPrompt';

// In the JSX, alongside other global overlays:
<PluginPermissionPrompt />
```

**Step 6: Update Extension Host to use approval flow**

In `extension-host.ts`, update the `registerTool` method to first request approval:

```typescript
async registerTool(definition) {
  // This calls PluginBridge, which emits the approval request
  return sendRequest('agent/registerTool', {
    pluginId,
    toolName: definition.name as string,
    toolDefinition: definition,
  });
},
```

**Step 7: Commit**

```bash
git add electron/services/plugin-bridge.ts shared/ipc.ts electron/ipc/plugins.ts src/components/plugins/PluginPermissionPrompt.tsx src/app.tsx electron/services/extension-host.ts
git commit -m "feat(plugins): add user approval flow for agent capabilities"
```

---

### Task 6: End-to-End Test — Plugin with Agent Tools

**Step 1: Create a test plugin with agent capabilities**

Create `test-plugins/agent-test/package.json`:

```json
{
  "name": "agent-test-plugin",
  "version": "1.0.0",
  "pilot": {
    "plugins": ["./plugin.js"],
    "permissions": ["agent:tools", "agent:skills", "agent:events"]
  }
}
```

Create `test-plugins/agent-test/plugin.js`:

```javascript
function activate(pilot) {
  console.log('Agent Test plugin activated!');

  // Register a custom tool
  pilot.agent.registerTool({
    name: 'plugin_hello',
    label: 'PluginHello',
    description: 'Say hello from a plugin tool',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name to greet' }
      },
      required: ['name']
    },
    execute: async (toolCallId, params) => {
      return {
        content: [{ type: 'text', text: `Hello ${params.name} from the plugin!` }],
        details: {}
      };
    }
  });

  // Register a skill
  pilot.agent.registerSkill(
    'When working with JSON files, always validate the schema before modifying.',
    { scope: 'project' }
  );

  // Listen to tool calls
  pilot.agent.on('tool_call', (event) => {
    console.log('Plugin saw tool call:', event.toolName);
    if (event.toolName === 'bash' && event.input?.command?.includes('sudo')) {
      return { block: true, reason: 'sudo commands blocked by agent-test plugin' };
    }
    return {};
  });

  // Listen to tool results
  pilot.agent.on('tool_result', (event) => {
    console.log('Plugin saw tool result:', event.toolName);
    return {};
  });

  return () => {
    console.log('Agent Test plugin deactivated');
  };
}

module.exports = { default: activate };
```

**Step 2: Manual verification checklist**

- [ ] Install the plugin via IPC `plugin:install`
- [ ] User sees approval prompt listing `plugin_hello` tool and the JSON skill
- [ ] User clicks "Allow"
- [ ] In a session, agent can call `plugin_hello` tool
- [ ] The system prompt includes the JSON validation skill text
- [ ] If agent runs `sudo ...`, the tool call is blocked with the plugin's reason
- [ ] If plugin is removed, `plugin_hello` tool disappears from agent's tool list

**Step 3: Commit**

```bash
git add test-plugins/agent-test/
git commit -m "test(plugins): add agent integration test plugin"
git commit --allow-empty -m "feat(plugins): Phase 3 agent integration complete"
```

---

### Phase 3 Completion Checklist

- [ ] Generic tool wrapper wraps all tools with plugin before/after hooks
- [ ] Tool wrapper short-circuits when no plugins subscribed
- [ ] Agent lifecycle events forwarded to PluginBridge
- [ ] Plugin tools registered via SessionToolInjector at runtime
- [ ] Plugin skills injected into system prompt assembly
- [ ] User approval prompt shown for agent capabilities
- [ ] Approved tools appear in agent's tool list
- [ ] Approved skills appear in system prompt
- [ ] Plugin event handlers (tool_call, tool_result) receive events
- [ ] Blocking a tool call prevents execution
- [ ] Removing a plugin removes its tools
