# Custom Themes

Pilot supports custom color themes that change the look of the entire app — including the chat interface, sidebar, terminal, and code highlighting.

## Quick Start

1. Open **Settings** (⌘/Ctrl+,)
2. Click **Appearance** in the left sidebar
3. Choose a built-in theme (Dark, Light, System) or select a custom theme

## Built-in Themes

| Theme | Style | Description |
|-------|-------|-------------|
| **Dark** | Dark | The default Pilot theme — dark background with light blue accent |
| **Light** | Light | Clean white background with blue accent |
| **System** | Auto | Follows your operating system's dark/light preference |
| **Nord** | Dark | Arctic-inspired color palette with muted blue tones |
| **Solarized Dark** | Dark | Ethan Schoonover's precision color scheme (dark variant) |
| **Solarized Light** | Light | Ethan Schoonover's precision color scheme (light variant) |
| **Monokai** | Dark | Classic code editor theme with vibrant syntax colors |

## Creating a Custom Theme

1. Go to **Settings → Appearance**
2. Click **New** in the Custom Themes section
3. Give your theme a name and choose a base (Dark or Light)
4. Adjust colors using the color pickers:
   - **App Colors** — backgrounds, text, accent, borders
   - **Terminal Colors** (optional) — 16 ANSI colors for the integrated terminal
   - **Syntax Colors** (optional) — code highlighting for keywords, strings, comments, etc.
5. See your changes live in the preview panel on the right
6. Click **Save** to save and activate your theme

## Editing a Theme

Hover over a custom theme card and click the **pencil icon** to open the theme editor.

Built-in themes are read-only — click **Duplicate** to create an editable copy.

## Import & Export

### Importing

1. Click **Import Theme** at the bottom of the Appearance settings
2. Select a `.json` theme file from your file system
3. The theme is imported and automatically activated

### Exporting

1. Activate the theme you want to export
2. Click **Export Current** to save it as a `.json` file
3. Share the file with others

## Theme File Format

Themes are stored as JSON files in your Pilot config directory:

- **macOS:** `~/.config/pilot/themes/`
- **Windows:** `%APPDATA%\pilot\themes\`
- **Linux:** `$XDG_CONFIG_HOME/pilot/themes/` (default: `~/.config/pilot/themes/`)

See the [theme JSON schema](#theme-json-schema) below for the full format.

### Theme JSON Schema

```json
{
  "name": "My Theme",
  "slug": "my-theme",
  "author": "Your Name",
  "base": "dark",
  "version": 1,
  "colors": {
    "bg-base": "#1a1b1e",
    "bg-surface": "#24262a",
    "bg-elevated": "#2c2e33",
    "text-primary": "#e0e0e0",
    "text-secondary": "#8b8d91",
    "accent": "#4fc3f7",
    "success": "#66bb6a",
    "error": "#ef5350",
    "warning": "#ffa726",
    "border": "#333539"
  },
  "terminal": {
    "background": "#1a1b1e",
    "foreground": "#e0e0e0",
    "cursor": "#4fc3f7",
    "black": "#1a1b1e",
    "red": "#ef5350",
    "green": "#66bb6a",
    "yellow": "#ffa726",
    "blue": "#4fc3f7",
    "magenta": "#ce93d8",
    "cyan": "#4dd0e1",
    "white": "#e0e0e0",
    "brightBlack": "#5a5a5a",
    "brightRed": "#ff5252",
    "brightGreen": "#69f0ae",
    "brightYellow": "#ffd740",
    "brightBlue": "#40c4ff",
    "brightMagenta": "#ea80fc",
    "brightCyan": "#64ffda",
    "brightWhite": "#ffffff"
  },
  "syntax": {
    "comment": "#8b8d91",
    "keyword": "#4fc3f7",
    "string": "#66bb6a",
    "number": "#ffa726",
    "function": "#4fc3f7",
    "variable": "#e0e0e0",
    "type": "#4dd0e1",
    "operator": "#4fc3f7"
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Display name |
| `slug` | Yes | URL-safe identifier (auto-generated from name) |
| `author` | Yes | Theme author |
| `base` | Yes | `"dark"` or `"light"` — determines fallback colors |
| `version` | Yes | Schema version (currently `1`) |
| `colors` | Yes | All 10 app color keys are required |
| `terminal` | No | Terminal color overrides (falls back to base theme) |
| `syntax` | No | Syntax highlighting overrides (falls back to base theme) |

## Tips

- **Start from a built-in theme**: Duplicate Nord or Monokai and tweak colors rather than starting from scratch
- **Check contrast**: Make sure text is readable against backgrounds — the preview shows this in real-time
- **Terminal colors**: If you skip terminal colors, Pilot uses the default dark/light terminal palette based on your theme's base
- **Syntax colors**: Same for syntax — skip them to use highlight.js defaults
