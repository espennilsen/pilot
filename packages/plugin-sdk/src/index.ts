/**
 * @pilot/plugin-sdk — TypeScript SDK for building Pilot plugins.
 *
 * Usage:
 *   import { activate, type PluginAPI } from '@pilot/plugin-sdk';
 *
 *   activate((pilot: PluginAPI) => {
 *     pilot.contributions.registerTreeView('my-view', { ... });
 *     return () => { /* cleanup *\/ };
 *   });
 */

// ─── Contribution Types ──────────────────────────────────────────────

/** Options for registering a TreeView. */
export interface TreeViewOptions {
  title: string;
  icon?: string;
  location: 'sidebar' | 'panel';
  /** Called to get root-level children. Pass null as element. */
  getChildren?: (element: any | null) => Promise<TreeItem[]> | TreeItem[];
}

/** A single item in a tree view. */
export interface TreeItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  collapsible?: boolean;
  /** Command to run when clicked. */
  command?: { id: string; args?: unknown[] };
}

/** Options for registering a WebviewView (full custom HTML panel). */
export interface WebviewViewOptions {
  title: string;
  icon?: string;
  location: 'sidebar' | 'panel';
  /** Return the HTML content for the webview. */
  getHtml: () => string | Promise<string>;
  /** Handle messages posted from the webview via postMessage. */
  onMessage?: (message: unknown) => void;
}

/** Options for creating a status bar item. */
export interface StatusBarItemOptions {
  text: string;
  tooltip?: string;
  alignment: 'left' | 'right';
  priority: number;
  command?: { id: string; args?: unknown[] };
}

/** Options for registering a context menu. */
export interface ContextMenuOptions {
  /** When clause — e.g., "view == file-tree", "view == chat-message" */
  when: string;
  /** Group for ordering within the menu. */
  group: string;
  /** Menu items. */
  items: Array<{
    label: string;
    command: { id: string; args?: unknown[] };
  }>;
}

/** Options for registering a custom tab type. */
export interface TabTypeOptions {
  label: string;
  icon?: string;
  /** Called when a tab of this type is opened. Returns HTML for the webview. */
  renderWebview: (context: TabContext) => { html: string; onMessage?: (msg: unknown) => void };
  /** Tab-level actions shown in the tab bar. */
  actions?: Array<{ label: string; command: { id: string; args?: unknown[] } }>;
}

export interface TabContext {
  tabData: Record<string, unknown>;
}

/** Options for registering a chat message renderer. */
export interface MessageRendererOptions {
  /** Match tool calls by tool name. */
  matchToolName?: string;
  /** Match custom message types. */
  matchCustomType?: string;
  /** Optional: transform tool result for display. */
  renderResult?: (props: { result: { content?: Array<{ type: string; text?: string }>; details?: unknown }; data?: unknown }) => {
    type: 'cards' | 'list' | 'custom';
    items?: Array<Record<string, unknown>>;
    html?: string;
  };
}

/** Options for registering a settings section. */
export interface SettingsSectionOptions {
  title: string;
  icon?: string;
  /** Return HTML for the settings form. */
  render: () => string | Promise<string>;
  /** Called when the user saves settings. */
  onSave?: (formData: Record<string, unknown>) => void | Promise<void>;
}

/** Options for registering a command. */
export interface CommandOptions {
  label: string;
  /** Optional keybinding (e.g., "ctrl+shift+g"). */
  keybinding?: string;
  handler: (args?: unknown[]) => void | Promise<void>;
}

// ─── Agent Types ─────────────────────────────────────────────────────

/** Tool definition for agent tools. */
export interface ToolDefinition {
  name: string;
  label?: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (toolCallId: string, params: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text?: string }>;
    details?: Record<string, unknown>;
  }>;
}

/** Serialised agent event forwarded to plugin event handlers. */
export interface AgentEvent {
  name: string;
  toolName?: string;
  toolCallId?: string;
  input?: Record<string, unknown>;
  result?: unknown;
  message?: unknown;
  prompt?: string;
}

/** Return type for tool_call event handlers. */
export interface ToolCallResult {
  block?: boolean;
  reason?: string;
  patchedInput?: Record<string, unknown>;
}

/** Return type for tool_result event handlers. */
export interface ToolResultModification {
  modifiedResult?: unknown;
}

/** Union type for event handler return values. */
export type AgentEventResult = ToolCallResult | ToolResultModification | Record<string, unknown> | void;

/** Callback for agent event handlers. */
export type AgentEventHandler = (event: AgentEvent) => AgentEventResult | Promise<AgentEventResult>;

// ─── Plugin API ──────────────────────────────────────────────────────

/**
 * The PluginAPI object passed to the activate function.
 * Plugins use this to register contributions and interact with Pilot.
 */
export interface PluginAPI {
  /** Register GUI contributions (views, status bar, commands, etc.). */
  contributions: {
    registerTreeView(id: string, options: TreeViewOptions): void;
    registerWebviewView(id: string, options: WebviewViewOptions): void;
    createStatusBarItem(id: string, options: StatusBarItemOptions): void;
    registerContextMenu(options: ContextMenuOptions): void;
    registerTabType(id: string, options: TabTypeOptions): void;
    registerMessageRenderer(id: string, options: MessageRendererOptions): void;
    registerSettingsSection(id: string, options: SettingsSectionOptions): void;
    registerCommand(id: string, options: CommandOptions): void;
  };

  /** Interact with the AI agent. */
  agent: {
    registerTool(definition: ToolDefinition): Promise<void>;
    removeTool(name: string): Promise<void>;
    registerSkill(content: string, options?: { scope?: 'global' | 'project' }): Promise<void>;
    removeSkill(id: string): Promise<void>;
    on(event: string, handler: AgentEventHandler): void;
    off(event: string, handler: AgentEventHandler): void;
  };

  /** Persistent key-value storage scoped to this plugin. */
  storage: {
    get<T = unknown>(key: string): Promise<T | undefined>;
    set<T = unknown>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
    keys(): Promise<string[]>;
  };

  /** Read-only workspace information. */
  workspace: {
    projectPath: string | null;
    /** Subscribe to project changes. */
    onDidChangeProject(callback: (path: string | null) => void): () => void;
  };
}

// ─── Activate Helper ─────────────────────────────────────────────────

/**
 * Declare the global `activate` function that the Extension Host calls.
 * This is what plugin entry files export as default.
 */
export type ActivateFunction = (pilot: PluginAPI) => void | (() => void) | Promise<void | (() => void)>;

/**
 * Helper to define the activate function with correct typing.
 * Usage:
 *   import { activate, type PluginAPI } from '@pilot/plugin-sdk';
 *   activate((pilot: PluginAPI) => { ... });
 */
export function activate(fn: ActivateFunction): ActivateFunction {
  return fn;
}
