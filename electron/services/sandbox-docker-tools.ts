/**
 * @file Agent tool definitions for the Docker sandbox virtual display.
 *
 * 16 tools covering mouse, keyboard, screen, clipboard, and lifecycle control.
 * Each tool calls execInSandbox() with xdotool/scrot/xclip commands.
 * Tools are only included when dockerToolsEnabled is true for the project.
 */
import { Type } from '@sinclair/typebox';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { SandboxDockerService } from './sandbox-docker-service';

/** Maximum wait time for sandbox_wait tool (seconds) */
const MAX_WAIT_SECONDS = 30;

/**
 * Create all sandbox agent tools for a given project.
 * Returns an empty array if the service is not provided.
 */
export function createSandboxDockerTools(
  service: SandboxDockerService,
  projectPath: string,
): ToolDefinition[] {
  /** Helper: exec in sandbox and return text result */
  async function exec(cmd: string): Promise<string> {
    return service.execInSandbox(projectPath, cmd);
  }

  /** Helper: build a simple text response */
  function textResult(text: string) {
    return { content: [{ type: 'text' as const, text }], details: {} };
  }

  return [
    // ── Mouse tools ─────────────────────────────────────────────────

    {
      name: 'sandbox_click',
      label: 'Sandbox Click',
      description: 'Left-click at screen coordinates (x, y) in the sandbox virtual display.',
      parameters: Type.Object({
        x: Type.Number({ description: 'X coordinate' }),
        y: Type.Number({ description: 'Y coordinate' }),
      }),
      async execute(_toolCallId, params) {
        await exec(`xdotool mousemove --sync ${params.x} ${params.y} click 1`);
        return textResult(`Clicked at (${params.x}, ${params.y})`);
      },
    },

    {
      name: 'sandbox_double_click',
      label: 'Sandbox Double Click',
      description: 'Double-click at screen coordinates (x, y) in the sandbox virtual display.',
      parameters: Type.Object({
        x: Type.Number({ description: 'X coordinate' }),
        y: Type.Number({ description: 'Y coordinate' }),
      }),
      async execute(_toolCallId, params) {
        await exec(`xdotool mousemove --sync ${params.x} ${params.y} click --repeat 2 1`);
        return textResult(`Double-clicked at (${params.x}, ${params.y})`);
      },
    },

    {
      name: 'sandbox_right_click',
      label: 'Sandbox Right Click',
      description: 'Right-click at screen coordinates (x, y) in the sandbox virtual display.',
      parameters: Type.Object({
        x: Type.Number({ description: 'X coordinate' }),
        y: Type.Number({ description: 'Y coordinate' }),
      }),
      async execute(_toolCallId, params) {
        await exec(`xdotool mousemove --sync ${params.x} ${params.y} click 3`);
        return textResult(`Right-clicked at (${params.x}, ${params.y})`);
      },
    },

    {
      name: 'sandbox_middle_click',
      label: 'Sandbox Middle Click',
      description: 'Middle-click at screen coordinates (x, y) in the sandbox virtual display.',
      parameters: Type.Object({
        x: Type.Number({ description: 'X coordinate' }),
        y: Type.Number({ description: 'Y coordinate' }),
      }),
      async execute(_toolCallId, params) {
        await exec(`xdotool mousemove --sync ${params.x} ${params.y} click 2`);
        return textResult(`Middle-clicked at (${params.x}, ${params.y})`);
      },
    },

    {
      name: 'sandbox_hover',
      label: 'Sandbox Hover',
      description: 'Move the mouse cursor to screen coordinates (x, y) without clicking.',
      parameters: Type.Object({
        x: Type.Number({ description: 'X coordinate' }),
        y: Type.Number({ description: 'Y coordinate' }),
      }),
      async execute(_toolCallId, params) {
        await exec(`xdotool mousemove --sync ${params.x} ${params.y}`);
        return textResult(`Moved cursor to (${params.x}, ${params.y})`);
      },
    },

    {
      name: 'sandbox_drag',
      label: 'Sandbox Drag',
      description: 'Click-and-drag from (startX, startY) to (endX, endY) in the sandbox virtual display.',
      parameters: Type.Object({
        startX: Type.Number({ description: 'Starting X coordinate' }),
        startY: Type.Number({ description: 'Starting Y coordinate' }),
        endX: Type.Number({ description: 'Ending X coordinate' }),
        endY: Type.Number({ description: 'Ending Y coordinate' }),
      }),
      async execute(_toolCallId, params) {
        await exec(
          `xdotool mousemove --sync ${params.startX} ${params.startY} mousedown 1 ` +
          `mousemove --sync ${params.endX} ${params.endY} mouseup 1`
        );
        return textResult(`Dragged from (${params.startX}, ${params.startY}) to (${params.endX}, ${params.endY})`);
      },
    },

    {
      name: 'sandbox_scroll',
      label: 'Sandbox Scroll',
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
        await exec(
          `xdotool mousemove --sync ${params.x} ${params.y} ` +
          `click --repeat ${amount} ${button}`
        );
        return textResult(`Scrolled ${params.direction} ${amount}x at (${params.x}, ${params.y})`);
      },
    },

    // ── Keyboard tools ──────────────────────────────────────────────

    {
      name: 'sandbox_type',
      label: 'Sandbox Type',
      description: 'Type text string into the focused window in the sandbox. For special keys, use sandbox_key instead.',
      parameters: Type.Object({
        text: Type.String({ description: 'Text to type' }),
      }),
      async execute(_toolCallId, params) {
        // Use xdotool type with -- to prevent flag interpretation
        // Escape single quotes for shell safety
        const escaped = params.text.replace(/'/g, "'\\''");
        await exec(`xdotool type -- '${escaped}'`);
        return textResult(`Typed ${params.text.length} character(s)`);
      },
    },

    {
      name: 'sandbox_key',
      label: 'Sandbox Key',
      description: 'Press a key or key combination in the sandbox. Examples: "Return", "ctrl+c", "alt+Tab", "ctrl+shift+t", "Escape", "BackSpace", "Delete", "space".',
      parameters: Type.Object({
        keys: Type.String({ description: 'Key or key combo (e.g. "ctrl+c", "Return", "alt+F4")' }),
      }),
      async execute(_toolCallId, params) {
        await exec(`xdotool key ${params.keys}`);
        return textResult(`Pressed ${params.keys}`);
      },
    },

    // ── Screen tools ────────────────────────────────────────────────

    {
      name: 'sandbox_screenshot',
      label: 'Sandbox Screenshot',
      description: 'Take a screenshot of the sandbox virtual display. Returns a PNG image you can analyze to determine coordinates for clicking, reading text, etc.',
      parameters: Type.Object({}),
      async execute() {
        const base64 = await service.screenshotSandbox(projectPath);
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
      name: 'sandbox_clipboard_get',
      label: 'Sandbox Clipboard Get',
      description: 'Read the current clipboard contents in the sandbox.',
      parameters: Type.Object({}),
      async execute() {
        const text = await exec('xclip -selection clipboard -o 2>/dev/null || echo ""');
        return textResult(text || '(clipboard is empty)');
      },
    },

    {
      name: 'sandbox_clipboard_set',
      label: 'Sandbox Clipboard Set',
      description: 'Set the clipboard contents in the sandbox.',
      parameters: Type.Object({
        text: Type.String({ description: 'Text to copy to clipboard' }),
      }),
      async execute(_toolCallId, params) {
        const escaped = params.text.replace(/'/g, "'\\''");
        await exec(`echo '${escaped}' | xclip -selection clipboard`);
        return textResult('Clipboard updated');
      },
    },

    // ── Lifecycle tools ─────────────────────────────────────────────

    {
      name: 'sandbox_start',
      label: 'Sandbox Start',
      description: 'Start the sandbox virtual display for this project. Must be called before using other sandbox tools. Returns connection info.',
      parameters: Type.Object({}),
      async execute() {
        const state = await service.startSandbox(projectPath);
        return textResult(
          `Sandbox started — VNC port ${state.vncPort}, noVNC port ${state.wsPort}\n` +
          `noVNC URL: http://localhost:${state.wsPort}/vnc.html?autoconnect=true`
        );
      },
    },

    {
      name: 'sandbox_stop',
      label: 'Sandbox Stop',
      description: 'Stop the sandbox virtual display for this project.',
      parameters: Type.Object({}),
      async execute() {
        await service.stopSandbox(projectPath);
        return textResult('Sandbox stopped');
      },
    },

    {
      name: 'sandbox_wait',
      label: 'Sandbox Wait',
      description: `Wait for a specified number of seconds (max ${MAX_WAIT_SECONDS}). Useful to let animations, page loads, or other async operations complete before taking a screenshot.`,
      parameters: Type.Object({
        seconds: Type.Number({ description: `Seconds to wait (max ${MAX_WAIT_SECONDS})` }),
      }),
      async execute(_toolCallId, params) {
        const seconds = Math.min(Math.max(0, params.seconds), MAX_WAIT_SECONDS);
        await exec(`sleep ${seconds}`);
        return textResult(`Waited ${seconds}s`);
      },
    },

    {
      name: 'sandbox_open_browser',
      label: 'Sandbox Open Browser',
      description: 'Open a URL in a browser inside the sandbox. Launches Chromium by default. The browser runs in the virtual display — use sandbox_screenshot to see the page.',
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
        const url = params.url;

        let cmd: string;
        if (browser === 'firefox') {
          cmd = `firefox "${url}" &`;
        } else {
          cmd = `chromium-browser $CHROMIUM_FLAGS "${url}" &`;
        }

        await exec(cmd);

        if (wait > 0) {
          await new Promise(resolve => setTimeout(resolve, wait * 1000));
        }

        return textResult(`Opened ${url} in ${browser}. Use sandbox_screenshot to see the page.`);
      },
    },

    {
      name: 'sandbox_exec',
      label: 'Sandbox Exec',
      description: 'Run an arbitrary shell command inside the sandbox container. Returns stdout and stderr. Use for installing packages, running scripts, launching applications, etc.',
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
