/**
 * @file Docker sandbox service — manages project-scoped containers with virtual display.
 *
 * Each sandbox is a Docker container running Xvfb + fluxbox + x11vnc + noVNC,
 * keyed by projectPath. The agent can control the virtual display via xdotool,
 * take screenshots via scrot, and interact with the clipboard via xclip.
 */
import Dockerode from 'dockerode';
import { BrowserWindow } from 'electron';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, lstatSync, statSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { createHash } from 'crypto';
import { createServer, createConnection } from 'net';
import { IPC } from '../../shared/ipc';
import type { DockerSandboxState, DockerSandboxConfig } from '../../shared/types';

/** Docker image name for the base sandbox */
const SANDBOX_IMAGE = 'pilot-sandbox:latest';

/** Project-specific image tag prefix — full tag is pilot-sandbox-<hash>:latest */
const PROJECT_IMAGE_PREFIX = 'pilot-sandbox-project-';

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

export class SandboxDockerService {
  private docker: Dockerode;
  private sandboxes = new Map<string, DockerSandboxState>();

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

  /** Start a sandbox container for a project. Returns the sandbox state. */
  async startSandbox(projectPath: string): Promise<DockerSandboxState> {
    // Already running? Return existing state.
    const existing = this.sandboxes.get(projectPath);
    if (existing && (existing.status === 'running' || existing.status === 'starting')) {
      return existing;
    }

    this.pushEvent(projectPath, { status: 'starting' });

    try {
      await this.ensureImage();
      const image = await this.ensureProjectImage(projectPath);

      const [vncPort, wsPort] = await Promise.all([
        this.findAvailablePort(),
        this.findAvailablePort(),
      ]);

      const container = await this.docker.createContainer({
        Image: image,
        Env: [`RESOLUTION=${DEFAULT_RESOLUTION}`],
        Labels: {
          'pilot.sandbox': 'true',
          'pilot.project': projectPath,
        },
        ExposedPorts: { '5900/tcp': {}, '6080/tcp': {} },
        HostConfig: {
          PortBindings: {
            '5900/tcp': [{ HostPort: String(vncPort) }],
            '6080/tcp': [{ HostPort: String(wsPort) }],
          },
          // Reasonable resource limits
          Memory: 2 * 1024 * 1024 * 1024, // 2 GB
          NanoCpus: 2_000_000_000,         // 2 CPUs
        },
      });

      await container.start();

      const state: DockerSandboxState = {
        containerId: container.id,
        wsPort,
        vncPort,
        status: 'starting',
        createdAt: Date.now(),
      };
      this.sandboxes.set(projectPath, state);

      // Wait for noVNC to be ready
      await this.waitForReady(wsPort);

      state.status = 'running';
      this.sandboxes.set(projectPath, { ...state });
      this.persistConfig(projectPath, state);
      this.pushEvent(projectPath, state);

      return { ...state };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorState: DockerSandboxState = {
        containerId: '',
        wsPort: 0,
        vncPort: 0,
        status: 'error',
        createdAt: Date.now(),
        error: errorMsg,
      };
      this.sandboxes.set(projectPath, errorState);
      this.pushEvent(projectPath, errorState);
      throw err;
    }
  }

  /** Stop and remove the sandbox container for a project. */
  async stopSandbox(projectPath: string): Promise<void> {
    const state = this.sandboxes.get(projectPath);
    if (!state || !state.containerId) return;

    this.pushEvent(projectPath, { ...state, status: 'stopping' });

    try {
      const container = this.docker.getContainer(state.containerId);
      await container.stop({ t: 5 }).catch(() => { /* may already be stopped */ });
      await container.remove({ force: true }).catch(() => { /* may already be removed */ });
    } catch {
      // Best effort — container might be gone already
    }

    this.sandboxes.delete(projectPath);
    this.removePersisted(projectPath);
    this.pushEvent(projectPath, {
      containerId: '',
      wsPort: 0,
      vncPort: 0,
      status: 'stopped',
      createdAt: 0,
    });
  }

  /** Get current sandbox status for a project. Returns null if no sandbox. */
  async getSandboxStatus(projectPath: string): Promise<DockerSandboxState | null> {
    const cached = this.sandboxes.get(projectPath);
    if (cached) return { ...cached };

    // Check persisted config
    const config = this.loadPersistedConfig(projectPath);
    if (!config) return null;

    // Verify container is still alive
    try {
      const container = this.docker.getContainer(config.containerId);
      const info = await container.inspect();
      if (info.State.Running) {
        const state: DockerSandboxState = {
          containerId: config.containerId,
          wsPort: config.wsPort,
          vncPort: config.vncPort,
          status: 'running',
          createdAt: config.createdAt,
        };
        this.sandboxes.set(projectPath, state);
        return state;
      }
    } catch {
      // Container is gone
    }

    this.removePersisted(projectPath);
    return null;
  }

  /** Execute a command inside the sandbox container. Returns stdout. */
  async execInSandbox(projectPath: string, command: string): Promise<string> {
    const state = this.sandboxes.get(projectPath);
    if (!state || state.status !== 'running') {
      throw new Error('No running sandbox for this project');
    }

    const container = this.docker.getContainer(state.containerId);
    const exec = await container.exec({
      Cmd: ['bash', '-c', command],
      Env: ['DISPLAY=:99'],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ Detach: false, Tty: false });
    return this.collectStream(stream);
  }

  /** Take a screenshot of the virtual display. Returns base64-encoded PNG. */
  async screenshotSandbox(projectPath: string): Promise<string> {
    const state = this.sandboxes.get(projectPath);
    if (!state || state.status !== 'running') {
      throw new Error('No running sandbox for this project');
    }

    // Capture screenshot inside container
    await this.execInSandbox(projectPath, 'DISPLAY=:99 scrot -o /tmp/screen.png');

    // Read the file out via tar archive
    const container = this.docker.getContainer(state.containerId);
    const archive = await container.getArchive({ path: '/tmp/screen.png' });

    // The archive is a tar stream — extract the single file
    const chunks: Buffer[] = [];
    for await (const chunk of archive as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    const tarBuffer = Buffer.concat(chunks);

    // Tar header is 512 bytes, file content follows. Find the PNG magic bytes.
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const pngStart = tarBuffer.indexOf(pngMagic);
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
  }

  /** Reconcile persisted sandbox configs on app startup. */
  async reconcileOnStartup(): Promise<void> {
    if (!(await this.isDockerAvailable())) return;

    // Find all running pilot-sandbox containers
    try {
      const containers = await this.docker.listContainers({
        all: true,
        filters: { label: ['pilot.sandbox=true'] },
      });

      for (const containerInfo of containers) {
        const projectPath = containerInfo.Labels['pilot.project'];
        if (!projectPath) continue;

        if (containerInfo.State === 'running') {
          // Extract host ports from the container info
          const ports = containerInfo.Ports ?? [];
          const vncMapping = ports.find(p => p.PrivatePort === 5900);
          const wsMapping = ports.find(p => p.PrivatePort === 6080);

          const state: DockerSandboxState = {
            containerId: containerInfo.Id,
            wsPort: wsMapping?.PublicPort ?? 0,
            vncPort: vncMapping?.PublicPort ?? 0,
            status: 'running',
            createdAt: new Date(containerInfo.Created * 1000).getTime(),
          };
          this.sandboxes.set(projectPath, state);
          this.persistConfig(projectPath, state);
        } else {
          // Dead container — clean up
          try {
            const container = this.docker.getContainer(containerInfo.Id);
            await container.remove({ force: true });
          } catch { /* best effort */ }
          this.removePersisted(projectPath);
        }
      }
    } catch {
      // Docker may not be available — that's fine
    }
  }

  // ── Private helpers ──────────────────────────────────────────────

  /** Build the sandbox Docker image if it doesn't exist. */
  private async ensureImage(): Promise<void> {
    try {
      await this.docker.getImage(SANDBOX_IMAGE).inspect();
      return; // Image already exists
    } catch {
      // Image doesn't exist — build it
    }

    // Resolve Dockerfile context path
    // In dev: resources/docker/sandbox/ relative to project root
    // In prod: app.getAppPath()/resources/docker/sandbox/
    const contextPaths = [
      join(__dirname, '../../resources/docker/sandbox'),
      join(__dirname, '../../../resources/docker/sandbox'),
    ];

    let contextPath: string | null = null;
    for (const p of contextPaths) {
      if (existsSync(join(p, 'Dockerfile'))) {
        contextPath = p;
        break;
      }
    }

    if (!contextPath) {
      throw new Error('Sandbox Dockerfile not found — cannot build image');
    }

    // Build the image
    const stream = await this.docker.buildImage(
      { context: contextPath, src: ['Dockerfile', 'entrypoint.sh'] },
      { t: SANDBOX_IMAGE },
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
   * Build a project-specific image if <project>/.pilot/sandbox.Dockerfile exists.
   * The Dockerfile should use `FROM pilot-sandbox:latest` as its base.
   * Returns the image tag to use for the container.
   */
  private async ensureProjectImage(projectPath: string): Promise<string> {
    const dockerfilePath = join(projectPath, '.pilot', 'sandbox.Dockerfile');
    if (!existsSync(dockerfilePath)) {
      return SANDBOX_IMAGE;
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

    // Build with the project root as context so the Dockerfile can COPY project files
    const stream = await this.docker.buildImage(
      { context: projectPath, src: ['.pilot/sandbox.Dockerfile'] },
      { t: projectImage, dockerfile: '.pilot/sandbox.Dockerfile' },
    );

    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err) => {
        if (err) reject(new Error(`Project sandbox image build failed: ${err.message}`));
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
  private async waitForReady(wsPort: number): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS;

    while (Date.now() < deadline) {
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

    throw new Error(`Sandbox noVNC did not become ready within ${READY_TIMEOUT_MS / 1000}s`);
  }

  /** Collect all output from a Docker exec stream. */
  private collectStream(stream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        const raw = Buffer.concat(chunks);
        // Docker multiplexed streams have 8-byte headers per frame.
        // Strip them to get clean output.
        resolve(this.demuxDockerStream(raw));
      });
      stream.on('error', reject);
    });
  }

  /** Strip Docker multiplexed stream headers (8 bytes per frame). */
  private demuxDockerStream(buffer: Buffer): string {
    const parts: string[] = [];
    let offset = 0;
    while (offset < buffer.length) {
      if (offset + 8 > buffer.length) {
        // Remaining data is less than a header — treat as raw
        parts.push(buffer.subarray(offset).toString('utf-8'));
        break;
      }
      // Byte 0: stream type (0=stdin, 1=stdout, 2=stderr)
      // Bytes 4-7: frame size (big-endian uint32)
      const frameSize = buffer.readUInt32BE(offset + 4);
      if (frameSize === 0) {
        offset += 8;
        continue;
      }
      const frameEnd = offset + 8 + frameSize;
      if (frameEnd > buffer.length) {
        parts.push(buffer.subarray(offset + 8).toString('utf-8'));
        break;
      }
      parts.push(buffer.subarray(offset + 8, frameEnd).toString('utf-8'));
      offset = frameEnd;
    }
    return parts.join('');
  }

  /** Push a sandbox event to the renderer (and companion). */
  private pushEvent(projectPath: string, state: Partial<DockerSandboxState>): void {
    const payload = { projectPath, ...state };
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.DOCKER_SANDBOX_EVENT, payload);
    }
    try {
      const { companionBridge } = require('./companion-ipc-bridge');
      companionBridge.forwardEvent(IPC.DOCKER_SANDBOX_EVENT, payload);
    } catch { /* companion not available */ }
  }

  /** Persist sandbox config to <project>/.pilot/sandbox.json */
  private persistConfig(projectPath: string, state: DockerSandboxState): void {
    try {
      const pilotDir = join(projectPath, '.pilot');
      if (!existsSync(pilotDir)) mkdirSync(pilotDir, { recursive: true });

      const config: DockerSandboxConfig = {
        containerId: state.containerId,
        wsPort: state.wsPort,
        vncPort: state.vncPort,
        status: state.status,
        createdAt: state.createdAt,
      };
      writeFileSync(join(pilotDir, 'sandbox.json'), JSON.stringify(config, null, 2));
    } catch { /* best effort */ }
  }

  /** Load persisted sandbox config. Returns null if not found. */
  private loadPersistedConfig(projectPath: string): DockerSandboxConfig | null {
    try {
      const configPath = join(projectPath, '.pilot', 'sandbox.json');
      if (!existsSync(configPath)) return null;
      return JSON.parse(readFileSync(configPath, 'utf-8')) as DockerSandboxConfig;
    } catch {
      return null;
    }
  }

  /** Remove persisted sandbox config. */
  private removePersisted(projectPath: string): void {
    try {
      const configPath = join(projectPath, '.pilot', 'sandbox.json');
      if (existsSync(configPath)) unlinkSync(configPath);
    } catch { /* best effort */ }
  }
}
