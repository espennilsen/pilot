/**
 * @file Docker desktop service — manages project-scoped containers with virtual display.
 *
 * Each desktop is a Docker container running Xvfb + fluxbox + x11vnc + noVNC,
 * keyed by projectPath. The agent can control the virtual display via xdotool,
 * take screenshots via scrot, and interact with the clipboard via xclip.
 */
import Dockerode from 'dockerode';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { isWithinDir } from '../utils/paths';
import { isWindowsPathSafe } from '../utils/ipc-validation';
import { existsSync, lstatSync, statSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { createHash, randomBytes } from 'crypto';
import { createServer, createConnection } from 'net';
import { IPC } from '../../shared/ipc';
import { broadcastToRenderer } from '../utils/broadcast';
import type { DesktopState, DesktopConfig } from '../../shared/types';

/** Docker image name for the base desktop */
const DESKTOP_IMAGE = 'pilot-desktop:latest';

/** Project-specific image tag prefix — full tag is pilot-desktop-<hash>:latest */
const PROJECT_IMAGE_PREFIX = 'pilot-desktop-project-';

/** Default virtual display resolution */
const DEFAULT_RESOLUTION = '1280x800x24';

/** Max time (ms) to wait for noVNC to become ready after container start */
const READY_TIMEOUT_MS = 15_000;

/** Poll interval (ms) when waiting for noVNC readiness */
const READY_POLL_MS = 500;

/**
 * Resolve Docker connection options for the current platform.
 *
 * Priority:
 * 1. `DOCKER_HOST` env var (user/CI override)
 * 2. Platform-specific defaults:
 *    - Windows: named pipe `//./pipe/docker_engine`
 *    - macOS / Linux: probe known socket paths
 */
function resolveDockerOptions(): Dockerode.DockerOptions {
  // 1. Respect DOCKER_HOST env var
  const dockerHost = process.env.DOCKER_HOST;
  if (dockerHost) {
    if (dockerHost.startsWith('unix://')) {
      return { socketPath: dockerHost.replace('unix://', '') };
    }
    if (dockerHost.startsWith('npipe://')) {
      return { socketPath: dockerHost.replace('npipe://', '') };
    }
    if (dockerHost.startsWith('tcp://')) {
      const url = new URL(dockerHost);
      return { host: url.hostname, port: Number(url.port) || 2375 };
    }
  }

  // 2. Windows: named pipe
  if (process.platform === 'win32') {
    return { socketPath: '//./pipe/docker_engine' };
  }

  // 3. macOS / Linux: probe known socket paths
  const home = homedir();
  const candidates = [
    join(home, '.docker/run/docker.sock'),     // Docker Desktop (macOS & Linux)
    '/var/run/docker.sock',                     // Linux standard / macOS legacy symlink
    join(home, '.colima/default/docker.sock'),  // Colima
    join(home, '.rd/docker.sock'),              // Rancher Desktop
  ];

  for (const socketPath of candidates) {
    try {
      // Use lstatSync to detect the socket even if it's a symlink —
      // existsSync follows symlinks and returns false for dangling ones.
      const stat = lstatSync(socketPath);
      if (stat.isSocket()) {
        return { socketPath };
      }
      // It might be a symlink to a valid socket (existsSync follows the link)
      if (stat.isSymbolicLink() && existsSync(socketPath)) {
        return { socketPath };
      }
    } catch {
      // Path doesn't exist — try next
    }
  }

  // Fallback: let Dockerode use its default. The error at connection time
  // will be more informative than throwing here.
  return {};
}

/**
 * Thrown when a startDesktop call detects it has been superseded by a
 * rebuildDesktop. The superseded call cleans up its own container and
 * yields control — no error state is written to this.desktops.
 */
class DesktopSupersededError extends Error {
  constructor() { super('Desktop start superseded by rebuild'); }
}

export class DesktopService {
  private docker: Dockerode;
  private desktops = new Map<string, DesktopState>();

  /**
   * Abort controllers for in-flight startDesktop calls, keyed by projectPath.
   * Used by rebuildDesktop to cancel a concurrent start so it doesn't orphan
   * a container that no longer appears in this.desktops.
   */
  private startAbortControllers = new Map<string, AbortController>();

  /** Monotonic counter for unique screenshot filenames inside containers. */
  private screenshotCounter = 0;

  constructor() {
    this.docker = new Dockerode(resolveDockerOptions());
  }

  // ── Public API ───────────────────────────────────────────────────

  /** Check whether Docker is available and responsive. */
  async isDockerAvailable(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  /** Start a desktop container for a project. Restarts a stopped container if one exists. */
  async startDesktop(projectPath: string): Promise<DesktopState> {
    // Already running or starting? Return existing state.
    const existing = this.desktops.get(projectPath);
    if (existing && (existing.status === 'running' || existing.status === 'starting')) {
      return existing;
    }

    // Write a 'starting' sentinel immediately — before any await — to prevent
    // a second concurrent call from passing the guard above.
    const sentinel: DesktopState = {
      containerId: existing?.containerId ?? '',
      wsPort: 0,
      vncPort: 0,
      status: 'starting',
      createdAt: Date.now(),
      vncPassword: existing?.vncPassword,
    };
    this.desktops.set(projectPath, sentinel);
    this.pushEvent(projectPath, { status: 'starting' });

    // Cancel any previous in-flight start and create a new abort controller.
    // rebuildDesktop aborts this signal to prevent the current start from
    // writing state after the rebuild has cleared it — avoiding orphaned containers.
    this.startAbortControllers.get(projectPath)?.abort();
    const abortController = new AbortController();
    this.startAbortControllers.set(projectPath, abortController);
    const { signal } = abortController;

    try {
      // Try to restart an existing stopped container
      const restarted = await this.tryRestartContainer(projectPath);
      if (restarted) return restarted;

      // Check if a rebuild superseded this start while we were restarting
      if (signal.aborted) throw new DesktopSupersededError();

      // No existing container — create a new one
      await this.ensureImage();
      const image = await this.ensureProjectImage(projectPath);

      // Retry port allocation + container creation to handle TOCTOU races
      // where a port is freed then claimed by another process before Docker binds it.
      const PORT_RETRY_ATTEMPTS = 3;
      let container: Dockerode.Container | undefined;
      let vncPort = 0;
      let wsPort = 0;

      // Generate a per-container VNC password for authentication.
      // VNC's RFB auth uses DES which silently truncates to the first 8 characters.
      // We generate exactly 8 to match effective entropy (48 bits from 6 random bytes).
      const vncPassword = randomBytes(6).toString('base64url').slice(0, 8);

      for (let attempt = 1; attempt <= PORT_RETRY_ATTEMPTS; attempt++) {
        // Bail early if a rebuild superseded this start — avoids wasting
        // 2-5s per iteration creating containers that will just be cleaned up.
        if (signal.aborted) throw new DesktopSupersededError();

        [vncPort, wsPort] = await Promise.all([
          this.findAvailablePort(),
          this.findAvailablePort(),
        ]);

        try {
          container = await this.docker.createContainer({
            Image: image,
            Env: [`RESOLUTION=${DEFAULT_RESOLUTION}`, `VNC_PASSWORD=${vncPassword}`],
            Labels: {
              'pilot.desktop': 'true',
              'pilot.project': projectPath,
            },
            ExposedPorts: { '5900/tcp': {}, '6080/tcp': {} },
            HostConfig: {
              PortBindings: {
                '5900/tcp': [{ HostIp: '127.0.0.1', HostPort: String(vncPort) }],
                '6080/tcp': [{ HostIp: '127.0.0.1', HostPort: String(wsPort) }],
              },
              // Mount the project directory read-only — code changes should go through
              // Pilot's diff staging system, not via direct writes inside the container.
              Binds: [`${projectPath}:/workspace:ro`],
              // Reasonable resource limits
              Memory: 2 * 1024 * 1024 * 1024, // 2 GB
              NanoCpus: 2_000_000_000,         // 2 CPUs
            },
          });

          await container.start();
          break; // Success — exit retry loop
        } catch (portErr: unknown) {
          // Always clean up partially-created container before retry or rethrow
          if (container) {
            try { await container.remove({ force: true }); } catch { /* best effort */ }
            container = undefined;
          }
          const msg = portErr instanceof Error ? portErr.message : String(portErr);
          const isPortConflict = msg.includes('port is already allocated') || msg.includes('address already in use');
          if (!isPortConflict || attempt === PORT_RETRY_ATTEMPTS) {
            throw portErr; // Not a port conflict or out of retries
          }
        }
      }

      if (!container) {
        throw new Error('Failed to create desktop container after port allocation retries');
      }

      // Check if a rebuild superseded this start while we were creating the container.
      // Clean up the container we just created since the rebuild is in charge now.
      if (signal.aborted) {
        await container.remove({ force: true }).catch(() => {});
        throw new DesktopSupersededError();
      }

      const state: DesktopState = {
        containerId: container.id,
        wsPort,
        vncPort,
        status: 'starting',
        createdAt: Date.now(),
        vncPassword,
      };
      this.desktops.set(projectPath, state);

      // Wait for noVNC to be ready
      await this.waitForReady(wsPort, signal);

      // Final abort check — if superseded during waitForReady, clean up
      if (signal.aborted) {
        await container.stop({ t: 2 }).catch(() => {});
        await container.remove({ force: true }).catch(() => {});
        throw new DesktopSupersededError();
      }

      state.status = 'running';
      this.desktops.set(projectPath, { ...state });
      this.persistConfig(projectPath, state);
      this.pushEvent(projectPath, state);

      return { ...state };
    } catch (err: unknown) {
      // If this start was superseded by a rebuild, don't overwrite the map —
      // the rebuild's startDesktop is now in charge of the project's state.
      if (err instanceof DesktopSupersededError) throw err;

      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorState: DesktopState = {
        containerId: '',
        wsPort: 0,
        vncPort: 0,
        status: 'error',
        createdAt: Date.now(),
        error: errorMsg,
      };
      this.desktops.set(projectPath, errorState);
      this.pushEvent(projectPath, errorState);
      throw err;
    } finally {
      this.startAbortControllers.delete(projectPath);
    }
  }

  /** Stop all running desktop containers. Called on app quit. */
  async stopAll(): Promise<void> {
    const projects = [...this.desktops.keys()];
    await Promise.allSettled(projects.map(p => this.stopDesktop(p)));
  }

  /**
   * Stop the desktop container for a project (without removing it).
   * The container is preserved so it can be restarted later with its
   * filesystem state intact.
   */
  async stopDesktop(projectPath: string): Promise<void> {
    const state = this.desktops.get(projectPath);
    if (!state || !state.containerId) return;

    this.pushEvent(projectPath, { ...state, status: 'stopping' });

    try {
      const container = this.docker.getContainer(state.containerId);
      await container.stop({ t: 5 }).catch(() => { /* may already be stopped */ });
    } catch {
      // Best effort — container might be gone already
    }

    const stoppedState: DesktopState = {
      containerId: state.containerId,
      wsPort: 0,
      vncPort: 0,
      status: 'stopped',
      createdAt: state.createdAt,
      vncPassword: state.vncPassword,
    };
    this.desktops.set(projectPath, stoppedState);
    this.persistConfig(projectPath, stoppedState);
    this.pushEvent(projectPath, stoppedState);
  }

  /**
   * Rebuild the desktop container for a project.
   * Stops and removes the existing container, removes the project-specific
   * Docker image (if any), then starts a fresh container from a rebuilt image.
   */
  async rebuildDesktop(projectPath: string): Promise<DesktopState> {
    // Cancel any in-flight startDesktop so it doesn't orphan a container
    // by writing state after we've cleared the map entry below.
    this.startAbortControllers.get(projectPath)?.abort();

    const state = this.desktops.get(projectPath);

    // Stop and remove existing container
    if (state?.containerId) {
      try {
        const container = this.docker.getContainer(state.containerId);
        await container.stop({ t: 5 }).catch(() => {});
        await container.remove({ force: true }).catch(() => {});
      } catch { /* best effort */ }
    }

    this.desktops.delete(projectPath);
    this.removePersisted(projectPath);

    // Remove project-specific image to force a rebuild
    const hash = createHash('sha256').update(projectPath).digest('hex').slice(0, 12);
    const projectImage = `${PROJECT_IMAGE_PREFIX}${hash}:latest`;
    try {
      await this.docker.getImage(projectImage).remove({ force: true });
    } catch { /* image may not exist */ }

    // Start fresh — ensureProjectImage will rebuild from Dockerfile
    return this.startDesktop(projectPath);
  }

  /** Get current desktop status for a project. Returns null if no desktop. */
  async getDesktopStatus(projectPath: string): Promise<DesktopState | null> {
    const cached = this.desktops.get(projectPath);
    if (cached) return { ...cached };

    // Check persisted config
    const config = this.loadPersistedConfig(projectPath);
    if (!config || !config.containerId) return null;

    // Verify container still exists
    try {
      const container = this.docker.getContainer(config.containerId);
      const info = await container.inspect();

      if (info.State.Running) {
        const state: DesktopState = {
          containerId: config.containerId,
          wsPort: config.wsPort,
          vncPort: config.vncPort,
          status: 'running',
          createdAt: config.createdAt,
          vncPassword: config.vncPassword,
        };
        this.desktops.set(projectPath, state);
        return state;
      }

      // Container exists but is stopped
      const state: DesktopState = {
        containerId: config.containerId,
        wsPort: 0,
        vncPort: 0,
        status: 'stopped',
        createdAt: config.createdAt,
        vncPassword: config.vncPassword,
      };
      this.desktops.set(projectPath, state);
      return state;
    } catch {
      // Container is gone
    }

    this.removePersisted(projectPath);
    return null;
  }

  /** Execute a shell command inside the desktop container. Returns stdout. */
  async execInDesktop(projectPath: string, command: string): Promise<string> {
    return this.execInDesktopCmd(projectPath, ['bash', '-c', command]);
  }

  /** Execute a command inside the desktop container using a direct Cmd array (no shell). */
  async execInDesktopCmd(projectPath: string, cmd: string[]): Promise<string> {
    const state = this.desktops.get(projectPath);
    if (!state || state.status !== 'running') {
      throw new Error('No running desktop for this project');
    }

    const container = this.docker.getContainer(state.containerId);
    const exec = await container.exec({
      Cmd: cmd,
      Env: ['DISPLAY=:99'],
      WorkingDir: '/workspace',
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ Detach: false, Tty: false });
    const { stdout, stderr } = await this.collectStream(stream);

    const info = await exec.inspect();
    if (info.ExitCode !== 0) {
      const output = stderr || stdout || '(no output)';
      throw new Error(`Command exited with code ${info.ExitCode}: ${output}`);
    }

    return stderr ? `${stdout}\n[stderr] ${stderr}` : stdout;
  }

  /**
   * Execute a command inside the desktop container, piping data to its stdin.
   * Uses Docker exec's native stdin attachment — no shell escaping needed.
   */
  async execInDesktopStdin(projectPath: string, cmd: string[], stdinData: string): Promise<string> {
    const state = this.desktops.get(projectPath);
    if (!state || state.status !== 'running') {
      throw new Error('No running desktop for this project');
    }

    const container = this.docker.getContainer(state.containerId);
    const exec = await container.exec({
      Cmd: cmd,
      Env: ['DISPLAY=:99'],
      WorkingDir: '/workspace',
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ Detach: false, Tty: false, hijack: true });
    stream.write(stdinData);
    stream.end();
    const { stdout, stderr } = await this.collectStream(stream);

    const info = await exec.inspect();
    if (info.ExitCode !== 0) {
      const output = stderr || stdout || '(no output)';
      throw new Error(`Command exited with code ${info.ExitCode}: ${output}`);
    }

    return stderr ? `${stdout}\n[stderr] ${stderr}` : stdout;
  }

  /** Take a screenshot of the virtual display. Returns base64-encoded PNG. */
  async screenshotDesktop(projectPath: string): Promise<string> {
    const state = this.desktops.get(projectPath);
    if (!state || state.status !== 'running') {
      throw new Error('No running desktop for this project');
    }

    // Use a unique filename to prevent races when concurrent calls (parallel
    // subagents, rapid polling) overlap — a second scrot would overwrite the
    // file while the first is being read via tar archive.
    const screenshotId = ++this.screenshotCounter;
    const screenshotPath = `/tmp/screen-${screenshotId}.png`;

    // Capture screenshot inside container
    await this.execInDesktop(projectPath, `DISPLAY=:99 scrot -o ${screenshotPath}`);

    // Read the file out via tar archive
    const container = this.docker.getContainer(state.containerId);
    const archive = await container.getArchive({ path: screenshotPath });

    // The archive is a tar stream — extract the single file
    const chunks: Buffer[] = [];
    for await (const chunk of archive as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    const tarBuffer = Buffer.concat(chunks);

    try {
      // Tar header is 512 bytes, file content follows. Search for the PNG magic
      // bytes starting at offset 512 to avoid false matches inside the tar header.
      const TAR_HEADER_SIZE = 512;
      const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const pngStart = tarBuffer.indexOf(pngMagic, TAR_HEADER_SIZE);
      if (pngStart === -1) {
        throw new Error('Screenshot capture failed — PNG not found in archive');
      }

      // Find end of PNG (IEND chunk + CRC)
      const iend = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
      const pngEnd = tarBuffer.indexOf(iend, pngStart);
      if (pngEnd === -1) {
        throw new Error('Screenshot capture failed — malformed PNG');
      }

      const pngBuffer = tarBuffer.subarray(pngStart, pngEnd + iend.length);
      return pngBuffer.toString('base64');
    } finally {
      // Clean up the temp file inside the container on both success and error.
      // Without this, every failed screenshot leaves a uniquely-named file in
      // /tmp that accumulates over long-running sessions.
      this.execInDesktop(projectPath, `rm -f ${screenshotPath}`).catch(() => {});
    }
  }

  /** Reconcile persisted desktop configs on app startup. */
  async reconcileOnStartup(): Promise<void> {
    if (!(await this.isDockerAvailable())) return;

    // Find all pilot-desktop containers (running or stopped)
    try {
      const containers = await this.docker.listContainers({
        all: true,
        filters: { label: ['pilot.desktop=true'] },
      });

      // Group containers by project to detect duplicates from previous crashes
      const byProject = new Map<string, typeof containers>();
      for (const containerInfo of containers) {
        const projectPath = containerInfo.Labels['pilot.project'];
        if (!projectPath) continue;

        // Validate the label value to prevent writes to arbitrary paths
        // from crafted Docker labels (e.g. /etc, C:\Windows).
        // Uses the same blocklist as validateProjectPath in ipc-validation.ts.
        const resolved = resolve(projectPath);
        if (process.platform === 'win32') {
          if (!/^[A-Za-z]:\\/.test(resolved) || !isWindowsPathSafe(resolved)) {
            console.warn(`[Desktop] Ignoring container with invalid pilot.project label: ${projectPath}`);
            continue;
          }
        } else {
          if (!isWithinDir(homedir(), resolved)) {
            console.warn(`[Desktop] Ignoring container with suspicious pilot.project label: ${projectPath}`);
            continue;
          }
        }

        const group = byProject.get(projectPath) ?? [];
        group.push(containerInfo);
        byProject.set(projectPath, group);
      }

      for (const [projectPath, group] of byProject) {
        // Sort by creation time descending — keep the newest
        group.sort((a, b) => b.Created - a.Created);
        const [keep, ...duplicates] = group;

        // Remove duplicate containers
        for (const dup of duplicates) {
          try {
            const c = this.docker.getContainer(dup.Id);
            await c.remove({ force: true });
          } catch { /* best effort */ }
        }

        if (keep.State === 'running') {
          const ports = keep.Ports ?? [];
          const vncMapping = ports.find(p => p.PrivatePort === 5900);
          const wsMapping = ports.find(p => p.PrivatePort === 6080);

          // Recover VNC password from persisted config (baked in container env)
          const persistedConfig = this.loadPersistedConfig(projectPath);

          if (!persistedConfig?.vncPassword) {
            // Password lost (config deleted, first run after upgrade, etc.) — the running
            // container expects a password but we can't provide one, so the renderer would
            // silently fail to authenticate. Force-rebuild the container.
            console.warn(`[Desktop] VNC password missing from persisted config for running container ${keep.Id.slice(0, 12)} (${projectPath}). Rebuilding container.`);
            try {
              const c = this.docker.getContainer(keep.Id);
              await c.remove({ force: true });
            } catch { /* best effort */ }
            this.removePersisted(projectPath);
            continue;
          }

          const state: DesktopState = {
            containerId: keep.Id,
            wsPort: wsMapping?.PublicPort ?? 0,
            vncPort: vncMapping?.PublicPort ?? 0,
            status: 'running',
            createdAt: new Date(keep.Created * 1000).getTime(),
            vncPassword: persistedConfig.vncPassword,
          };
          this.desktops.set(projectPath, state);
          this.persistConfig(projectPath, state);
        } else if (keep.State === 'exited' || keep.State === 'created') {
          // Recover VNC password from persisted config
          const persistedConfig = this.loadPersistedConfig(projectPath);

          if (!persistedConfig?.vncPassword) {
            // Password lost — remove the stopped container so a fresh one (with a new
            // password) will be created on next start.
            console.warn(`[Desktop] VNC password missing from persisted config for stopped container ${keep.Id.slice(0, 12)} (${projectPath}). Removing container.`);
            try {
              const c = this.docker.getContainer(keep.Id);
              await c.remove({ force: true });
            } catch { /* best effort */ }
            this.removePersisted(projectPath);
            continue;
          }

          const state: DesktopState = {
            containerId: keep.Id,
            wsPort: 0,
            vncPort: 0,
            status: 'stopped',
            createdAt: new Date(keep.Created * 1000).getTime(),
            vncPassword: persistedConfig.vncPassword,
          };
          this.desktops.set(projectPath, state);
          this.persistConfig(projectPath, state);
        } else {
          // Dead/removing/paused — clean up
          try {
            const c = this.docker.getContainer(keep.Id);
            await c.remove({ force: true });
          } catch { /* best effort */ }
          this.removePersisted(projectPath);
        }
      }
    } catch {
      // Docker may not be available — that's fine
    }
  }

  // ── Private helpers ──────────────────────────────────────────────

  /**
   * Try to restart an existing stopped container for a project.
   * Docker re-assigns host ports on restart, so we read them from the
   * container info after starting. Returns the new state, or null if
   * no stopped container was found.
   */
  private async tryRestartContainer(projectPath: string): Promise<DesktopState | null> {
    const existing = this.desktops.get(projectPath);
    if (!existing?.containerId) return null;

    try {
      const container = this.docker.getContainer(existing.containerId);
      const info = await container.inspect();
      if (info.State.Running) return null; // Already running — shouldn't happen

      await container.start();

      // Read the new port mappings assigned by Docker
      const started = await container.inspect();
      const portBindings = started.NetworkSettings?.Ports ?? {};
      const vncPort = Number(portBindings['5900/tcp']?.[0]?.HostPort) || 0;
      const wsPort = Number(portBindings['6080/tcp']?.[0]?.HostPort) || 0;

      if (vncPort <= 0 || wsPort <= 0) {
        throw new Error(
          `Container ${existing.containerId} has invalid port bindings after restart ` +
          `(VNC: ${vncPort}, WS: ${wsPort}). Stop and start the desktop again.`,
        );
      }

      const state: DesktopState = {
        containerId: existing.containerId,
        wsPort,
        vncPort,
        status: 'starting',
        createdAt: existing.createdAt,
        vncPassword: existing.vncPassword,
      };
      this.desktops.set(projectPath, state);

      await this.waitForReady(wsPort);

      state.status = 'running';
      this.desktops.set(projectPath, { ...state });
      this.persistConfig(projectPath, state);
      this.pushEvent(projectPath, state);

      return { ...state };
    } catch (err) {
      // Only discard persisted state when the container is truly gone (404).
      // For transient errors (daemon unavailable, timeout) propagate so the
      // caller can surface the failure instead of silently losing state.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404') || msg.includes('no such container')) {
        this.desktops.delete(projectPath);
        this.removePersisted(projectPath);
        return null;
      }
      throw err;
    }
  }

  /** Build the desktop Docker image if it doesn't exist. */
  private async ensureImage(): Promise<void> {
    try {
      await this.docker.getImage(DESKTOP_IMAGE).inspect();
      return; // Image already exists
    } catch {
      // Image doesn't exist — build it
    }

    // Resolve Dockerfile context path
    // In dev: resources/docker/desktop/ relative to project root
    // In prod: app.getAppPath()/resources/docker/desktop/
    const contextPaths = [
      join(__dirname, '../../resources/docker/desktop'),
      join(__dirname, '../../../resources/docker/desktop'),
    ];

    let contextPath: string | null = null;
    for (const p of contextPaths) {
      if (existsSync(join(p, 'Dockerfile'))) {
        contextPath = p;
        break;
      }
    }

    if (!contextPath) {
      throw new Error('Desktop Dockerfile not found — cannot build image');
    }

    // Build the image
    const stream = await this.docker.buildImage(
      { context: contextPath, src: ['Dockerfile', 'entrypoint.sh'] },
      { t: DESKTOP_IMAGE },
    );

    // Wait for build to complete
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Build a project-specific image if <project>/.pilot/desktop.Dockerfile exists.
   * The Dockerfile should use `FROM pilot-desktop:latest` as its base.
   * Returns the image tag to use for the container.
   */
  private async ensureProjectImage(projectPath: string): Promise<string> {
    const dockerfilePath = join(projectPath, '.pilot', 'desktop.Dockerfile');
    if (!existsSync(dockerfilePath)) {
      return DESKTOP_IMAGE;
    }

    // Stable tag derived from the project path
    const hash = createHash('sha256').update(projectPath).digest('hex').slice(0, 12);
    const projectImage = `${PROJECT_IMAGE_PREFIX}${hash}:latest`;

    // Check if we need to rebuild: compare Dockerfile mtime vs image creation time
    const dockerfileMtime = statSync(dockerfilePath).mtimeMs;
    let needsBuild = true;

    try {
      const imageInfo = await this.docker.getImage(projectImage).inspect();
      const imageCreated = new Date(imageInfo.Created).getTime();
      if (imageCreated > dockerfileMtime) {
        needsBuild = false; // Image is newer than Dockerfile — skip rebuild
      }
    } catch {
      // Image doesn't exist — need to build
    }

    if (!needsBuild) {
      return projectImage;
    }

    this.pushEvent(projectPath, { status: 'starting', error: undefined });

    // Build with only the Dockerfile sent to the Docker daemon — no project files
    // are included in the build context. Custom Dockerfiles should use FROM/RUN/ENV
    // to customise the image (e.g. install extra packages). COPY of project files
    // is intentionally unsupported to avoid sending large trees to the daemon.
    const stream = await this.docker.buildImage(
      { context: projectPath, src: ['.pilot/desktop.Dockerfile'] },
      { t: projectImage, dockerfile: '.pilot/desktop.Dockerfile' },
    );

    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err) => {
        if (err) reject(new Error(`Project desktop image build failed: ${err.message}`));
        else resolve();
      });
    });

    return projectImage;
  }

  /** Find an available TCP port on localhost. */
  private findAvailablePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          const port = addr.port;
          server.close(() => resolve(port));
        } else {
          server.close(() => reject(new Error('Failed to allocate port')));
        }
      });
      server.on('error', reject);
    });
  }

  /** Poll until noVNC websockify is responding on the given port. */
  private async waitForReady(wsPort: number, signal?: AbortSignal): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS;

    while (Date.now() < deadline) {
      // Bail early if the caller was superseded (e.g. by a rebuild)
      if (signal?.aborted) return;

      try {
        await new Promise<void>((resolve, reject) => {
          const client = createConnection({ port: wsPort, host: '127.0.0.1' }, () => {
            client.destroy();
            resolve();
          });
          client.on('error', () => {
            client.destroy();
            reject();
          });
          client.setTimeout(READY_POLL_MS, () => {
            client.destroy();
            reject();
          });
        });
        return; // Connected successfully
      } catch {
        await new Promise(r => setTimeout(r, READY_POLL_MS));
      }
    }

    throw new Error(`Desktop noVNC did not become ready within ${READY_TIMEOUT_MS / 1000}s`);
  }

  /** Max bytes to buffer from a single Docker exec stream (10 MB). */
  private static readonly MAX_STREAM_BYTES = 10 * 1024 * 1024;

  /** Default execution timeout for Docker exec streams (120 seconds). */
  private static readonly DEFAULT_EXEC_TIMEOUT_MS = 120_000;

  /**
   * Collect all output from a Docker exec stream, capped at MAX_STREAM_BYTES.
   * A timeout (default 120s) destroys the stream and rejects if the command
   * does not complete in time — prevents a hung process from stalling the
   * IPC handler indefinitely.
   */
  private collectStream(
    stream: NodeJS.ReadableStream,
    timeoutMs = DesktopService.DEFAULT_EXEC_TIMEOUT_MS,
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        stream.destroy();
        reject(new Error(
          `Command timed out after ${timeoutMs / 1000}s — ` +
          `if the command needs more time, run it with nohup and redirect output to a file`,
        ));
      }, timeoutMs);

      stream.on('data', (chunk: Buffer) => {
        if (settled) return;
        totalBytes += chunk.length;
        if (totalBytes > DesktopService.MAX_STREAM_BYTES) {
          settled = true;
          clearTimeout(timer);
          stream.destroy();
          reject(new Error(
            `Command output exceeded ${DesktopService.MAX_STREAM_BYTES / (1024 * 1024)} MB limit — ` +
            `pipe large output to a file instead`,
          ));
          return;
        }
        chunks.push(chunk);
      });
      stream.on('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const raw = Buffer.concat(chunks);
        // Docker multiplexed streams have 8-byte headers per frame.
        // Strip them to get clean output, separating stdout from stderr.
        resolve(this.demuxDockerStream(raw));
      });
      stream.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  /**
   * Strip Docker multiplexed stream headers (8 bytes per frame) and separate
   * stdout (type 1) from stderr (type 2).
   */
  private demuxDockerStream(buffer: Buffer): { stdout: string; stderr: string } {
    const stdoutParts: string[] = [];
    const stderrParts: string[] = [];
    let offset = 0;
    while (offset < buffer.length) {
      if (offset + 8 > buffer.length) {
        // Remaining data is less than a header — treat as raw stdout
        stdoutParts.push(buffer.subarray(offset).toString('utf-8'));
        break;
      }
      // Byte 0: stream type (0=stdin, 1=stdout, 2=stderr)
      // Bytes 4-7: frame size (big-endian uint32)
      const streamType = buffer[offset];
      const frameSize = buffer.readUInt32BE(offset + 4);
      if (frameSize === 0) {
        offset += 8;
        continue;
      }
      const frameEnd = offset + 8 + frameSize;
      const content = frameEnd > buffer.length
        ? buffer.subarray(offset + 8).toString('utf-8')
        : buffer.subarray(offset + 8, frameEnd).toString('utf-8');

      if (streamType === 2) {
        stderrParts.push(content);
      } else {
        stdoutParts.push(content);
      }

      offset = frameEnd > buffer.length ? buffer.length : frameEnd;
    }
    return { stdout: stdoutParts.join(''), stderr: stderrParts.join('') };
  }

  /** Push a desktop event to the renderer (and companion). */
  private pushEvent(projectPath: string, state: Partial<DesktopState>): void {
    // Strip vncPassword before broadcasting — the renderer already receives it
    // via the DESKTOP_START IPC response and stores it locally. broadcastToRenderer
    // forwards events to companion clients which should not receive VNC credentials.
    const { vncPassword: _, ...safeState } = state as Record<string, unknown>;
    broadcastToRenderer(IPC.DESKTOP_EVENT, { projectPath, ...safeState });
  }

  /**
   * Persist desktop config to <project>/.pilot/desktop.json
   *
   * This file contains the VNC password in plaintext. To prevent accidental
   * commits, we auto-append `desktop.json` to `.pilot/.gitignore` if it is
   * not already listed.
   */
  private persistConfig(projectPath: string, state: DesktopState): void {
    try {
      const pilotDir = join(projectPath, '.pilot');
      if (!existsSync(pilotDir)) mkdirSync(pilotDir, { recursive: true });

      const config: DesktopConfig = {
        containerId: state.containerId,
        wsPort: state.wsPort,
        vncPort: state.vncPort,
        status: state.status,
        createdAt: state.createdAt,
        vncPassword: state.vncPassword,
      };
      writeFileSync(join(pilotDir, 'desktop.json'), JSON.stringify(config, null, 2));

      // Ensure desktop.json is gitignored — prevents accidental commits of
      // the VNC password when users selectively track files inside .pilot/.
      this.ensureGitignoreEntry(pilotDir, 'desktop.json');
    } catch { /* best effort */ }
  }

  /** Append an entry to `.gitignore` inside `dir` if not already present. */
  private ensureGitignoreEntry(dir: string, entry: string): void {
    try {
      const gitignorePath = join(dir, '.gitignore');
      let content = '';
      if (existsSync(gitignorePath)) {
        content = readFileSync(gitignorePath, 'utf-8');
      }
      // Check if entry is already present (as a whole line)
      const lines = content.split('\n').map(l => l.trim());
      if (lines.includes(entry)) return;
      // Append with a leading newline if the file doesn't end with one
      const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
      writeFileSync(gitignorePath, `${content}${separator}${entry}\n`);
    } catch { /* best effort */ }
  }

  /** Load persisted desktop config. Returns null if not found. */
  private loadPersistedConfig(projectPath: string): DesktopConfig | null {
    try {
      const configPath = join(projectPath, '.pilot', 'desktop.json');
      if (!existsSync(configPath)) return null;
      return JSON.parse(readFileSync(configPath, 'utf-8')) as DesktopConfig;
    } catch {
      return null;
    }
  }

  /** Remove persisted desktop config. */
  private removePersisted(projectPath: string): void {
    try {
      const configPath = join(projectPath, '.pilot', 'desktop.json');
      if (existsSync(configPath)) unlinkSync(configPath);
    } catch { /* best effort */ }
  }
}
