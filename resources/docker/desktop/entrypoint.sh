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
xdpyinfo -display "$DISPLAY" >/dev/null 2>&1 || {
  echo "ERROR: Xvfb did not become ready within 10s" >&2; exit 1;
}

# Start lightweight window manager — auto-restart on crash so a fluxbox
# failure doesn't bring down the entire container via wait -n.
while true; do fluxbox; sleep 1; done &

# Start VNC server with per-container password authentication.
# The password is injected via a tmpfs-mounted file at /run/secrets/vnc_password
# (written by Pilot before container start). This avoids env vars which are
# permanently visible in `docker inspect`.
VNC_SECRET_FILE="/run/secrets/vnc_password"
if [ -f "$VNC_SECRET_FILE" ] && [ -s "$VNC_SECRET_FILE" ]; then
  cat "$VNC_SECRET_FILE" | x11vnc -storepasswd /dev/stdin /tmp/vncpasswd
  chmod 600 /tmp/vncpasswd
  rm -f "$VNC_SECRET_FILE"
  x11vnc -display "$DISPLAY" -forever -shared -rfbauth /tmp/vncpasswd -rfbport 5900 &
  # Wait for x11vnc to bind port 5900 (confirms it has initialised and read
  # the password file) before deleting. Mirrors the Xvfb readiness pattern above.
  for i in $(seq 1 20); do
    nc -z localhost 5900 && break
    sleep 0.5
  done
  rm -f /tmp/vncpasswd
else
  echo "ERROR: VNC password file not found at $VNC_SECRET_FILE" >&2
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
