# Plugins

> Pilot plugins extend the GUI with new panels, views, status bar items, and agent capabilities.

## Quick Start

```bash
# Scaffold a new plugin
pilot plugin init my-awesome-plugin

# Install dependencies
cd my-awesome-plugin && npm install

# Start dev mode (watches for changes)
pilot plugin dev ./

# Build for distribution
npm run build
```

## Plugin Structure

```
my-awesome-plugin/
├── package.json       # Plugin manifest + dependencies
├── tsconfig.json      # TypeScript config
└── src/
    └── plugin.ts      # Entry point — exports activate()
```

## Writing a Plugin

```typescript
import { activate, type PluginAPI } from '@pilot/plugin-sdk';

activate((pilot: PluginAPI) => {
  // Register a sidebar view
  pilot.contributions.registerTreeView('my-view', {
    title: 'My Plugin',
    location: 'sidebar',
    getChildren: async () => [
      { id: '1', label: 'Item 1' },
      { id: '2', label: 'Item 2' },
    ],
  });

  // Add a status bar item
  pilot.contributions.createStatusBarItem('my-status', {
    text: 'My Plugin active',
    alignment: 'right',
    priority: 100,
  });

  // Register an agent tool
  pilot.agent.registerTool({
    name: 'my_tool',
    description: 'My custom agent tool',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
    execute: async (toolCallId, params) => ({
      content: [{ type: 'text', text: `Results for: ${params.query}` }],
    }),
  });

  // Listen to agent events
  pilot.agent.on('tool_call', (event) => {
    if (event.toolName === 'bash' && event.input?.command?.includes('rm -rf')) {
      return { block: true, reason: 'Dangerous command blocked' };
    }
  });

  // Cleanup
  return () => {
    console.log('Plugin deactivated');
  };
});
```

## Contribution Points

### Views
Tree views and webview panels in the sidebar or right panel.

### Status Bar
Left and right-aligned status bar text with tooltips and click commands.

### Context Menus
Add items to right-click menus on files, messages, and tabs.

### Settings
Add custom settings sections in the Settings modal.

### Tab Types
Register new tab types (e.g., A2A conversations, CI dashboards).

### Chat Message Renderers
Custom rendering for agent tool results in chat messages.

### Commands
Register commands that appear in the command palette and can be bound to keybindings.

## Agent Integration

### Tools
Register tools the AI agent can call. Tools are injected at runtime — no reload needed.

### Skills
Register system prompt fragments the agent considers during conversations.

### Events
Subscribe to agent events to block tool calls, modify results, or inject context.

## Permissions

Plugins declare permissions in `package.json` under `pilot.permissions`:

| Permission | Description |
|-----------|-------------|
| `ui:sidebar` | Add views to the sidebar |
| `ui:panel` | Add views to the right panel |
| `ui:status-bar` | Add items to the status bar |
| `ui:settings` | Add settings sections |
| `ui:tabs` | Register tab types |
| `ui:chat-renderer` | Register message renderers |
| `agent:tools` | Register agent tools |
| `agent:skills` | Register agent skills |
| `agent:events` | Listen to agent events |
| `network:*` | Make network requests |

## Debugging

```bash
# Start Pilot with plugin debug mode
pilot --plugin-debug

# Attach Chrome DevTools to localhost:9229
```

## Publishing

```bash
# To npm
npm publish

# Users install with:
pilot plugin install my-awesome-plugin
```

## API Reference

### `activate(fn)`

Declares the plugin entry point. The function receives a `PluginAPI` object.

### `PluginAPI.contributions`

GUI contribution registration methods:

- `registerTreeView(id, options)` — Register a tree view
- `registerWebviewView(id, options)` — Register a webview panel
- `createStatusBarItem(id, options)` — Create a status bar item
- `registerContextMenu(options)` — Register context menu items
- `registerTabType(id, options)` — Register a custom tab type
- `registerMessageRenderer(id, options)` — Register a message renderer
- `registerSettingsSection(id, options)` — Register a settings section
- `registerCommand(id, options)` — Register a command

### `PluginAPI.agent`

Agent integration methods:

- `registerTool(definition)` — Register an agent tool
- `removeTool(name)` — Remove a tool
- `registerSkill(content, options)` — Register a skill
- `removeSkill(id)` — Remove a skill
- `on(event, handler)` — Subscribe to agent events
- `off(event, handler)` — Unsubscribe from events

### `PluginAPI.storage`

Persistent storage:

- `get<T>(key)` — Get a value
- `set<T>(key, value)` — Set a value
- `delete(key)` — Delete a key
- `keys()` — List all keys

### `PluginAPI.workspace`

Workspace information:

- `projectPath` — Current project path (or null)
- `onDidChangeProject(callback)` — Subscribe to project changes
