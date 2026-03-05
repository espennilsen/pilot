FROM ubuntu:24.04@sha256:d1e2e92c075e5ca139d51a140fff46f84315c0fdce203eab2807c7e495eff4f9

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:99
ENV RESOLUTION=1280x800x24

# ── Base: virtual display, VNC, window manager, utilities ────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    x11-utils \
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

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Custom noVNC client that accepts VNC credentials via postMessage instead of
# URL query parameters — keeps the password out of the browser address bar.
COPY pilot-vnc.html /usr/share/novnc/pilot-vnc.html

EXPOSE 5900 6080

# ── Non-root user ────────────────────────────────────────────────────
RUN groupadd -g 1000 pilot && useradd -u 1000 -g 1000 -ms /bin/bash pilot

# Directory for secrets injected via putArchive before container start.
# Owned by pilot so the entrypoint can read and delete the password file.
RUN mkdir -p /run/secrets && chown pilot:pilot /run/secrets && chmod 700 /run/secrets
USER pilot

# Project files are bind-mounted here at runtime
WORKDIR /workspace

ENTRYPOINT ["/entrypoint.sh"]
