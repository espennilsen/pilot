# Phase 5 — Distribution & Discovery

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Make plugins discoverable and easy to install. Build a community index (JSON catalog in a git repo), a `pilot plugin search` command that queries it, and an in-app plugin browser panel where users can browse, search, and one-click install plugins.

**Architecture:** A git repo (`github.com/pilot-plugins/registry`) holds a `plugins.json` catalog. `pilot plugin search` fetches this catalog, filters locally, and displays results. The in-app browser is a React panel that reads the same catalog via IPC and renders plugin cards with install buttons.

**Tech Stack:** git, JSON, fetch API, React components.

---

### Task 1: Create the Community Index Repository

**Files:**
- Create: `https://github.com/pilot-plugins/registry` (external repo — we mock this for now)

**Step 1: Design the catalog schema**

The catalog is a single `plugins.json` file:

```jsonc
{
  "version": 1,
  "lastUpdated": "2026-05-01T12:00:00Z",
  "plugins": [
    {
      "id": "@pilot-plugins/github-dashboard",
      "name": "GitHub Dashboard",
      "description": "GitHub PR and CI status in your sidebar",
      "version": "1.0.0",
      "author": "pilot-plugins",
      "homepage": "https://github.com/pilot-plugins/github-dashboard",
      "repository": "github.com/pilot-plugins/github-dashboard",
      "install": "npm:@pilot-plugins/github-dashboard",
      "tags": ["github", "ci", "dashboard"],
      "permissions": ["ui:sidebar", "ui:status-bar", "network:github.com"],
      "minPilotVersion": "1.0.0",
      "rating": 4.5,
      "downloads": 1234,
      "icon": "https://raw.githubusercontent.com/.../icon.png"
    }
  ]
}
```

**Step 2: Create a local mock catalog for development**

Create `resources/plugin-catalog.json`:

```json
{
  "version": 1,
  "lastUpdated": "2026-05-01T12:00:00Z",
  "plugins": [
    {
      "id": "@pilot-plugins/github-dashboard",
      "name": "GitHub Dashboard",
      "description": "View PR status, CI runs, and repo activity directly in your Pilot sidebar. One-click open PRs and review changes.",
      "version": "1.0.0",
      "author": "Pilot Community",
      "homepage": "https://github.com/pilot-plugins/github-dashboard",
      "repository": "github.com/pilot-plugins/github-dashboard",
      "install": "npm:@pilot-plugins/github-dashboard",
      "tags": ["github", "ci", "git", "productivity"],
      "permissions": ["ui:sidebar", "ui:status-bar", "network:github.com", "git:status"],
      "minPilotVersion": "1.0.0"
    },
    {
      "id": "@pilot-plugins/a2a",
      "name": "A2A Support",
      "description": "Connect to remote A2A agents. Discover, chat with, and delegate tasks to other AI agents across your network.",
      "version": "0.5.0",
      "author": "Pilot Community",
      "install": "npm:@pilot-plugins/a2a",
      "tags": ["a2a", "agents", "network"],
      "permissions": ["ui:sidebar", "ui:tabs", "agent:tools", "agent:events", "network:*"],
      "minPilotVersion": "1.0.0"
    },
    {
      "id": "linear-integration",
      "name": "Linear Integration",
      "description": "Sync issues and tasks with Linear. Create issues from chat, view sprint status, and link commits to issues.",
      "version": "0.2.0",
      "author": "Pilot Community",
      "install": "npm:@pilot-plugins/linear",
      "tags": ["linear", "issues", "project-management"],
      "permissions": ["ui:sidebar", "ui:panel", "agent:tools", "network:api.linear.app"],
      "minPilotVersion": "1.0.0"
    },
    {
      "id": "figma-preview",
      "name": "Figma Preview",
      "description": "Embed Figma designs directly in chat. Paste a Figma link and see live previews with annotation support.",
      "version": "0.1.0",
      "author": "Pilot Community",
      "install": "npm:@pilot-plugins/figma-preview",
      "tags": ["figma", "design", "preview"],
      "permissions": ["ui:chat-renderer", "network:figma.com"],
      "minPilotVersion": "1.0.0"
    },
    {
      "id": "docker-explorer",
      "name": "Docker Explorer",
      "description": "Manage Docker containers and images from a sidebar panel. View logs, stats, and control containers inline.",
      "version": "0.3.0",
      "author": "Pilot Community",
      "install": "npm:@pilot-plugins/docker-explorer",
      "tags": ["docker", "containers", "devops"],
      "permissions": ["ui:sidebar", "ui:panel", "shell:exec"],
      "minPilotVersion": "1.0.0"
    }
  ]
}
```

**Step 3: Commit**

```bash
git add resources/plugin-catalog.json
git commit -m "feat(plugins): add community plugin catalog"
```

---

### Task 2: Plugin Search Service

**Files:**
- Create: `electron/services/plugin-catalog.ts`

**Step 1: Create the catalog service**

Create `electron/services/plugin-catalog.ts`:

```typescript
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import { PILOT_APP_DIR } from './pilot-paths';

// ─── Types ───────────────────────────────────────────────────────────

export // CatalogPlugin type moved to shared/types.ts for cross-process usage
interface CatalogPlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  homepage?: string;
  repository?: string;
  /** Install string — "npm:package" or "git:repo" */
  install: string;
  tags: string[];
  permissions: string[];
  minPilotVersion: string;
  rating?: number;
  downloads?: number;
  icon?: string;
}

interface PluginCatalog {
  version: number;
  lastUpdated: string;
  plugins: CatalogPlugin[];
}

// ─── Remote URL ──────────────────────────────────────────────────────

const CATALOG_URL = 'https://raw.githubusercontent.com/pilot-plugins/registry/main/plugins.json';
const CACHE_FILE = join(PILOT_APP_DIR, '.plugin-catalog-cache.json');
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

// ─── Catalog Service ─────────────────────────────────────────────────

export class PluginCatalogService {
  private catalog: PluginCatalog | null = null;

  /** Load the catalog (cached locally, refreshed from remote periodically). */
  async getCatalog(): Promise<PluginCatalog> {
    // Return cached if fresh
    if (this.catalog) return this.catalog;

    // Try loading from cache
    try {
      if (existsSync(CACHE_FILE)) {
        const cached = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
        const age = Date.now() - cached.fetchedAt;
        if (age < CACHE_TTL) {
          this.catalog = cached;
          return this.catalog!;
        }
      }
    } catch {
      // Cache miss or invalid — continue to fetch
    }

    // Try loading bundled catalog (always available)
    try {
      const bundledPath = join(process.resourcesPath, 'plugin-catalog.json');
      if (existsSync(bundledPath)) {
        this.catalog = JSON.parse(readFileSync(bundledPath, 'utf-8'));
      }
    } catch {
      this.catalog = { version: 1, lastUpdated: '', plugins: [] };
    }

    // Try fetching from remote (non-blocking, updates cache for next time)
    this.refreshFromRemote().catch(() => {
      // Silently fail — use bundled catalog
    });

    return this.catalog!;
  }

  private async refreshFromRemote(): Promise<void> {
    try {
      const response = await fetch(CATALOG_URL, {
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) return;

      const remote = await response.json() as PluginCatalog;
      this.catalog = remote;

      // Cache to disk
      mkdirSync(PILOT_APP_DIR, { recursive: true });
      writeFileSync(CACHE_FILE, JSON.stringify({
        ...remote,
        fetchedAt: Date.now(),
      }, null, 2));
    } catch {
      // Network errors, timeouts — ignore
    }
  }

  /** Search plugins by query string (matches name, description, tags). */
  async search(query: string): Promise<CatalogPlugin[]> {
    const catalog = await this.getCatalog();
    const q = query.toLowerCase();

    return catalog.plugins.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  /** List all available plugins. */
  async listAll(): Promise<CatalogPlugin[]> {
    const catalog = await this.getCatalog();
    return catalog.plugins;
  }

  /** Get a single plugin by ID. */
  async getById(id: string): Promise<CatalogPlugin | null> {
    const catalog = await this.getCatalog();
    return catalog.plugins.find(p => p.id === id) || null;
  }
}
```

**Step 2: Commit**

```bash
git add electron/services/plugin-catalog.ts
git commit -m "feat(plugins): add plugin catalog service with search"
```

---

### Task 3: Plugin Search IPC & CLI

**Files:**
- Modify: `electron/ipc/plugins.ts`
- Modify: `shared/ipc.ts`

**Step 1: Add search IPC channels**

In `shared/ipc.ts`:

```typescript
PLUGIN_CATALOG_LIST: 'plugin:catalog-list',
PLUGIN_CATALOG_SEARCH: 'plugin:catalog-search',
```

**Step 2: Register IPC handlers**

In `electron/ipc/plugins.ts`:

```typescript
import { PluginCatalogService } from '../services/plugin-catalog';

const catalogService = new PluginCatalogService();

ipcMain.handle(IPC.PLUGIN_CATALOG_LIST, async () => {
  return catalogService.listAll();
});

ipcMain.handle(
  IPC.PLUGIN_CATALOG_SEARCH,
  async (_event, query: string) => {
    return catalogService.search(query);
  }
);
```

**Step 3: Commit**

```bash
git add shared/ipc.ts electron/ipc/plugins.ts
git commit -m "feat(plugins): add plugin catalog search IPC"
```

---

### Task 4: In-App Plugin Browser

**Files:**
- Create: `src/components/plugins/PluginBrowser.tsx`

**Step 1: Write the plugin browser component**

Create `src/components/plugins/PluginBrowser.tsx`:

```tsx
import { useState, useEffect, useMemo } from 'react';
import { usePluginStore } from '../../stores/plugin-store';
import { IPC } from '../../../shared/ipc';
import { invoke } from '../../lib/ipc-client';
import type { CatalogPlugin } from '../../../shared/types'; // Moved to shared types
import { Search, Download, Check, Star, ExternalLink } from 'lucide-react';

export default function PluginBrowser() {
  const [plugins, setPlugins] = useState<CatalogPlugin[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const { installedPlugins, installPlugin } = usePluginStore();

  useEffect(() => {
    loadCatalog();
  }, []);

  async function loadCatalog() {
    setLoading(true);
    try {
      const catalog = await invoke<CatalogPlugin[]>(IPC.PLUGIN_CATALOG_LIST);
      setPlugins(catalog || []);
    } catch (err) {
      console.error('Failed to load plugin catalog:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleInstall(plugin: CatalogPlugin) {
    setInstallingId(plugin.id);
    try {
      await installPlugin(plugin.install);
    } finally {
      setInstallingId(null);
    }
  }

  const filtered = useMemo(() => {
    if (!query.trim()) return plugins;
    const q = query.toLowerCase();
    return plugins.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q))
    );
  }, [plugins, query]);

  const installedIds = new Set(installedPlugins.map(p => p.id));

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search plugins..."
            className="w-full pl-8 pr-3 py-1.5 bg-bg-base border border-border rounded-md text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Plugin list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading ? (
          <div className="text-center text-text-secondary py-8 text-sm">Loading catalog...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-text-secondary py-8 text-sm">
            {query ? 'No plugins match your search' : 'No plugins available'}
          </div>
        ) : (
          filtered.map(plugin => (
            <PluginCard
              key={plugin.id}
              plugin={plugin}
              installed={installedIds.has(plugin.id)}
              installing={installingId === plugin.id}
              onInstall={() => handleInstall(plugin)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function PluginCard({
  plugin,
  installed,
  installing,
  onInstall,
}: {
  plugin: CatalogPlugin;
  installed: boolean;
  installing: boolean;
  onInstall: () => void;
}) {
  return (
    <div className="bg-bg-base border border-border rounded-lg p-3 hover:border-text-secondary/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary truncate">{plugin.name}</h3>
            <span className="text-xs text-text-secondary font-mono">v{plugin.version}</span>
          </div>
          <p className="text-xs text-text-secondary mt-1 line-clamp-2">{plugin.description}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {plugin.tags.map(tag => (
              <span
                key={tag}
                className="px-1.5 py-0.5 bg-bg-surface rounded text-[10px] text-text-secondary"
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-text-secondary">
            <span>by {plugin.author}</span>
            <span>{plugin.permissions.length} permissions</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {installed ? (
            <span className="flex items-center gap-1 px-2 py-1 bg-success/15 text-success rounded text-xs font-medium">
              <Check className="w-3 h-3" />
              Installed
            </span>
          ) : (
            <button
              onClick={onInstall}
              disabled={installing}
              className="flex items-center gap-1 px-3 py-1 bg-accent text-white rounded-md hover:bg-accent/90 transition-colors text-xs font-medium disabled:opacity-50"
            >
              <Download className="w-3 h-3" />
              {installing ? 'Installing...' : 'Install'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Add browser as a sidebar pane**

In `src/stores/ui-store.ts`:

```typescript
export type SidebarPane = 'sessions' | 'memory' | 'tasks' | 'plugins' | 'plugin-browser';
```

In `Sidebar.tsx`, add a "Browse" button in the plugins pane or add a new activity bar button:

```tsx
{/* Plugin Browser */}
<Tooltip content="Plugin Browser" position="right">
  <button
    className={`p-2 rounded-md transition-colors ${
      sidebarVisible && sidebarPane === 'plugin-browser'
        ? 'bg-accent/15 text-accent'
        : 'hover:bg-bg-elevated text-text-secondary'
    }`}
    onClick={() => {
      if (!sidebarVisible) toggleSidebar();
      handlePaneClick('plugin-browser');
    }}
  >
    <Icon name="Store" className="w-4 h-4" />
  </button>
</Tooltip>
```

And render the browser in pane content:

```tsx
{sidebarPane === 'plugin-browser' && <PluginBrowser />}
```

**Step 3: Commit**

```bash
git add src/components/plugins/PluginBrowser.tsx src/stores/ui-store.ts src/components/sidebar/Sidebar.tsx
git commit -m "feat(plugins): add in-app plugin browser"
```

---

### Task 5: End-to-End Test — Discovery & Install

**Step 1: Verify the full flow**

Manual verification checklist:

- [ ] Click "Plugin Browser" icon in activity bar
- [ ] Catalog loads showing sample plugins (GitHub Dashboard, A2A, Linear, Figma, Docker)
- [ ] Type "github" in search — filters to GitHub Dashboard
- [ ] Type "docker" — filters to Docker Explorer
- [ ] Clear search — shows all plugins
- [ ] Click "Install" on GitHub Dashboard
- [ ] Button shows "Installing..." then changes to "Installed" checkmark
- [ ] Plugin appears in sidebar's "Plugins" pane
- [ ] Sidebar view renders the GitHub Dashboard tree
- [ ] Status bar shows the GitHub CI indicator
- [ ] Remove the plugin from Settings → Plugins — catalog shows "Install" again

**Step 2: Commit**

```bash
git commit --allow-empty -m "feat(plugins): Phase 5 distribution & discovery complete"
```

---

### Phase 5 Completion Checklist

- [ ] Community catalog schema defined
- [ ] Bundled catalog with 5 sample plugins
- [ ] Catalog service with search and remote refresh
- [ ] Plugin search IPC channels
- [ ] In-app plugin browser with search and one-click install
- [ ] "Installed" state reflected in browser
- [ ] Full install → use → remove lifecycle works
- [ ] Remote catalog refresh (from GitHub) works when network available
