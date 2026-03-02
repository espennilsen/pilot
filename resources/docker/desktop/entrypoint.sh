#!/bin/bash
set -euo pipefail

# ── Chromium flags for running inside a container ────────────────────
# --no-sandbox is required because the container already provides isolation.
# --disable-gpu avoids GPU driver issues in headless environments.
export CHROMIUM_FLAGS="--no-sandbox --disable-gpu --disable-dev-shm-usage"

# Start virtual framebuffer
Xvfb "$DISPLAY" -screen 0 "$RESOLUTION" &
XVFB_PID=$!
sleep 1

# Start lightweight window manager
fluxbox &

# Start VNC server with per-container password authentication.
# Store the password in a hashed file to keep it out of the process table (`ps aux`),
# then unset the environment variable so child processes can't read it either.
if [ -n "${VNC_PASSWORD:-}" ]; then
  x11vnc -storepasswd "$VNC_PASSWORD" /tmp/vncpasswd
  unset VNC_PASSWORD
  x11vnc -display "$DISPLAY" -forever -shared -rfbauth /tmp/vncpasswd -rfbport 5900 &
else
  echo "ERROR: VNC_PASSWORD must be set and non-empty" >&2
  exit 1
fi

# Start websockify → exposes VNC over WebSocket for noVNC
# noVNC static files are at /usr/share/novnc on Ubuntu 24.04
websockify --web /usr/share/novnc 6080 localhost:5900 &

echo "Sandbox ready — noVNC on port 6080, VNC on port 5900"
echo "  Chromium: chromium-browser \$CHROMIUM_FLAGS <url>"
echo "  Firefox:  firefox <url>"

# Wait for Xvfb (main process) — if it dies, container exits
wait $XVFB_PID
