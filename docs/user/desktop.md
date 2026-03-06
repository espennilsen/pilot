# Desktop

Pilot's **Desktop** feature gives your AI agent a virtual display — a real Linux desktop running inside a Docker container. The agent can open browsers, click buttons, type text, take screenshots, and run GUI applications, all without touching your actual screen.

This is useful for browser testing, GUI automation, visual verification, and any workflow where the agent needs to see and interact with a graphical interface.

---

## Requirements

- **Docker Desktop** (or Docker Engine) installed and running
- Works on macOS, Windows, and Linux
- Compatible with Docker Desktop, Colima, and Rancher Desktop

---

## Quick Start

1. Open a project in Pilot
2. Open the **Desktop** tab in the context panel (right side)
3. Click **Start Desktop**
4. The virtual display appears as a live view in the panel
5. Enable **Tools** to let the agent control the desktop

That's it — the agent can now open browsers, take screenshots, and interact with the virtual display.

---

## The Desktop Panel

The Desktop panel lives in the **context panel** on the right side of the Pilot window (alongside Files, Git, and Changes).

### Status States

| Status | Meaning |
|--------|---------|
| **Running** (green dot) | Container is running, display is live |
| **Starting…** (amber, pulsing) | Container is starting up or being resumed |
| **Stopping…** (amber, pulsing) | Container is being shut down |
| **Stopped** (grey) | Container exists but is not running — can be resumed |
| **Error** (red) | Something went wrong — error message is shown |

### Controls

| Button | Description |
|--------|-------------|
| **Start** | Create and start a new desktop container |
| **Resume** | Restart a stopped container (preserves filesystem state) |
| **Stop** | Stop the container (keeps it for later resume) |
| ↻ **Rebuild** | Remove container and image, rebuild from Dockerfile, start fresh |
| ⤴ **Open in tab** | Open the desktop in a full web tab (visible when running) |
| **Tools** | Enable or disable the agent's desktop tools |

### Observe vs. Take Control

By default, the desktop viewer is in **observe mode** — you can see the virtual display but your mouse clicks and keyboard input don't reach it. This prevents you from accidentally interfering while the agent is working.

To interact with the desktop yourself, click the **Take Control** button in the bottom-right corner of the viewer. Click **Observe** to switch back to passive viewing.

The mode resets to observe whenever the container restarts.

---

## Container Lifecycle

### Starting and Stopping

When you click **Stop**, the container is **stopped but not removed**. Everything inside it — installed packages, downloaded files, browser history, running configurations — is preserved.

When you click **Resume**, the same container is restarted. You pick up exactly where you left off.

This also applies when Pilot quits — containers are stopped on exit and available to resume when you relaunch.

### Rebuilding

Click the ↻ **Rebuild** button when you need a fresh start. This:

1. Stops and removes the existing container (filesystem state is lost)
2. Deletes the project-specific Docker image
3. Rebuilds the image from `.pilot/desktop.Dockerfile` (if it exists)
4. Starts a new container

Use rebuild when:
- You've changed `.pilot/desktop.Dockerfile` and want to pick up the changes
- The container's filesystem is in a bad state
- You want a clean environment

### Opening in a Tab

Click the ⤴ icon to open the desktop in a full **web tab**. This gives you a larger view and lets you keep the context panel on a different tab while watching the desktop.

---

## Agent Tools

When tools are enabled, the agent gets 18 tools for controlling the virtual display. The agent can use these tools in conversation just like any other tool (read, write, bash, etc.).

### What the Agent Can Do

**Mouse control:**
- Click, double-click, right-click, middle-click at any screen coordinate
- Hover (move cursor without clicking)
- Drag from one point to another
- Scroll in any direction

**Keyboard input:**
- Type text strings
- Press key combinations (e.g. `ctrl+c`, `alt+Tab`, `Escape`)

**Screen capture:**
- Take screenshots — the agent sees the display as a PNG image and can analyse it to find UI elements, read text, and determine click coordinates

**Clipboard:**
- Read and write the clipboard inside the desktop

**Browser:**
- Open URLs in Chromium or Firefox with a configurable load wait time

**Shell:**
- Run arbitrary commands inside the container (install packages, run scripts, etc.)

**Lifecycle:**
- Start and stop the desktop from within a conversation
- Wait for async operations (page loads, animations) before taking screenshots

### Example Conversation

```
You:    Open my app at localhost:3000 in the desktop and check if the login page renders correctly.

Agent:  I'll start the desktop and open your app in Chromium.
        [desktop_start]
        [desktop_open_browser url="http://localhost:3000"]
        [desktop_screenshot]
        
        I can see the login page. It has:
        - Email input field at (640, 320)
        - Password input field at (640, 380)
        - "Sign In" button at (640, 440)
        
        The layout looks correct. Let me test the login flow…
        [desktop_click x=640 y=320]
        [desktop_type text="test@example.com"]
        [desktop_click x=640 y=380]
        [desktop_type text="password123"]
        [desktop_click x=640 y=440]
        [desktop_wait seconds=2]
        [desktop_screenshot]
        
        After clicking Sign In, the page redirected to the dashboard. 
        The login flow works correctly.
```

### Enabling / Disabling Tools

Tools are **disabled by default**. To enable them:

1. Open the Desktop panel in the context panel
2. Click the **Tools** toggle in the header

The toggle takes effect on the **next conversation** (not mid-stream). This is a per-project setting stored in `.pilot/settings.json`.

You can also set a global default in **Settings** → **General** → **Desktop Enabled**.

Priority: project setting overrides global setting.

---

## Custom Desktop Images

By default, the desktop runs a base image with Ubuntu 24.04, Chromium, Firefox, and Node.js 22. If your project needs additional software (Python, Java, specific browsers, etc.), you can create a custom Dockerfile.

### Creating a Custom Image

1. Create `.pilot/desktop.Dockerfile` in your project root
2. Use `pilot-desktop:latest` as the base image
3. Add whatever your project needs

**Example — adding Python and Playwright:**

```dockerfile
FROM pilot-desktop:latest

RUN apt-get update && apt-get install -y python3 python3-pip \
    && pip3 install playwright \
    && playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*
```

**Example — adding a local dev server:**

```dockerfile
FROM pilot-desktop:latest

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
```

The project-specific image is built automatically the first time you start the desktop. After editing the Dockerfile, click **Rebuild** (↻) to pick up the changes.

---

## What's Inside the Container

The base container (`pilot-desktop:latest`) includes:

| Component | Purpose |
|-----------|---------|
| **Xvfb** | Virtual framebuffer — creates a screen without a physical display |
| **fluxbox** | Lightweight window manager |
| **x11vnc** | VNC server — makes the display accessible over the network |
| **noVNC + websockify** | Browser-based VNC viewer — what you see in the panel |
| **Chromium** | Web browser |
| **Firefox** | Alternative web browser |
| **xdotool** | Mouse and keyboard automation |
| **scrot** | Screenshot capture |
| **xclip** | Clipboard management |
| **Node.js 22** | JavaScript runtime |
| **curl, wget, jq** | Common networking and data tools |
| **xterm** | Terminal emulator |

Resolution: 1280×800 pixels (configurable).

Resource limits: 2 GB memory, 2 CPU cores.

---

## How It Works (Under the Hood)

1. **Start**: Pilot builds the Docker image (if needed), allocates two random ports on localhost, and starts a container
2. **Display stack**: Inside the container, Xvfb creates a virtual screen → fluxbox manages windows → x11vnc serves VNC → websockify bridges to WebSocket → noVNC renders in the browser
3. **Agent interaction**: Agent tools call `docker exec` to run xdotool/scrot/xclip commands inside the container
4. **Screenshots**: Captured via `scrot`, extracted from the container as a tar archive, and sent to the agent as base64 PNG
5. **Viewer**: The panel embeds an iframe pointing to the container's noVNC HTTP server, with an observe/take-control overlay
6. **Stop**: The container is stopped but kept — filesystem state is preserved for resume
7. **Resume**: The stopped container is restarted; Docker assigns new host ports which the service reads automatically
8. **Rebuild**: The container and project image are removed, the image is rebuilt from the Dockerfile, and a new container is started
9. **App quit**: All containers are stopped (not removed) so they can be resumed on next launch

---

## Configuration

### Settings

| Setting | Where | Default |
|---------|-------|---------|
| Desktop tools for agent | Desktop panel → Tools toggle | Off |
| Global desktop default | Settings → General | Off |

### Files

| File | Contents |
|------|----------|
| `.pilot/settings.json` | `desktopToolsEnabled` — per-project toggle |
| `.pilot/desktop.json` | Runtime container state (auto-managed, do not edit) |
| `.pilot/desktop.Dockerfile` | Custom Docker image (optional) |

### Windows Security Note

On macOS and Linux, `.pilot/desktop.json` is written with restrictive file permissions (`600`) so only your user account can read it. On Windows, these POSIX permissions are silently ignored — the file is readable by any local user on the machine.

This file contains an ephemeral VNC password (random, per-container) used to authenticate with the virtual display. If you're on a shared Windows machine, be aware that other local users could read this password and connect to your desktop container while it's running.

---

## Troubleshooting

### "Desktop not available"

Docker is not installed or not running.

**Fix:**
1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (macOS/Windows) or Docker Engine (Linux)
2. Start Docker Desktop
3. Click **Retry** in the Desktop panel

### "Desktop noVNC did not become ready"

The container started but the display server didn't respond within 15 seconds.

**Fix:**
- Check Docker Desktop for the container's logs
- Ensure your machine has enough resources (2 GB RAM, 2 CPU cores for the container)
- Try clicking **Rebuild** to start with a fresh container

### Display shows "Connecting…" indefinitely

The noVNC server inside the container is slow to start or the port is blocked.

**Fix:**
- Wait a few more seconds — the viewer retries automatically with exponential backoff
- Check that no firewall is blocking localhost connections
- Stop and resume the desktop

### Agent can't use desktop tools

Tools are disabled by default and must be explicitly enabled.

**Fix:**
1. Open the Desktop panel
2. Click the **Tools** toggle to enable
3. Start a **new conversation** (tools are configured at session start)

### Container is in a bad state

Installed something that broke the display, or files are corrupted.

**Fix:**
- Click **Rebuild** (↻) — this removes the container and image, rebuilds from the Dockerfile, and starts fresh

### Dockerfile changes aren't picked up

The project-specific image is cached. A normal start reuses the existing container.

**Fix:**
- Click **Rebuild** (↻) to force a fresh image build and new container

---

## Related Documentation

- **[Agent](./agent.md)** — How the AI agent works and uses tools
- **[Context Panel](./context-panel.md)** — Where the Desktop panel lives
- **[Settings](./settings.md)** — Global and project settings

[← Back to Documentation](./index.md)
