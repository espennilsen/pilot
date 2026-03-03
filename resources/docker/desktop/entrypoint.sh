#!/bin/bash
set -euo pipefail

# ── Chromium flags for running inside a container ────────────────────
# --no-sandbox is required because the container already provides isolation.
# --disable-gpu avoids GPU driver issues in headless environments.
export CHROMIUM_FLAGS="--no-sandbox --disable-gpu --disable-dev-shm-usage"

# Start virtual framebuffer
Xvfb "$DISPLAY" -screen 0 "$RESOLUTION" &

# Wait for Xvfb to be ready before starting services that depend on it.
# Polling with xdpyinfo is more reliable than a fixed sleep — it handles
# slow VMs and loaded CI runners where 1s may not be enough.
for i in $(seq 1 20); do
  xdpyinfo -display "$DISPLAY" >/dev/null 2>&1 && break
  sleep 0.5
done

# Start lightweight window manager
fluxbox &

# Start VNC server with per-container password authentication.
# Pipe the password via stdin to avoid exposing it in /proc/<pid>/cmdline
# during the brief storepasswd exec window. Then unset the env var so
# child processes can't read it either.
if [ -n "${VNC_PASSWORD:-}" ]; then
  echo "$VNC_PASSWORD" | x11vnc -storepasswd /dev/stdin /tmp/vncpasswd
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

# Wait for ANY background process to exit. If Xvfb, x11vnc, or websockify
# crashes, the container exits immediately instead of continuing in a
# degraded state (e.g. VNC dead but container still "running").
# `wait -n` requires bash 4.3+ (Ubuntu 24.04 ships bash 5.2).
wait -n
echo "ERROR: A critical background process exited unexpectedly" >&2
exit 1
