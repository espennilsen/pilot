# Phase 2 — GUI Contribution Slots

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Render plugin contributions in the Pilot GUI — sidebar views, right-panel views, status bar items, context menus, settings sections, custom tab types, and chat message renderers — so a plugin with GUI contributions is fully visible in the UI.

**Architecture:** The renderer already has defined UI zones (sidebar panes, right-panel tabs, status bar, settings tabs, tab bar). We add "plugin contribution slots" to each zone — these are pre-designated areas where plugin-provided data is rendered. Data flows: PluginBridge → broadcastToRenderer(IPC.PLUGIN_CONTRIBUTION_UPDATED) → usePluginStore → React components render contributions inline.

**Tech Stack:** React 19, Tailwind CSS 4, Zustand 5, plugin-store.ts (created in Phase 1)

---

## Task 1: Add Plugin Views to Sidebar

**Files:**
- Modify: `src/components/sidebar/Sidebar.tsx`
- Create: `src/components/plugins/PluginSidebarView.tsx`

**Step 1: Add "plugins" to the SidebarPane type**

Modify `src/stores/ui-store.ts`:

```typescript
export type SidebarPane = 'sessions' | 'memory' | 'tasks' | 'plugins';
```

Add to `PANE_LABELS` in `Sidebar.tsx`:

```typescript
const PANE_LABELS: Record<SidebarPane, string> = {
  sessions: 'Sessions',
  memory: 'Memory',
  tasks: 'Tasks',
  plugins: 'Plugins',
};
```

**Step 2: Add Plugins activity bar icon**

In `Sidebar.tsx`, add a "Plugins" button in the activity bar, after the Tasks button:

```tsx
{/* Plugins pane — only shown when plugins have registered sidebar views */}
{pluginViews.length > 0 && (
  <Tooltip content="Plugins" position="right">
    <button
      className={`p-2 rounded-md transition-colors ${
        sidebarVisible && sidebarPane === 'plugins'
          ? 'bg-accent/15 text-accent'
          : 'hover:bg-bg-elevated text-text-secondary'
      }`}
      onClick={() => {
        if (!sidebarVisible) toggleSidebar();
        handlePaneClick('plugins');
      }}
    >
      <Icon name="Puzzle" className="w-4 h-4" />
    </button>
  </Tooltip>
)}
```

**Step 3: Render plugin views in the sidebar pane**

In the pane content section of `Sidebar.tsx`, add:

```tsx
{sidebarPane === 'plugins' && <PluginSidebarViews />}
```

**Step 4: Create PluginSidebarView component**

Create `src/components/plugins/PluginSidebarView.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { usePluginStore } from '../../stores/plugin-store';
import { Icon } from '../shared/Icon';

export default function PluginSidebarViews() {
  const { activeViews, getViewChildren } = usePluginStore();
  const sidebarViews = activeViews.filter(v => v.location === 'sidebar');

  if (sidebarViews.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary text-sm p-4">
        No plugin views installed
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {sidebarViews.map(view => (
        <PluginTreeViewPanel key={view.viewId} view={view} getChildren={getViewChildren} />
      ))}
    </div>
  );
}

function PluginTreeViewPanel({
  view,
  getChildren,
}: {
  view: import('../../../shared/types').PluginTreeView;
  getChildren: (viewId: string, elementId: string | null) => Promise<unknown[]>;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadRoot();
  }, []);

  async function loadRoot() {
    setLoading(true);
    try {
      const children = await getChildren(view.viewId, null);
      setItems(children || []);
    } catch (err) {
      console.error(`Failed to load view ${view.viewId}:`, err);
    } finally {
      setLoading(false);
    }
  }

  async function toggleExpand(item: any) {
    const key = item.id;
    if (expanded.has(key)) {
      setExpanded(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    } else {
      if (!item.children && item.collapsible !== false) {
        const children = await getChildren(view.viewId, item.id);
        item.children = children || [];
      }
      setExpanded(prev => new Set(prev).add(key));
    }
  }

  function renderItem(item: any, depth: number = 0): React.ReactNode {
    const isExpanded = expanded.has(item.id);
    const hasChildren = item.collapsible !== false;

    return (
      <div key={item.id}>
        <button
          className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-bg-elevated text-left text-sm"
          style={{ paddingLeft: `${8 + depth * 16}px` }}
          onClick={() => {
            if (hasChildren) toggleExpand(item);
            if (item.command) {
              // Fire command via plugin store
              usePluginStore.getState().executeCommand(
                item.command.id,
                item.command.args || []
              );
            }
          }}
        >
          {hasChildren && (
            <Icon
              name={isExpanded ? 'ChevronDown' : 'ChevronRight'}
              className="w-3 h-3 text-text-secondary flex-shrink-0"
            />
          )}
          {item.icon && <Icon name={item.icon} className="w-3.5 h-3.5 text-text-secondary flex-shrink-0" />}
          <span className="text-text-primary truncate flex-1">{item.label}</span>
          {item.description && (
            <span className="text-text-secondary text-xs truncate">{item.description}</span>
          )}
        </button>
        {isExpanded && item.children?.map((child: any) => renderItem(child, depth + 1))}
      </div>
    );
  }

  return (
    <div className="border-b border-border">
      <div className="px-3 py-1.5 text-xs font-semibold text-text-secondary uppercase tracking-wider">
        {view.title}
      </div>
      {loading ? (
        <div className="px-3 py-2 text-text-secondary text-xs">Loading...</div>
      ) : (
        items.map((item: any) => renderItem(item))
      )}
    </div>
  );
}
```

**Step 5: Add import to Sidebar.tsx**

```typescript
import PluginSidebarViews from '../plugins/PluginSidebarViews';
import { usePluginStore } from '../../stores/plugin-store';
```

And in the component body, add:

```typescript
const { activeViews: pluginViews } = usePluginStore();
```

**Step 6: Wire into app.tsx**

In `src/app.tsx`, ensure `usePluginStore`'s `startListening` is called:

```typescript
const pluginStartListening = usePluginStore(s => s.startListening);
useEffect(() => {
  const stop = pluginStartListening();
  return stop;
}, []);
```

**Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p tsconfig.web.json 2>&1 | head -20
```

**Step 8: Commit**

```bash
git add src/components/plugins/PluginSidebarView.tsx src/components/sidebar/Sidebar.tsx src/stores/ui-store.ts src/app.tsx
git commit -m "feat(plugins): add plugin views to sidebar"
```

---

### Task 2: Add Plugin Views to Right Panel

**Files:**
- Modify: `src/components/context/ContextPanel.tsx`
- Modify: `src/stores/ui-store.ts`

**Step 1: Add dynamic plugin tabs to ContextPanelTab**

In `src/stores/ui-store.ts`, update `ContextPanelTab` to accept string so plugin tabs work:

```typescript
export type ContextPanelTab = 'files' | 'git' | 'changes' | 'agents' | 'desktop' | string;
```

**Step 2: Add plugin panel views to ContextPanel**

In `ContextPanel.tsx`, after the existing tabs (desktop), add plugin tabs from the store:

```tsx
import { usePluginStore } from '../../stores/plugin-store';

// Inside the component:
const { activeViews: pluginViews, getViewChildren } = usePluginStore();
const pluginPanelViews = pluginViews.filter(v => v.location === 'panel');
```

Add plugin panel tab buttons in the activity bar and tab bar:

```tsx
{/* Plugin panel tabs */}
{pluginPanelViews.map(view => (
  <Tooltip key={view.viewId} content={view.title} position="left">
    <button
      className={`p-2 rounded-md transition-colors ${
        effectiveTab === view.viewId
          ? 'bg-accent/15 text-accent'
          : 'hover:bg-bg-elevated text-text-secondary'
      }`}
      onClick={() => handleTabClick(view.viewId)}
    >
      <Icon name={view.icon || 'Puzzle'} className="w-4 h-4" />
    </button>
  </Tooltip>
))}
```

**Step 3: Render plugin panel content**

In the expanded panel content section, add a fallback for plugin tabs:

```tsx
{pluginPanelViews.some(v => v.viewId === effectiveTab) && (
  <PluginPanelView viewId={effectiveTab} getChildren={getViewChildren} />
)}
```

Create the plugin panel wrapper inline or as a component:

```tsx
function PluginPanelView({
  viewId,
  getChildren,
}: {
  viewId: string;
  getChildren: (viewId: string, elementId: string | null) => Promise<unknown[]>;
}) {
  return <PluginTreeViewPanel view={{ viewId, title: viewId, location: 'panel', pluginId: '' }} getChildren={getChildren} />;
}
```

**Step 4: Commit**

```bash
git add src/components/context/ContextPanel.tsx src/stores/ui-store.ts
git commit -m "feat(plugins): add plugin views to right panel"
```

---

### Task 3: Render Plugin Status Bar Items

**Files:**
- Modify: `src/components/status-bar/StatusBar.tsx`

**Step 1: Add plugin status bar items to status bar**

In `StatusBar.tsx`, import the plugin store:

```typescript
import { usePluginStore } from '../../stores/plugin-store';
```

**Step 2: Render left-aligned plugin items**

After the existing left-side items (developer mode indicator), add:

```tsx
{/* Plugin status bar items (left) */}
{pluginLeftItems.map(item => (
  <button
    key={item.itemId}
    className="flex items-center gap-1.5 hover:text-text-primary transition-colors text-xs"
    title={item.tooltip || ''}
    onClick={() => {
      if (item.command) {
        usePluginStore.getState().executeCommand(item.command.id, item.command.args || []);
      }
    }}
  >
    <span>{item.text}</span>
  </button>
))}
```

**Step 3: Render right-aligned plugin items**

After the existing right-side items (cost), add:

```tsx
{/* Plugin status bar items (right) */}
{pluginRightItems.map(item => (
  <button
    key={item.itemId}
    className="flex items-center gap-1.5 hover:text-text-primary transition-colors text-xs"
    title={item.tooltip || ''}
    onClick={() => {
      if (item.command) {
        usePluginStore.getState().executeCommand(item.command.id, item.command.args || []);
      }
    }}
  >
    <span>{item.text}</span>
  </button>
))}
```

**Step 4: Derive left/right items from store**

Add inside the component:

```typescript
const { activeStatusBarItems } = usePluginStore();
const pluginLeftItems = activeStatusBarItems.filter(i => i.alignment === 'left');
const pluginRightItems = activeStatusBarItems.filter(i => i.alignment === 'right');
```

**Step 5: Commit**

```bash
git add src/components/status-bar/StatusBar.tsx
git commit -m "feat(plugins): render plugin status bar items"
```

---

### Task 4: Add Plugin Context Menus

**Files:**
- Create: `src/components/plugins/PluginContextMenus.tsx`
- Modify: `src/components/shared/ContextMenu.tsx` (or wherever context menus are defined)

**Step 1: Hook into existing context menu system**

Pilot uses `src/components/shared/ContextMenu.tsx` for context menus. Add plugin contributions there.

Create `src/components/plugins/PluginContextMenus.tsx`:

```tsx
import { usePluginStore } from '../../stores/plugin-store';
import type { MenuEntry } from '../shared/ContextMenu';

/**
 * Get additional context menu entries from plugins matching the given 'when' clause.
 * Call this from any component that builds context menus.
 */
export function usePluginContextMenuEntries(when: string): MenuEntry[] {
  // In Phase 2, context menu contributions are stored in PluginBridge
  // but not yet exposed through the store. This is a placeholder.
  // Phase 5 will add full context menu contribution support.
  return [];
}
```

For now, stub this out. Full context menu integration comes in Phase 5 when we have real plugins to test with.

**Step 2: Commit**

```bash
git add src/components/plugins/PluginContextMenus.tsx
git commit -m "feat(plugins): stub plugin context menu integration"
```

---

### Task 5: Add Plugin Settings Sections

**Files:**
- Modify: `src/components/settings/SettingsPanel.tsx`
- Create: `src/components/plugins/PluginSettingsView.tsx`

**Step 1: Add plugin settings tabs dynamically**

In `SettingsPanel.tsx`, import the plugin store and render plugin-provided settings tabs:

```tsx
import { usePluginStore } from '../../stores/plugin-store';
import PluginSettingsView from '../plugins/PluginSettingsView';

// Inside the component:
const { activeViews } = usePluginStore();
// Plugin settings sections are tracked separately in the store
// For now, use activeViews to discover settings-contributing plugins
```

**Step 2: Create PluginSettingsView component**

Create `src/components/plugins/PluginSettingsView.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { usePluginStore } from '../../stores/plugin-store';

export default function PluginSettingsView({ pluginId }: { pluginId: string }) {
  const [htmlContent, setHtmlContent] = useState('<p>Loading...</p>');
  const installedPlugins = usePluginStore(s => s.installedPlugins);
  const plugin = installedPlugins.find(p => p.id === pluginId);

  if (!plugin) {
    return <div className="text-text-secondary p-4">Plugin not found</div>;
  }

  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold text-text-primary mb-4">{plugin.name}</h3>
      <p className="text-text-secondary mb-2">Version: {plugin.version}</p>
      <p className="text-text-secondary mb-4">{plugin.description}</p>

      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <span className="text-text-primary">Enabled</span>
          <button
            role="switch"
            aria-checked={plugin.enabled}
            onClick={() => usePluginStore.getState().togglePlugin(plugin.id)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
              plugin.enabled ? 'bg-accent' : 'bg-border'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                plugin.enabled ? 'translate-x-[18px]' : 'translate-x-[2px]'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="border-t border-border mt-4 pt-4">
        <button
          onClick={() => usePluginStore.getState().removePlugin(plugin.id)}
          className="px-3 py-1.5 bg-error/15 text-error rounded-md hover:bg-error/25 transition-colors text-sm"
        >
          Remove Plugin
        </button>
      </div>
    </div>
  );
}
```

**Step 3: Register plugin settings tabs in SettingsPanel**

In `SettingsPanel.tsx`, dynamically add plugin tabs:

```tsx
// After the existing TABS array:
const pluginTabs = installedPlugins
  .filter(p => p.manifest.permissions.includes('ui:settings'))
  .map(p => ({
    id: `plugin:${p.id}`,
    label: p.name,
    icon: Puzzle,
  }));

const allTabs = [...TABS, ...pluginTabs];
```

Then render plugin settings sections:

```tsx
{settingsTab?.startsWith('plugin:') && (
  <PluginSettingsView pluginId={settingsTab.slice(7)} />
)}
```

**Step 4: Commit**

```bash
git add src/components/settings/SettingsPanel.tsx src/components/plugins/PluginSettingsView.tsx
git commit -m "feat(plugins): add plugin settings sections"
```

---

### Task 6: Support Custom Tab Types

**Files:**
- Modify: `src/components/tab-bar/TabBar.tsx`
- Modify: `src/stores/tab-store.ts`

**Step 1: Extend tab store to support plugin tab types**

In `src/stores/tab-store.ts`, the tab `type` field already supports string values. Plugin tabs are created with `type` set to the plugin's tab type ID (e.g., `"a2a-conversation"`).

Add a method to open a plugin tab:

```typescript
openPluginTab: (pluginId: string, typeId: string, label: string, projectPath: string) => {
  const id = randomUUID();
  set(state => ({
    tabs: [...state.tabs, {
      id,
      projectPath,
      type: typeId as any,
      label,
      pluginId,
      pluginData: {},
    }],
    activeTabId: id,
  }));
  // Notify the plugin that a tab was opened
  // Phase 3 will add this IPC call
},
```

**Step 2: Render plugin tab content**

In the main layout (e.g., `src/app.tsx` or wherever tab content is rendered), add a fallback for plugin tabs:

```tsx
{activeTab?.type && !['chat', 'web', 'desktop', 'docs'].includes(activeTab.type) && (
  <PluginTabView tab={activeTab} />
)}
```

Create `src/components/plugins/PluginTabView.tsx`:

```tsx
import { usePluginStore } from '../../stores/plugin-store';

export default function PluginTabView({ tab }: { tab: any }) {
  // Plugin tabs render as iframes for sandboxing
  // The plugin provides the HTML content for the iframe
  // Phase 3 will implement the full webview-based rendering
  
  return (
    <div className="flex-1 flex items-center justify-center text-text-secondary">
      <div className="text-center">
        <p className="text-lg mb-2">Plugin Tab</p>
        <p className="text-sm">Type: {tab.type}</p>
        <p className="text-sm">Plugin: {tab.pluginId}</p>
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/stores/tab-store.ts src/components/plugins/PluginTabView.tsx src/app.tsx
git commit -m "feat(plugins): support custom tab types"
```

---

### Task 7: Support Chat Message Renderers

**Files:**
- Modify: `src/components/chat/MessageBubble.tsx`
- Create: `src/components/plugins/PluginMessageRenderer.tsx`

**Step 1: Create plugin message renderer wrapper**

Create `src/components/plugins/PluginMessageRenderer.tsx`:

```tsx
import { usePluginStore } from '../../stores/plugin-store';
import type { PluginMessageRenderer } from '../../../shared/types';

/**
 * Check if any plugin has registered a custom renderer for a tool result.
 * Returns the matching renderer or null.
 */
export function findPluginRenderer(
  toolName?: string,
  customType?: string,
): PluginMessageRenderer | null {
  const { activeViews } = usePluginStore.getState();
  // Message renderers are tracked separately — 
  // for now, this is a stub that Phase 4 will flesh out
  return null;
}

/**
 * Render a tool result using a plugin-provided renderer.
 * Falls back to the default ToolResult rendering.
 */
export default function PluginMessageRenderer({
  toolName,
  result,
  customType,
  data,
}: {
  toolName?: string;
  result?: string;
  customType?: string;
  data?: unknown;
}) {
  // Phase 4 will implement actual plugin-hosted rendering
  // For now, return null so the default renderer handles it
  return null;
}
```

**Step 2: Hook into MessageBubble**

In `MessageBubble.tsx`, before falling through to the default tool result rendering, check for plugin renderers:

```tsx
import PluginMessageRenderer from '../plugins/PluginMessageRenderer';

// Inside the tool result rendering path:
const pluginRendered = toolCall.toolName ? (
  <PluginMessageRenderer
    toolName={toolCall.toolName}
    result={toolCall.result}
  />
) : null;

if (pluginRendered) return pluginRendered;
// ... existing rendering ...
```

**Step 3: Commit**

```bash
git add src/components/plugins/PluginMessageRenderer.tsx src/components/chat/MessageBubble.tsx
git commit -m "feat(plugins): stub plugin message renderers"
```

---

### Task 8: Verify End-to-End with Hello World Plugin

**Step 1: Update the hello-world plugin to exercise all slots**

Update `test-plugins/hello-world/plugin.js`:

```javascript
function activate(pilot) {
  console.log('Hello World plugin activated!');

  // Sidebar view
  pilot.contributions.registerTreeView('hello-sidebar', {
    title: 'Hello World',
    icon: 'smile',
    location: 'sidebar',
  });

  // Panel view
  pilot.contributions.registerTreeView('hello-panel', {
    title: 'Hello Panel',
    icon: 'layout',
    location: 'panel',
  });

  // Status bar
  pilot.contributions.createStatusBarItem('hello-status', {
    text: 'Hello from plugin!',
    alignment: 'right',
    priority: 100,
    tooltip: 'Hello World Plugin is active',
  });

  // Settings section
  pilot.contributions.registerSettingsSection('hello-settings', {
    title: 'Hello World Settings',
    icon: 'settings',
  });

  // Command
  pilot.contributions.registerCommand('hello-world.sayHello', {
    label: 'Hello World: Say Hello',
  });

  return () => {
    console.log('Hello World plugin deactivated');
  };
}

module.exports = { default: activate };
```

**Step 2: Update manifest permissions**

Update `test-plugins/hello-world/package.json`:

```json
{
  "pilot": {
    "plugins": ["./plugin.js"],
    "permissions": ["ui:sidebar", "ui:panel", "ui:status-bar", "ui:settings"]
  }
}
```

**Step 3: Manual verification checklist**

- [ ] Sidebar shows "Plugins" activity bar button
- [ ] Clicking it shows "Hello World" tree view
- [ ] Right panel shows "Hello Panel" tab
- [ ] Status bar shows "Hello from plugin!" text
- [ ] Settings shows "Hello World Settings" tab
- [ ] Installing a second plugin adds more views without removing the first

**Step 4: Commit**

```bash
git add test-plugins/
git commit -m "test(plugins): update hello-world plugin for Phase 2 verification"
git commit --allow-empty -m "feat(plugins): Phase 2 GUI contribution slots complete"
```

---

### Phase 2 Completion Checklist

- [ ] Sidebar shows plugin tree views
- [ ] Right panel shows plugin panel views
- [ ] Status bar renders plugin items (left and right)
- [ ] Context menu hook is stubbed
- [ ] Settings shows plugin sections
- [ ] Custom tab types are supported
- [ ] Chat message renderer hook is stubbed
- [ ] Hello World plugin renders in all slots
- [ ] TypeScript compiles without errors
