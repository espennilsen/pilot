// IPC channel name constants

export const IPC = {
  // Agent
  AGENT_CREATE_SESSION: 'agent:create-session',
  AGENT_CONTINUE_SESSION: 'agent:continue-session',
  AGENT_PROMPT: 'agent:prompt',
  AGENT_STEER: 'agent:steer',
  AGENT_FOLLOW_UP: 'agent:follow-up',
  AGENT_GET_QUEUED: 'agent:get-queued',
  AGENT_CLEAR_QUEUE: 'agent:clear-queue',
  AGENT_ABORT: 'agent:abort',
  AGENT_DISPOSE: 'agent:dispose',
  AGENT_EVENT: 'agent:event', // main → renderer

  // Model
  MODEL_GET_AVAILABLE: 'model:get-available',
  MODEL_SET: 'model:set',
  MODEL_CYCLE: 'model:cycle',
  MODEL_CYCLE_THINKING: 'model:cycle-thinking',
  MODEL_GET_INFO: 'model:get-info',

  // Session stats & history
  SESSION_GET_STATS: 'session:get-stats',
  SESSION_GET_CONTEXT_USAGE: 'session:get-context-usage',
  SESSION_GET_HISTORY: 'session:get-history',
  SESSION_ENSURE: 'session:ensure',
  SESSION_OPEN: 'session:open',

  // Sessions
  SESSION_LIST: 'session:list',
  SESSION_LIST_ALL: 'session:list-all',
  SESSION_UPDATE_META: 'session:update-meta',
  SESSION_DELETE: 'session:delete',
  SESSION_NEW: 'session:new',
  SESSION_SWITCH: 'session:switch',
  SESSION_FORK: 'session:fork',

  // App Settings (Pilot-level, stored in ~/.config/.pilot/)
  APP_SETTINGS_GET: 'app-settings:get',
  APP_SETTINGS_UPDATE: 'app-settings:update',
  PI_SETTINGS_GET: 'pi-settings:get',
  PI_SETTINGS_UPDATE: 'pi-settings:update',

  // Project Settings (per-project, stored in <project>/.pilot/)
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',

  // Auth
  AUTH_GET_PROVIDERS: 'auth:get-providers',
  AUTH_GET_STATUS: 'auth:get-status',
  AUTH_SET_API_KEY: 'auth:set-api-key',
  AUTH_SET_RUNTIME_KEY: 'auth:set-runtime-key',
  AUTH_LOGIN_OAUTH: 'auth:login-oauth',
  AUTH_LOGIN_OAUTH_EVENT: 'auth:login-oauth-event', // main → renderer
  AUTH_OAUTH_PROMPT_REPLY: 'auth:oauth-prompt-reply', // renderer → main
  AUTH_LOGOUT: 'auth:logout',

  // Project
  PROJECT_SET_DIRECTORY: 'project:set-directory',
  PROJECT_FILE_TREE: 'project:file-tree',
  PROJECT_FILE_SEARCH: 'project:file-search',
  PROJECT_READ_FILE: 'project:read-file',
  PROJECT_WRITE_FILE: 'project:write-file',
  PROJECT_DELETE_PATH: 'project:delete-path',
  PROJECT_RENAME_PATH: 'project:rename-path',
  PROJECT_CREATE_FILE: 'project:create-file',
  PROJECT_CREATE_DIRECTORY: 'project:create-directory',
  PROJECT_FS_CHANGED: 'project:fs-changed', // main → renderer
  PROJECT_OPEN_DIALOG: 'project:open-dialog',

  // Shell / OS integration
  SHELL_REVEAL_IN_FINDER: 'shell:reveal-in-finder',
  SHELL_OPEN_IN_TERMINAL: 'shell:open-in-terminal',
  SHELL_DETECT_EDITORS: 'shell:detect-editors',
  SHELL_DETECT_TERMINALS: 'shell:detect-terminals',
  SHELL_OPEN_IN_EDITOR: 'shell:open-in-editor',

  // Tabs
  TABS_SAVE_STATE: 'tabs:save-state',
  TABS_RESTORE_STATE: 'tabs:restore-state',

  // Sandbox
  SANDBOX_GET_SETTINGS: 'sandbox:get-settings',
  SANDBOX_UPDATE_SETTINGS: 'sandbox:update-settings',
  SANDBOX_TOGGLE_YOLO: 'sandbox:toggle-yolo',
  SANDBOX_STAGED_DIFF: 'sandbox:staged-diff', // main → renderer
  SANDBOX_ACCEPT_DIFF: 'sandbox:accept-diff',
  SANDBOX_REJECT_DIFF: 'sandbox:reject-diff',
  SANDBOX_ACCEPT_ALL: 'sandbox:accept-all',

  // Git
  GIT_INIT: 'git:init',
  GIT_INIT_REPO: 'git:init-repo',
  GIT_STATUS: 'git:status',
  GIT_BRANCHES: 'git:branches',
  GIT_CHECKOUT: 'git:checkout',
  GIT_CREATE_BRANCH: 'git:create-branch',
  GIT_STAGE: 'git:stage',
  GIT_UNSTAGE: 'git:unstage',
  GIT_COMMIT: 'git:commit',
  GIT_PUSH: 'git:push',
  GIT_PULL: 'git:pull',
  GIT_DIFF: 'git:diff',
  GIT_LOG: 'git:log',
  GIT_BLAME: 'git:blame',
  GIT_STASH_LIST: 'git:stash-list',
  GIT_STASH_APPLY: 'git:stash-apply',

  // Dev commands
  DEV_LOAD_CONFIG: 'dev:load-config',
  DEV_SAVE_CONFIG: 'dev:save-config',
  DEV_RUN_COMMAND: 'dev:run-command',
  DEV_STOP_COMMAND: 'dev:stop-command',
  DEV_COMMAND_OUTPUT: 'dev:command-output', // main → renderer
  DEV_COMMAND_STATUS: 'dev:command-status', // main → renderer
  DEV_SERVER_URL: 'dev:server-url',         // main → renderer (URL detected in output)

  // Extensions
  EXTENSIONS_LIST: 'extensions:list',
  EXTENSIONS_IMPORT_ZIP: 'extensions:import-zip',
  EXTENSIONS_TOGGLE: 'extensions:toggle',
  EXTENSIONS_REMOVE: 'extensions:remove',
  SKILLS_LIST: 'skills:list',
  SKILLS_IMPORT_ZIP: 'skills:import-zip',
  SKILLS_REMOVE: 'skills:remove',

  // Slash commands
  AGENT_GET_SLASH_COMMANDS: 'agent:get-slash-commands',

  // Memory
  DOCS_READ: 'docs:read',                   // renderer → main
  DOCS_LIST: 'docs:list',                   // renderer → main

  MEMORY_GET: 'memory:get',
  MEMORY_GET_FILES: 'memory:get-files',
  MEMORY_SAVE_FILE: 'memory:save-file',
  MEMORY_CLEAR: 'memory:clear',
  MEMORY_GET_COUNT: 'memory:get-count',
  MEMORY_HANDLE_COMMAND: 'memory:handle-command',
  MEMORY_GET_PATHS: 'memory:get-paths',
  MEMORY_SET_ENABLED: 'memory:set-enabled',    // renderer → main
  MEMORY_UPDATED: 'memory:updated',           // main → renderer
  MEMORY_SHOW_PANEL: 'memory:show-panel',      // main → renderer

  // Terminal
  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_DATA: 'terminal:data',          // renderer → main (user typed)
  TERMINAL_OUTPUT: 'terminal:output',      // main → renderer (pty output)
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_DISPOSE: 'terminal:dispose',
  TERMINAL_EXITED: 'terminal:exited',      // main → renderer (terminal closed/exited)
  TERMINAL_SET_MENU_VISIBLE: 'terminal:set-menu-visible',

  // Tasks
  TASKS_LOAD_BOARD: 'tasks:load-board',
  TASKS_CREATE: 'tasks:create',
  TASKS_UPDATE: 'tasks:update',
  TASKS_DELETE: 'tasks:delete',
  TASKS_COMMENT: 'tasks:comment',
  TASKS_QUERY: 'tasks:query',
  TASKS_READY: 'tasks:ready',
  TASKS_EPIC_PROGRESS: 'tasks:epic-progress',
  TASKS_DEPENDENCIES: 'tasks:dependencies',
  TASKS_SET_ENABLED: 'tasks:set-enabled',    // renderer → main
  TASKS_CHANGED: 'tasks:changed',           // main → renderer
  TASKS_SHOW_PANEL: 'tasks:show-panel',     // main → renderer
  TASKS_SHOW_CREATE: 'tasks:show-create',   // main → renderer

  // Prompts
  PROMPTS_GET_ALL: 'prompts:get-all',
  PROMPTS_GET: 'prompts:get',
  PROMPTS_GET_BY_COMMAND: 'prompts:get-by-command',
  PROMPTS_GET_COMMANDS: 'prompts:get-commands',
  PROMPTS_GET_SYSTEM_COMMANDS: 'prompts:get-system-commands',
  PROMPTS_VALIDATE_COMMAND: 'prompts:validate-command',
  PROMPTS_CREATE: 'prompts:create',
  PROMPTS_UPDATE: 'prompts:update',
  PROMPTS_DELETE: 'prompts:delete',
  PROMPTS_UNHIDE: 'prompts:unhide',
  PROMPTS_FILL: 'prompts:fill',
  PROMPTS_RELOAD: 'prompts:reload',
  PROMPTS_CHANGED: 'prompts:changed',         // main → renderer

  // Companion
  COMPANION_GET_STATUS: 'companion:get-status',
  COMPANION_ENABLE: 'companion:enable',
  COMPANION_DISABLE: 'companion:disable',
  COMPANION_GENERATE_PIN: 'companion:generate-pin',
  COMPANION_GENERATE_QR: 'companion:generate-qr',
  COMPANION_GET_DEVICES: 'companion:get-devices',
  COMPANION_REVOKE_DEVICE: 'companion:revoke-device',
  COMPANION_ENABLE_REMOTE: 'companion:enable-remote',
  COMPANION_DISABLE_REMOTE: 'companion:disable-remote',
  COMPANION_PAIR: 'companion:pair',
  COMPANION_GET_TUNNELS: 'companion:get-tunnels',
  COMPANION_OPEN_TUNNEL: 'companion:open-tunnel',
  COMPANION_CHECK_REMOTE: 'companion:check-remote',
  COMPANION_REGEN_CERT: 'companion:regen-cert',
  COMPANION_REMOTE_ACTIVATION: 'companion:remote-activation',
  COMPANION_TUNNEL_OUTPUT: 'companion:tunnel-output',  // main → renderer (streaming output)

  // Attachments
  ATTACHMENT_SAVE: 'attachment:save',

  // Subagents
  SUBAGENT_SPAWN: 'subagent:spawn',
  SUBAGENT_SPAWN_POOL: 'subagent:spawn-pool',
  SUBAGENT_STATUS: 'subagent:status',
  SUBAGENT_RESULT: 'subagent:result',
  SUBAGENT_ABORT: 'subagent:abort',
  SUBAGENT_ABORT_POOL: 'subagent:abort-pool',
  SUBAGENT_EVENT: 'subagent:event',                 // main → renderer
  SUBAGENT_POOL_PROGRESS: 'subagent:pool-progress', // main → renderer
} as const;
