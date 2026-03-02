/**
 * @file Agent tool definitions for the Docker desktop virtual display.
 *
 * 16 tools covering mouse, keyboard, screen, clipboard, and lifecycle control.
 * Each tool calls execInDesktop() with xdotool/scrot/xclip commands.
 * Tools are only included when desktopToolsEnabled is true for the project.
 *
 * The project directory is bind-mounted at /workspace inside the container.
 * All commands execute with /workspace as the working directory.
 */
import { Type } from '@sinclair/typebox';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { DesktopService } from './desktop-service';

/** Maximum wait time for desktop_wait tool (seconds) */
const MAX_WAIT_SECONDS = 30;

/**
 * Create all desktop agent tools for a given project.
 * Returns an empty array if the service is not provided.
 */
export function createDesktopTools(
  service: DesktopService,
  projectPath: string,
): ToolDefinition[] {
  /** Helper: exec in desktop and return text result */
  async function exec(cmd: string): Promise<string> {
    return service.execInDesktop(projectPath, cmd);
  }

  /** Helper: exec with direct Cmd array — no shell interpolation */
  async function execCmd(args: string[]): Promise<string> {
    return service.execInDesktopCmd(projectPath, args);
  }

  /** Helper: build a simple text response */
  function textResult(text: string) {
    return { content: [{ type: 'text' as const, text }], details: {} };
  }

  return [
    // ── Mouse tools ─────────────────────────────────────────────────

    {
      name: 'desktop_click',
      label: 'Desktop Click',
      description: 'Left-click at screen coordinates (x, y) in the desktop virtual display.',
      parameters: Type.Object({
        x: Type.Number({ description: 'X coordinate' }),
        y: Type.Number({ description: 'Y coordinate' }),
      }),
      async execute(_toolCallId, params) {
        await execCmd(['xdotool', 'mousemove', '--sync', String(params.x), String(params.y), 'click', '1']);
        return textResult(`Clicked at (${params.x}, ${params.y})`);
      },
    },

    {
      name: 'desktop_double_click',
      label: 'Desktop Double Click',
      description: 'Double-click at screen coordinates (x, y) in the desktop virtual display.',
      parameters: Type.Object({
        x: Type.Number({ description: 'X coordinate' }),
        y: Type.Number({ description: 'Y coordinate' }),
      }),
      async execute(_toolCallId, params) {
        await execCmd(['xdotool', 'mousemove', '--sync', String(params.x), String(params.y), 'click', '--repeat', '2', '1']);
        return textResult(`Double-clicked at (${params.x}, ${params.y})`);
      },
    },

    {
      name: 'desktop_right_click',
      label: 'Desktop Right Click',
      description: 'Right-click at screen coordinates (x, y) in the desktop virtual display.',
      parameters: Type.Object({
        x: Type.Number({ description: 'X coordinate' }),
        y: Type.Number({ description: 'Y coordinate' }),
      }),
      async execute(_toolCallId, params) {
        await execCmd(['xdotool', 'mousemove', '--sync', String(params.x), String(params.y), 'click', '3']);
        return textResult(`Right-clicked at (${params.x}, ${params.y})`);
      },
    },

    {
      name: 'desktop_middle_click',
      label: 'Desktop Middle Click',
      description: 'Middle-click at screen coordinates (x, y) in the desktop virtual display.',
      parameters: Type.Object({
        x: Type.Number({ description: 'X coordinate' }),
        y: Type.Number({ description: 'Y coordinate' }),
      }),
      async execute(_toolCallId, params) {
        await execCmd(['xdotool', 'mousemove', '--sync', String(params.x), String(params.y), 'click', '2']);
        return textResult(`Middle-clicked at (${params.x}, ${params.y})`);
      },
    },

    {
      name: 'desktop_hover',
      label: 'Desktop Hover',
      description: 'Move the mouse cursor to screen coordinates (x, y) without clicking.',
      parameters: Type.Object({
        x: Type.Number({ description: 'X coordinate' }),
        y: Type.Number({ description: 'Y coordinate' }),
      }),
      async execute(_toolCallId, params) {
        await execCmd(['xdotool', 'mousemove', '--sync', String(params.x), String(params.y)]);
        return textResult(`Moved cursor to (${params.x}, ${params.y})`);
      },
    },

    {
      name: 'desktop_drag',
      label: 'Desktop Drag',
      description: 'Click-and-drag from (startX, startY) to (endX, endY) in the desktop virtual display.',
      parameters: Type.Object({
        startX: Type.Number({ description: 'Starting X coordinate' }),
        startY: Type.Number({ description: 'Starting Y coordinate' }),
        endX: Type.Number({ description: 'Ending X coordinate' }),
        endY: Type.Number({ description: 'Ending Y coordinate' }),
      }),
      async execute(_toolCallId, params) {
        await execCmd(['xdotool', 'mousemove', '--sync', String(params.startX), String(params.startY), 'mousedown', '1', 'mousemove', '--sync', String(params.endX), String(params.endY), 'mouseup', '1']);
        return textResult(`Dragged from (${params.startX}, ${params.startY}) to (${params.endX}, ${params.endY})`);
      },
    },

    {
      name: 'desktop_scroll',
      label: 'Desktop Scroll',
      description: 'Scroll at screen coordinates (x, y). Direction: "up", "down", "left", "right". Amount is number of scroll increments.',
      parameters: Type.Object({
        x: Type.Number({ description: 'X coordinate to scroll at' }),
        y: Type.Number({ description: 'Y coordinate to scroll at' }),
        direction: Type.Union([
          Type.Literal('up'),
          Type.Literal('down'),
          Type.Literal('left'),
          Type.Literal('right'),
        ], { description: 'Scroll direction' }),
        amount: Type.Optional(Type.Number({ description: 'Number of scroll increments (default: 3)' })),
      }),
      async execute(_toolCallId, params) {
        const amount = params.amount ?? 3;
        // xdotool: button 4=up, 5=down, 6=left, 7=right
        const buttonMap = { up: 4, down: 5, left: 6, right: 7 } as const;
        const button = buttonMap[params.direction as keyof typeof buttonMap];
        await execCmd(['xdotool', 'mousemove', '--sync', String(params.x), String(params.y), 'click', '--repeat', String(amount), String(button)]);
        return textResult(`Scrolled ${params.direction} ${amount}x at (${params.x}, ${params.y})`);
      },
    },

    // ── Keyboard tools ──────────────────────────────────────────────

    {
      name: 'desktop_type',
      label: 'Desktop Type',
      description: 'Type text string into the focused window in the desktop. For special keys, use desktop_key instead.',
      parameters: Type.Object({
        text: Type.String({ description: 'Text to type' }),
      }),
      async execute(_toolCallId, params) {
        await execCmd(['xdotool', 'type', '--', params.text]);
        return textResult(`Typed ${params.text.length} character(s)`);
      },
    },

    {
      name: 'desktop_key',
      label: 'Desktop Key',
      description: 'Press a key or key combination in the desktop. Examples: "Return", "ctrl+c", "alt+Tab", "ctrl+shift+t", "Escape", "BackSpace", "Delete", "space".',
      parameters: Type.Object({
        keys: Type.String({ description: 'Key or key combo (e.g. "ctrl+c", "Return", "alt+F4")' }),
      }),
      async execute(_toolCallId, params) {
        // Validate keys against allowlist: xdotool key names are alphanumeric with +/_ separators
        if (!/^[a-zA-Z0-9+_ -]+$/.test(params.keys)) {
          throw new Error(`Invalid key specification: "${params.keys}" — only alphanumeric characters, +, _, - and space are allowed`);
        }
        await execCmd(['xdotool', 'key', params.keys]);
        return textResult(`Pressed ${params.keys}`);
      },
    },

    // ── Screen tools ────────────────────────────────────────────────

    {
      name: 'desktop_screenshot',
      label: 'Desktop Screenshot',
      description: 'Take a screenshot of the desktop virtual display. Returns a PNG image you can analyze to determine coordinates for clicking, reading text, etc.',
      parameters: Type.Object({}),
      async execute() {
        const base64 = await service.screenshotDesktop(projectPath);
        return {
          content: [{
            type: 'image' as const,
            data: base64,
            mimeType: 'image/png',
          }],
          details: {},
        };
      },
    },

    // ── Clipboard tools ─────────────────────────────────────────────

    {
      name: 'desktop_clipboard_get',
      label: 'Desktop Clipboard Get',
      description: 'Read the current clipboard contents in the desktop.',
      parameters: Type.Object({}),
      async execute() {
        const text = await exec('xclip -selection clipboard -o 2>/dev/null || echo ""');
        return textResult(text || '(clipboard is empty)');
      },
    },

    {
      name: 'desktop_clipboard_set',
      label: 'Desktop Clipboard Set',
      description: 'Set the clipboard contents in the desktop.',
      parameters: Type.Object({
        text: Type.String({ description: 'Text to copy to clipboard' }),
      }),
      async execute(_toolCallId, params) {
        await service.execInDesktopStdin(
          projectPath,
          ['xclip', '-selection', 'clipboard'],
          params.text,
        );
        return textResult('Clipboard updated');
      },
    },

    // ── Lifecycle tools ─────────────────────────────────────────────

    {
      name: 'desktop_start',
      label: 'Desktop Start',
      description: 'Start the desktop virtual display for this project. Must be called before using other desktop tools. Returns connection info.',
      parameters: Type.Object({}),
      async execute() {
        const state = await service.startDesktop(projectPath);
        return textResult(
          `Desktop started — VNC port ${state.vncPort}, noVNC port ${state.wsPort}\n` +
          `noVNC URL: http://localhost:${state.wsPort}/vnc.html?autoconnect=true\n` +
          `(VNC authentication is configured — the UI connects automatically)`
        );
      },
    },

    {
      name: 'desktop_stop',
      label: 'Desktop Stop',
      description: 'Stop the desktop virtual display for this project.',
      parameters: Type.Object({}),
      async execute() {
        await service.stopDesktop(projectPath);
        return textResult('Desktop stopped');
      },
    },

    {
      name: 'desktop_wait',
      label: 'Desktop Wait',
      description: `Wait for a specified number of seconds (max ${MAX_WAIT_SECONDS}). Useful to let animations, page loads, or other async operations complete before taking a screenshot.`,
      parameters: Type.Object({
        seconds: Type.Number({ description: `Seconds to wait (max ${MAX_WAIT_SECONDS})` }),
      }),
      async execute(_toolCallId, params) {
        const seconds = Math.min(Math.max(0, params.seconds), MAX_WAIT_SECONDS);
        await execCmd(['sleep', String(seconds)]);
        return textResult(`Waited ${seconds}s`);
      },
    },

    {
      name: 'desktop_open_browser',
      label: 'Desktop Open Browser',
      description: 'Open a URL in a browser inside the desktop. Launches Chromium by default. The browser runs in the virtual display — use desktop_screenshot to see the page.',
      parameters: Type.Object({
        url: Type.String({ description: 'URL to open (e.g. "https://example.com" or "http://localhost:3000")' }),
        browser: Type.Optional(Type.Union([
          Type.Literal('chromium'),
          Type.Literal('firefox'),
        ], { description: 'Browser to use. Default: chromium', default: 'chromium' })),
        wait: Type.Optional(Type.Number({ description: 'Seconds to wait for the page to load before returning. Default: 3', default: 3, minimum: 0, maximum: 30 })),
      }),
      async execute(_toolCallId, params) {
        const browser = params.browser || 'chromium';
        const wait = params.wait ?? 3;

        // Use execCmd with an argument array to avoid shell interpolation.
        // Chromium flags are inlined rather than relying on $CHROMIUM_FLAGS shell expansion.
        if (browser === 'firefox') {
          await execCmd(['nohup', 'firefox', '--', params.url]);
        } else {
          await execCmd(['nohup', 'chromium-browser', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--', params.url]);
        }

        if (wait > 0) {
          await new Promise(resolve => setTimeout(resolve, wait * 1000));
        }

        return textResult(`Opened ${params.url} in ${browser}. Use desktop_screenshot to see the page.`);
      },
    },

    {
      name: 'desktop_exec',
      label: 'Desktop Exec',
      description: 'Run an arbitrary shell command inside the desktop container. The project directory is mounted at /workspace (the default working directory). Returns stdout and stderr. Use for installing packages, running scripts, launching applications, building the project, etc.',
      parameters: Type.Object({
        command: Type.String({ description: 'Shell command to execute' }),
      }),
      async execute(_toolCallId, params) {
        const output = await exec(params.command);
        return textResult(output || '(no output)');
      },
    },
  ];
}
