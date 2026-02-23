# Settings

Pilot's settings panel lets you configure authentication, models, project behavior, extensions, keybindings, and more. Access settings with `Cmd+,` or through the command palette.

---

## Opening Settings

### Methods

1. **Keyboard**: `Cmd+,`
2. **Menu**: `Pilot` → `Settings`
3. **Command Palette**: `Cmd+K` → "Open Settings"
4. **Activity Bar**: Click the gear icon at the bottom

### Settings Window

The settings panel opens as a modal overlay with tabs:
- General
- Auth & Models
- Project
- Companion
- Memory
- Prompts
- Keybindings
- Extensions
- Skills
- Developer

Use `Tab` to navigate between tabs, or click a tab name.

---

## General Settings

### Default Model

**Purpose**: Set the AI model used for new sessions.

**Options**:
- OpenAI: GPT-4, GPT-4 Turbo, GPT-3.5 Turbo
- Anthropic: Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku
- Google: Gemini 1.5 Pro, Gemini 1.5 Flash
- Local: Ollama models (if Ollama is installed)

**Note**: You can change the model per-session using the model switcher in the chat header.

### Temperature

**Purpose**: Controls randomness in AI responses.

**Range**: 0.0 (deterministic) to 1.0 (creative)

**Recommendations**:
- **0.0-0.3**: Precise code generation, refactoring
- **0.4-0.7**: Balanced (default)
- **0.8-1.0**: Creative writing, brainstorming

### Max Tokens

**Purpose**: Maximum length of AI responses.

**Range**: 256 to 4096 tokens

**Note**: Longer responses cost more and may exceed model limits.

### Auto-Save Sessions

**Purpose**: Automatically save sessions to disk.

**Options**:
- **On** (default): Sessions are saved after every message
- **Off**: Sessions are only saved when you close the app

**Recommendation**: Leave enabled to prevent data loss.

### Theme

**Purpose**: UI color scheme.

**Options**:
- **Light**: Light background, dark text
- **Dark** (default): Dark background, light text
- **High Contrast**: Accessibility-optimized colors
- **Auto**: Match system theme

### Font Size

**Purpose**: UI text size.

**Range**: 12px to 20px (default: 14px)

**Note**: Code font size is configured separately in Developer settings.

---

## Auth Settings

### API Keys

Configure API keys for AI providers:

#### OpenAI

1. **Get an API key**: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. **Add to Pilot**: Settings → Auth → OpenAI → Paste key → Save

#### Anthropic

1. **Get an API key**: [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
2. **Add to Pilot**: Settings → Auth → Anthropic → Paste key → Save

#### Google AI

1. **Get an API key**: [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. **Add to Pilot**: Settings → Auth → Google → Paste key → Save

### OAuth Providers

Some providers use OAuth instead of API keys:

1. Click **"Sign in with [Provider]"**
2. Browser opens for OAuth flow
3. Authorize Pilot
4. Return to the app — credentials are saved automatically

**Supported OAuth providers**:
- GitHub (for GitHub Copilot)
- Microsoft (for Azure OpenAI)

### Managing Keys

- **View keys**: Click the eye icon to reveal a key
- **Regenerate**: If a key is compromised, regenerate in the provider's console and update Pilot
- **Remove**: Click the trash icon to delete a key

**Security**: API keys are stored in `~/.config/.pilot/auth.json` with file permissions set to `600` (readable only by you).

---

## Project Settings

### Default Project Path

**Purpose**: Default location for new projects.

**Example**: `~/Dev/`

When you create a new project, the file picker starts here.

### YOLO Mode

**Purpose**: Auto-accept all file changes without review.

**Options**:
- **Off** (default): All file changes are staged for review
- **On**: File changes are applied immediately

**⚠️ Warning**: YOLO mode bypasses safety checks. Only enable for prototyping or throwaway branches.

**See also**: [Agent documentation](./agent.md#yolo-mode)

### Allowed Paths

**Purpose**: Restrict agent file access to specific directories (beyond the project root).

**Use case**: If you want the agent to access a shared library or config folder outside the project.

**Example**:
```
/Users/espen/.config/
/Users/espen/Dev/shared/
```

**Security**: Paths must be absolute. Relative paths are rejected.

### Project Jail

**Purpose**: Prevent the agent from accessing files outside the project directory.

**Options**:
- **Enabled** (default): Agent is jailed to the project
- **Disabled**: Agent can access any path in "Allowed Paths"

**Recommendation**: Keep enabled unless you have a specific reason to disable.

---

## Companion Settings

Access Pilot from your iPhone, iPad, or any browser on the local network.

### Enable Companion Server

**Purpose**: Start the companion server so other devices can connect.

**Options**:
- **Off** (default): No network access
- **On**: HTTPS + WebSocket server starts on port 18088

When enabled, Pilot serves the full UI over the network and broadcasts via Bonjour for automatic discovery.

### Pair New Device

Two methods to pair a device:

- **Show PIN**: Generates a 6-digit code valid for 5 minutes. Enter it on your device.
- **Show QR Code**: Scan from your device. Contains connection URL and one-time token.

Only one pairing can be active at a time. Generating a new PIN or QR replaces the previous one.

### Paired Devices

Lists all paired devices with:
- Device name
- Last seen time
- **Revoke** button to immediately disconnect and invalidate the device's access

### Remote Access

Access Pilot from outside your local network:

- **Tailscale**: If installed, exposes Pilot on your tailnet with proper TLS certificates
- **Cloudflare Tunnel**: Creates a quick `*.trycloudflare.com` tunnel (no account needed)

**See also**: [Companion Access](./companion.md) for the full guide.

---

## Extensions Settings

### Extension Directory

**Location**: `~/.config/.pilot/extensions/`

**Purpose**: Add custom tools, themes, and UI components to Pilot.

### Installed Extensions

View and manage installed extensions:

| Extension | Status | Actions |
|-----------|--------|---------|
| example-extension | Enabled | Disable, Remove |
| custom-theme | Enabled | Disable, Remove |

**Enable/Disable**: Toggle the switch next to an extension.

**Remove**: Click the trash icon to delete an extension (cannot be undone).

### Installing Extensions

1. **From Disk**:
   - Click **"Install from Folder"**
   - Select the extension directory
   - Extension is copied to `~/.config/.pilot/extensions/`

2. **From URL** (coming soon):
   - Click **"Install from URL"**
   - Paste extension package URL
   - Extension is downloaded and installed

3. **Manual Installation**:
   - Copy extension folder to `~/.config/.pilot/extensions/`
   - Restart Pilot
   - Extension appears in the list

### Creating Extensions

See [Pi SDK documentation](https://github.com/mariozechner/pi-coding-agent/blob/main/docs/extensions.md) for extension development guide.

---

## Skills Settings

### Skill Directory

**Location**: `~/.config/.pilot/skills/`

**Purpose**: Skills are specialized instructions for specific tasks (e.g., "generate changelog", "code review").

### Installed Skills

View and manage installed skills:

| Skill | Status | Triggers |
|-------|--------|----------|
| changelog | Enabled | "generate changelog", "update CHANGELOG.md" |
| code-review | Enabled | "review this code", "code audit" |
| task-manager | Enabled | "/tasks", "create a task" |

**Enable/Disable**: Toggle the switch next to a skill.

**Remove**: Click the trash icon to delete a skill.

### Installing Skills

Same process as extensions (see above).

### Creating Skills

Skills are Markdown files with structured instructions. See [Pi SDK skills documentation](https://github.com/mariozechner/pi-coding-agent/blob/main/docs/skills.md).

---

## Developer Settings

### Developer Mode

**Purpose**: Enable advanced features for development.

**Options**:
- **Off** (default): Normal user mode
- **On**: Developer tools enabled

**When enabled**:
- Integrated terminal is available (`Cmd+\``)
- Developer console is accessible (`Cmd+Alt+I`)
- Electron DevTools are available
- Debug logging is enabled

### Terminal

#### Default Shell

**Purpose**: Shell used in the integrated terminal.

**Options**:
- **System Default** (detects `$SHELL`)
- **bash**
- **zsh**
- **fish**
- **PowerShell** (Windows)

#### Terminal Font

**Purpose**: Font used in terminal output.

**Default**: `Monaco, 'Courier New', monospace`

#### Terminal Font Size

**Range**: 10px to 20px (default: 13px)

#### Terminal Theme

**Options**:
- Match UI theme
- Solarized Dark
- Solarized Light
- Dracula
- Nord

### Code Editor

#### Editor Font

**Purpose**: Font used in code previews and diffs.

**Default**: `'SF Mono', Monaco, 'Courier New', monospace`

#### Editor Font Size

**Range**: 10px to 20px (default: 13px)

#### Tab Size

**Purpose**: Number of spaces per tab in code editor.

**Range**: 2 to 8 (default: 2)

### Logging

#### Log Level

**Purpose**: Verbosity of application logs.

**Options**:
- **Error**: Only errors
- **Warn**: Errors and warnings
- **Info** (default): General information
- **Debug**: Verbose debugging output
- **Trace**: Extremely verbose (performance impact)

#### Log Directory

**Location**: `~/.config/.pilot/logs/`

**Files**:
- `main.log` — Main process logs
- `renderer.log` — Renderer process logs
- `agent.log` — Agent session logs

---

## Keybindings Settings

### Customizing Shortcuts

1. Find the action you want to rebind
2. Click the current shortcut
3. Press the new key combination
4. Click **Save** or press `Enter`

**Example**:
```
Action: New Session
Current: Cmd+N
Click → Press Cmd+Shift+N → Save
```

### Conflicts

If your new shortcut conflicts with an existing one:
- Pilot shows a warning
- You can override (removes the old binding) or cancel

### Resetting Keybindings

**Reset All**:
1. Click **"Reset to Defaults"** at the bottom of the Keybindings tab
2. Confirm

**Reset One**:
1. Click the shortcut
2. Press `Backspace` or `Delete`
3. Click **Save** (restores default)

### Disabling Shortcuts

To disable a shortcut without assigning a new one:
1. Click the shortcut
2. Press `Backspace` or `Delete`
3. Save with an empty binding

---

## Memory Settings

### Auto-Extract Memory

**Purpose**: Automatically extract important context from conversations.

**Options**:
- **Enabled** (default): Agent proposes memory entries during conversations
- **Disabled**: Memory must be created manually

**See also**: [Memory documentation](./memory.md#auto-extraction)

### Extraction Frequency

**Purpose**: How often to run auto-extraction.

**Options**:
- **Every message**: Agent checks every response (may slow down conversations)
- **Every 5 messages** (default): Balanced
- **Every 10 messages**: Less frequent, fewer interruptions
- **Manual only**: No auto-extraction

### Memory Limit

**Purpose**: Maximum number of memory entries per tier.

**Range**: 10 to 1000 (default: 100)

**Note**: When the limit is reached, oldest entries are archived (not deleted).

### Memory Location

#### Global Memory

**Path**: `~/.config/.pilot/MEMORY.md`

**Editable**: Yes (click to open in editor)

#### Project-Shared Memory

**Path**: `<project>/.pilot/MEMORY.md`

**Git-tracked**: Configurable (see below)

### Track Project Memory in Git

**Purpose**: Commit `.pilot/MEMORY.md` to version control.

**Options**:
- **Enabled** (default): `.pilot/MEMORY.md` is committed
- **Disabled**: Add to `.gitignore`

**Recommendation**: Enable for team projects, disable for solo projects with sensitive notes.

---

## Prompts Settings

### System Prompt

**Purpose**: Base instructions for the AI agent.

**Default**: Optimized for coding assistance.

**Customization**:
1. Click **"Edit System Prompt"**
2. Modify the Markdown content
3. Click **Save**

**Variables**:
- `{{project}}` — Project name
- `{{memory}}` — Injected memory content
- `{{date}}` — Current date

**Example**:
```markdown
You are an expert coding assistant working in {{project}}.

Follow these conventions:
- Use TypeScript strict mode
- Prefer functional programming
- Write tests for all features

{{memory}}
```

### Task Prompt

**Purpose**: Instructions for task-related agent tools.

**Customization**: Same as system prompt.

### Memory Prompt

**Purpose**: Instructions for memory extraction.

**Customization**: Same as system prompt.

### Resetting Prompts

**Reset to Default**:
1. Click **"Reset to Default"** below the prompt editor
2. Confirm

**Note**: Custom prompts are lost when reset.

---

## Advanced Settings

### Session Storage

**Purpose**: Where session `.jsonl` files are stored.

**Default**: `~/.config/.pilot/sessions/`

**Change**:
1. Click **"Change Location"**
2. Select a directory
3. Existing sessions are migrated automatically

**Use case**: Store sessions on a network drive for backup.

### Cache Directory

**Purpose**: Where temporary files and caches are stored.

**Default**: `~/.config/.pilot/cache/`

**Clear Cache**:
1. Click **"Clear Cache"**
2. Confirm

**Note**: Clearing cache may slow down the next app launch (cache is rebuilt).

### Auto-Update

**Purpose**: Automatically check for and install updates.

**Options**:
- **Enabled** (default): Pilot checks for updates on launch
- **Disabled**: Manual updates only

**Manual Check**:
1. Menu: `Pilot` → `Check for Updates`
2. If an update is available, you'll be prompted to install

---

## Resetting Settings

### Reset to Defaults

**All Settings**:
1. Settings → Advanced
2. Click **"Reset All Settings"**
3. Confirm
4. Pilot restarts with default settings

**Warning**: All custom settings are lost.

### Factory Reset

**Complete Reset** (including data):
1. Quit Pilot
2. Delete `~/.config/.pilot/` directory:
   ```bash
   rm -rf ~/.config/.pilot/
   ```
3. Relaunch Pilot
4. Reconfigure from scratch

**Warning**: All sessions, memory, tasks, and settings are lost. Back up important data first.

---

## Importing/Exporting Settings

### Export Settings

1. Settings → Advanced
2. Click **"Export Settings"**
3. Save the JSON file to disk

### Import Settings

1. Settings → Advanced
2. Click **"Import Settings"**
3. Select the JSON file
4. Confirm
5. Pilot restarts with imported settings

**Use case**: Share settings with team members or transfer settings to a new machine.

---

## Settings Files

### Locations

| Setting | File |
|---------|------|
| App settings | `~/.config/.pilot/app-settings.json` |
| API keys | `~/.config/.pilot/auth.json` |
| Workspace state | `~/.config/.pilot/workspace.json` |
| Model registry | `~/.config/.pilot/models.json` |
| Extension registry | `~/.config/.pilot/extension-registry.json` |
| Companion tokens | `~/.config/.pilot/companion-tokens.json` |
| Companion TLS cert | `~/.config/.pilot/companion-cert.pem` |
| Project settings | `<project>/.pilot/settings.json` |

### Manual Editing

**Advanced users** can edit settings files directly:

1. Quit Pilot
2. Edit the JSON file in a text editor
3. Save
4. Relaunch Pilot

**Warning**: Invalid JSON will cause Pilot to fail to launch. Always back up before manual edits.

---

## Troubleshooting

### Settings Not Saving

**Check**:
1. File permissions on `~/.config/.pilot/` (should be writable)
2. Disk space (low disk space can prevent saves)
3. Developer console for errors (`Cmd+Shift+I`)

**Solution**:
```bash
chmod -R u+w ~/.config/.pilot/
```

### Settings Corrupted

**Symptoms**: Pilot fails to launch or crashes on startup.

**Solution**:
1. Quit Pilot
2. Rename the corrupted file:
   ```bash
   mv ~/.config/.pilot/app-settings.json ~/.config/.pilot/app-settings.json.backup
   ```
3. Relaunch Pilot (creates new default settings)
4. Restore custom settings manually from the backup

### Extension Conflicts

**Symptoms**: Pilot crashes when enabling an extension.

**Solution**:
1. Disable the extension (Settings → Extensions → Toggle off)
2. Report the issue to the extension author
3. If the app won't launch, manually disable in the registry:
   ```bash
   # Edit extension-registry.json and set "enabled": false
   ```

---

## Related Documentation

- **[Getting Started](./getting-started.md)** — Initial configuration
- **[Agent](./agent.md)** — Model selection and YOLO mode
- **[Memory](./memory.md)** — Memory settings and auto-extraction
- **[Keyboard Shortcuts](./keyboard-shortcuts.md)** — Keybinding customization
- **[Developer Mode](./index.md)** — Advanced features

[← Back to Documentation](./index.md)
