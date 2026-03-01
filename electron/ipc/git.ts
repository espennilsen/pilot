import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import { GitService } from '../services/git-service';
import type { GitLogOptions } from '../../shared/types';

const gitServices = new Map<string, GitService>();
let activeProjectPath: string | null = null;
let gitAvailable: boolean | null = null;

function getGitService(projectPath?: string): GitService {
  const path = projectPath || activeProjectPath;
  if (!path) throw new Error('Git not initialized — no active project');
  const service = gitServices.get(path);
  if (!service) throw new Error(`Git not initialized for ${path}`);
  return service;
}

export function registerGitIpc() {
  ipcMain.handle(IPC.GIT_INIT, async (_event, projectPath: string) => {
    if (gitAvailable === null) gitAvailable = GitService.isGitAvailable();
    if (!gitAvailable) return { available: false, isRepo: false };
    const service = new GitService(projectPath);
    const isRepo = await service.isRepo();
    if (isRepo) {
      gitServices.set(projectPath, service);
    }
    activeProjectPath = projectPath;
    return { available: true, isRepo };
  });

  ipcMain.handle(IPC.GIT_INIT_REPO, async (_event, projectPath: string) => {
    if (gitAvailable === null) gitAvailable = GitService.isGitAvailable();
    if (!gitAvailable) throw new Error('Git is not available');
    const service = new GitService(projectPath);
    await service.initRepo();
    gitServices.set(projectPath, service);
    activeProjectPath = projectPath;
    return { available: true, isRepo: true };
  });

  ipcMain.handle(IPC.GIT_STATUS, async (_event, projectPath?: string) => {
    return getGitService(projectPath).getStatus();
  });

  ipcMain.handle(IPC.GIT_BRANCHES, async (_event, projectPath?: string) => {
    return getGitService(projectPath).getBranches();
  });

  ipcMain.handle(IPC.GIT_CHECKOUT, async (_event, branch: string, projectPath?: string) => {
    await getGitService(projectPath).checkout(branch);
  });

  ipcMain.handle(IPC.GIT_CREATE_BRANCH, async (_event, name: string, from?: string, projectPath?: string) => {
    await getGitService(projectPath).createBranch(name, from);
  });

  ipcMain.handle(IPC.GIT_STAGE, async (_event, paths: string[], projectPath?: string) => {
    await getGitService(projectPath).stage(paths);
  });

  ipcMain.handle(IPC.GIT_UNSTAGE, async (_event, paths: string[], projectPath?: string) => {
    await getGitService(projectPath).unstage(paths);
  });

  ipcMain.handle(IPC.GIT_COMMIT, async (_event, message: string, projectPath?: string) => {
    await getGitService(projectPath).commit(message);
  });

  ipcMain.handle(IPC.GIT_PUSH, async (_event, remote?: string, branch?: string, projectPath?: string) => {
    await getGitService(projectPath).push(remote, branch);
  });

  ipcMain.handle(IPC.GIT_PULL, async (_event, remote?: string, branch?: string, projectPath?: string) => {
    await getGitService(projectPath).pull(remote, branch);
  });

  ipcMain.handle(IPC.GIT_DIFF, async (_event, ref1?: string, ref2?: string, projectPath?: string) => {
    return getGitService(projectPath).getDiff(ref1, ref2);
  });

  ipcMain.handle(IPC.GIT_LOG, async (_event, options?: GitLogOptions, projectPath?: string) => {
    return getGitService(projectPath).getLog(options);
  });

  ipcMain.handle(IPC.GIT_BLAME, async (_event, filePath: string, projectPath?: string) => {
    return getGitService(projectPath).getBlame(filePath);
  });

  ipcMain.handle(IPC.GIT_STASH_LIST, async (_event, projectPath?: string) => {
    return getGitService(projectPath).getStashList();
  });

  ipcMain.handle(IPC.GIT_STASH_APPLY, async (_event, stashId: string, projectPath?: string) => {
    await getGitService(projectPath).stashApply(stashId);
  });

  // ── Conflict resolution ────────────────────────────────────────────

  ipcMain.handle(IPC.GIT_MERGE, async (_event, branch: string, projectPath?: string) => {
    return getGitService(projectPath).merge(branch);
  });

  ipcMain.handle(IPC.GIT_REBASE, async (_event, upstream: string, projectPath?: string) => {
    return getGitService(projectPath).rebase(upstream);
  });

  ipcMain.handle(IPC.GIT_CHERRY_PICK, async (_event, commitHash: string, projectPath?: string) => {
    return getGitService(projectPath).cherryPick(commitHash);
  });

  ipcMain.handle(IPC.GIT_REVERT, async (_event, commitHash: string, projectPath?: string) => {
    return getGitService(projectPath).revert(commitHash);
  });

  ipcMain.handle(IPC.GIT_GET_CONFLICTS, async (_event, projectPath?: string) => {
    return getGitService(projectPath).getConflictedFiles();
  });

  ipcMain.handle(IPC.GIT_ABORT_OPERATION, async (_event, projectPath?: string) => {
    await getGitService(projectPath).abortOperation();
  });

  ipcMain.handle(IPC.GIT_CONTINUE_OPERATION, async (_event, projectPath?: string) => {
    return getGitService(projectPath).continueOperation();
  });

  ipcMain.handle(IPC.GIT_RESOLVE_FILE, async (_event, filePath: string, projectPath?: string) => {
    await getGitService(projectPath).resolveFile(filePath);
  });

  ipcMain.handle(IPC.GIT_SKIP_COMMIT, async (_event, projectPath?: string) => {
    return getGitService(projectPath).skipRebaseCommit();
  });

  ipcMain.handle(IPC.GIT_RESOLVE_CONFLICT_STRATEGY, async (_event, filePath: string, strategy: 'ours' | 'theirs' | 'mark-resolved', projectPath?: string) => {
    await getGitService(projectPath).resolveConflictWithStrategy(filePath, strategy);
  });
}
