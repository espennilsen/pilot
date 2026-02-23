# Companion Access

Pilot Companion lets you access your Pilot Desktop instance from your iPhone, iPad, or any browser on the same network. You get the full Pilot experience — chat with your AI agent, review diffs, browse files, manage git, run terminal commands — all from your mobile device.

---

## How It Works

When you enable Companion Access, Pilot runs a small server alongside the desktop app. This server:

- **Serves the Pilot interface** over your local network (or remotely via Tailscale/Cloudflare)
- **Bridges all communication** between your device and the desktop app
- **Shares the same sessions** — messages you send from your phone appear on desktop and vice versa

There's no separate mobile app to install. You pair your device once, and then open Pilot in your browser or through the iOS companion app.

---

## Getting Started

### 1. Enable the Server

1. Open Pilot Desktop
2. Go to **Settings** → **Companion**
3. Toggle **Enable companion server**

The server starts on port `18088`. You'll see it running at `https://localhost:18088`.

### 2. Pair Your Device

You need to pair each device once. This creates a secure, long-lived connection token.

#### Using a PIN

1. In Settings → Companion, click **"Show PIN"**
2. A 6-digit code appears (e.g., `847293`), valid for 5 minutes
3. On your device, enter the PIN when prompted
4. Done — your device is now paired

#### Using a QR Code

1. In Settings → Companion, click **"Show QR Code"**
2. Scan the QR code with your device's camera or the Pilot companion app
3. The QR code contains everything needed to connect — host, port, and a one-time pairing token
4. Done — your device is now paired

### 3. Connect

After pairing, open Pilot in your device's browser:

```
https://<your-computer-ip>:18088
```

Or use the Pilot iOS companion app, which discovers your desktop automatically via Bonjour.

> **Note**: Your browser will show a certificate warning because Pilot uses a self-signed certificate. This is normal — accept the certificate to proceed. The connection is still encrypted.

---

## Managing Devices

### Viewing Paired Devices

Go to **Settings** → **Companion** to see all paired devices:

- Device name (e.g., "Espen's iPhone")
- Last seen time
- Connected status

### Revoking Access

To remove a device's access:

1. Go to **Settings** → **Companion**
2. Find the device in the **Paired Devices** list
3. Click **Revoke**

The device is immediately disconnected and must re-pair to connect again.

---

## Remote Access

By default, Companion Access only works on your local network (Wi-Fi). For access from anywhere:

### Tailscale (Recommended)

If you have [Tailscale](https://tailscale.com) installed:

1. Go to **Settings** → **Companion**
2. Toggle **Remote Access**
3. Pilot generates a proper TLS certificate for your tailnet
4. Access Pilot at `https://<your-device>.tail1234.ts.net:18088`

**Benefits**: Proper TLS certificates (no browser warnings), secure WireGuard tunnel, works from anywhere on your tailnet.

### Cloudflare Tunnel

If you have [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) installed:

1. Go to **Settings** → **Companion**
2. Toggle **Remote Access**
3. Pilot creates a quick tunnel (no Cloudflare account needed)
4. Access Pilot at the provided `*.trycloudflare.com` URL

**Benefits**: No account needed, works through firewalls. The URL changes each time the tunnel restarts.

---

## Mobile Layout

Pilot automatically adapts its layout for smaller screens:

### Tablet (768–1024px)

- Chat takes the full width
- Sidebar, file tree, git panel, and terminal move to a bottom tab bar
- Tap a tab to switch views

### Phone (< 768px)

- Compact header with project name and settings
- Chat takes the full width
- Bottom tab bar for Chat, Files, Git, Terminal, and Settings
- Diffs use unified view (no side-by-side)
- Touch-friendly — all tap targets are at least 44×44pt

### Desktop (> 1024px)

- Standard three-panel layout (sidebar + chat + context panel) — same as the desktop app

---

## Security

### Encryption

All companion connections use TLS encryption (HTTPS/WSS). Even on your local network, all data is encrypted in transit.

### Authentication

- Every device must pair before connecting (PIN or QR code)
- Pairing codes expire after 5 minutes
- Session tokens are long-lived and stored securely
- On iOS, tokens are stored in the Keychain
- On the desktop, tokens are stored in `<PILOT_DIR>/`

### Certificate Pinning

The iOS companion app pins the desktop's certificate fingerprint during pairing. This prevents man-in-the-middle attacks even on untrusted networks.

### Revoking Access

If a device is lost or compromised:

1. Go to Settings → Companion → Paired Devices
2. Click **Revoke** next to the device
3. The device is immediately disconnected and its token is invalidated

---

## Troubleshooting

### Can't find Pilot on the network

- Make sure the companion server is **enabled** (Settings → Companion → toggle on)
- Ensure your device and computer are on the **same Wi-Fi network**
- Check that port `18088` isn't blocked by a firewall
- Try connecting directly: `https://<computer-ip>:18088`
- To find your computer's IP: `ifconfig | grep "inet " | grep -v 127.0.0.1`

### Browser shows certificate warning

This is expected — Pilot uses a self-signed certificate. Click "Advanced" → "Proceed" (or equivalent) to continue. The connection is still encrypted.

### Connection drops frequently

- Check your Wi-Fi signal strength
- Pilot auto-reconnects after 2 seconds — the connection should recover automatically
- If using remote access, ensure Tailscale is connected or the Cloudflare tunnel is running

### PIN expired

PINs are valid for 5 minutes. Generate a new one by clicking "Show PIN" again.

### Can't accept diffs on mobile

Diff review works the same as desktop — tap **Accept** or **Reject** on each staged diff. On small screens, diffs show in unified view only (no side-by-side).

---

## Settings Reference

| Setting | Default | Description |
|---------|---------|-------------|
| Enable companion server | Off | Start/stop the HTTPS + WebSocket server |
| Port | 18088 | Server port |
| Remote Access | Off | Enable Tailscale or Cloudflare tunnel |

### Config File

Companion settings are stored in `<PILOT_DIR>/app-settings.json`.

Paired device tokens are stored separately in `<PILOT_DIR>/companion-tokens.json`.

---

## Related Documentation

- **[Settings](./settings.md)** — Full settings reference
- **[Agent](./agent.md)** — How the AI agent works
- **[Sessions](./sessions.md)** — Chat sessions and history
- **[Keyboard Shortcuts](./keyboard-shortcuts.md)** — Shortcuts reference

[← Back to Documentation](./index.md)
