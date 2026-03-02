FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:99
ENV RESOLUTION=1280x800x24

# ── Base: virtual display, VNC, window manager, utilities ────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    xdotool \
    scrot \
    x11vnc \
    fluxbox \
    xclip \
    novnc \
    websockify \
    ca-certificates \
    curl \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# ── Browsers ─────────────────────────────────────────────────────────
# Chromium (distro package — no snap, works in containers)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium-browser \
    && rm -rf /var/lib/apt/lists/*

# Firefox
RUN apt-get update && apt-get install -y --no-install-recommends \
    firefox \
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
    # File handling
    unzip \
    jq \
    # Text & terminal
    xterm \
    && rm -rf /var/lib/apt/lists/*

# ── Node.js (for web dev workflows) ─────────────────────────────────
COPY --from=node:22-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=node:22-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 5900 6080

# ── Non-root user ────────────────────────────────────────────────────
RUN useradd -ms /bin/bash pilot
USER pilot

ENTRYPOINT ["/entrypoint.sh"]
