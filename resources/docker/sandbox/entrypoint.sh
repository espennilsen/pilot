#!/bin/bash
set -e

# Start virtual framebuffer
Xvfb "$DISPLAY" -screen 0 "$RESOLUTION" &
XVFB_PID=$!
sleep 1

# Start lightweight window manager
fluxbox &

# Start VNC server (no password, shared mode)
x11vnc -display "$DISPLAY" -forever -shared -nopw -rfbport 5900 &

# Start websockify → exposes VNC over WebSocket for noVNC
# noVNC static files are at /usr/share/novnc on Ubuntu 24.04
websockify --web /usr/share/novnc 6080 localhost:5900 &

echo "Sandbox ready — noVNC on port 6080, VNC on port 5900"

# Wait for Xvfb (main process) — if it dies, container exits
wait $XVFB_PID
