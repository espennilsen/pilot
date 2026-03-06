FROM ubuntu:24.04@sha256:d1e2e92c075e5ca139d51a140fff46f84315c0fdce203eab2807c7e495eff4f9

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:99
ENV RESOLUTION=1920x1080x24

# ── Base: virtual display, VNC, window manager, utilities ────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    x11-utils \
    xdotool \
    scrot \
    x11vnc \
    fluxbox \
    feh \
    xclip \
    novnc \
    websockify \
    ca-certificates \
    curl \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Fonts — without these, pages render with missing glyphs
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-noto-cjk \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# ── Common tools an agent might need ────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Networking
    net-tools \
    iputils-ping \
    dnsutils \
    netcat-openbsd \
    # File handling
    unzip \
    jq \
    # Text & terminal
    xterm \
    && rm -rf /var/lib/apt/lists/*

# ── Node.js (for web dev workflows) ─────────────────────────────────
COPY --from=node:22-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 /usr/local/bin/node /usr/local/bin/node
COPY --from=node:22-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

# ── Browsers (via Playwright) ────────────────────────────────────────
# Ubuntu 24.04's chromium-browser and firefox are snap shims that don't
# work in containers. Playwright bundles real binaries for both and
# handles all system dependency installation via --with-deps.
# Installed to /opt/pw-browsers so they're accessible to all users.
# Wrapper scripts in /usr/local/bin provide convenient shell access.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
RUN npx playwright install --with-deps chromium firefox \
    && chmod -R o+rx /opt/pw-browsers \
    && rm -rf /tmp/npx* /tmp/npm*

# Create wrapper scripts that locate the actual binaries
RUN CHROME_BIN="$(find /opt/pw-browsers -path '*/chrome-linux/chrome' -o -path '*/chrome-linux64/chrome' | head -1)" \
    && printf '#!/bin/sh\nexec "%s" --no-sandbox --disable-gpu --disable-dev-shm-usage "$@"\n' "$CHROME_BIN" > /usr/local/bin/chromium \
    && chmod +x /usr/local/bin/chromium \
    && FF_BIN="$(find /opt/pw-browsers -path '*/firefox/firefox' -type f | head -1)" \
    && printf '#!/bin/sh\nexec "%s" "$@"\n' "$FF_BIN" > /usr/local/bin/firefox-pw \
    && chmod +x /usr/local/bin/firefox-pw

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# ── Fluxbox configuration ───────────────────────────────────────────
# Menu with installed apps and a toolbar. Installed before switching to
# non-root so we can place files in /etc/skel (inherited by useradd).
COPY fluxbox/ /etc/skel/.fluxbox/

# Custom noVNC client that accepts VNC credentials via postMessage instead of
# URL query parameters — keeps the password out of the browser address bar.
COPY pilot-vnc.html /usr/share/novnc/pilot-vnc.html

EXPOSE 5900 6080

# ── Non-root user ────────────────────────────────────────────────────
# Ubuntu 24.04 ships with a 'ubuntu' user/group at UID/GID 1000.
# Remove it first, then create our 'pilot' user at the same IDs.
RUN (userdel -r ubuntu 2>/dev/null || true) \
    && (groupdel ubuntu 2>/dev/null || true) \
    && groupadd -g 1000 pilot \
    && useradd -u 1000 -g 1000 -ms /bin/bash pilot

# Directory for secrets injected via putArchive before container start.
# Owned by pilot so the entrypoint can read and delete the password file.
RUN mkdir -p /run/secrets && chown pilot:pilot /run/secrets && chmod 700 /run/secrets
USER pilot

# Project files are bind-mounted here at runtime
WORKDIR /workspace

ENTRYPOINT ["/entrypoint.sh"]
