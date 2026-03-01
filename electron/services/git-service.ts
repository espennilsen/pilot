import simpleGit, { type SimpleGit, type StatusResult } from 'simple-git';
import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import type {
  GitStatus, GitBranch, GitCommit, GitLogOptions,
  BlameLine, GitStash, GitFileChange,
  GitOperationState, ConflictFile, GitOperationResult,
} from '../../shared/types';

export class GitService {
  private git: SimpleGit;
  private cwd: string;

  constructor(cwd: string) {
    this.cwd = cwd;
    this.git = simpleGit(cwd);
  }

  /** Check if git is available on PATH */
  static isGitAvailable(): boolean {
    try {
      execSync('git --version', { stdio: 'pipe' });
      return true;
    } catch { /* Expected: git may not be installed */
      return false;
    }
  }

  /** Check if the directory is a git repo */
  async isRepo(): Promise<boolean> {
    try {
      return await this.git.checkIsRepo();
    } catch { /* Expected: not a git repo */
      return false;
    }
  }

  /** Initialize a new git repository */
  async initRepo(): Promise<void> {
    await this.git.init();
  }

  async getStatus(): Promise<GitStatus> {
    const status = await this.git.status();
    const conflicted = status.conflicted ?? [];
    const operationInProgress = this.getOperationState();

    return {
      branch: status.current ?? 'HEAD',
      upstream: status.tracking ?? null,
      ahead: status.ahead,
      behind: status.behind,
      staged: this.mapFileChanges(status.staged, status),
      unstaged: this.mapFileChanges(status.modified, status).concat(
        this.mapFileChanges(status.deleted, status, 'deleted')
      ),
      untracked: status.not_added,
      conflicted,
      isClean: status.isClean(),
      operationInProgress,
    };
  }

  async getBranches(): Promise<GitBranch[]> {
    const summary = await this.git.branch(['-v', '--sort=-committerdate']);
    const branches: GitBranch[] = [];
    for (const [, data] of Object.entries(summary.branches)) {
      const branch: GitBranch = {
        name: data.name,
        current: data.current,
        upstream: null,
        ahead: 0,
        behind: 0,
        lastCommitHash: data.commit,
        lastCommitDate: Date.now(),
        lastCommitMessage: data.label,
      };

      // Populate real commit date, upstream, ahead/behind
      try {
        const dateStr = await this.git.raw(['log', '-1', '--format=%aI', data.name]);
        if (dateStr.trim()) branch.lastCommitDate = new Date(dateStr.trim()).getTime();
      } catch { /* branch may not have commits */ }

      try {
        const tracking = await this.git.raw(['config', `branch.${data.name}.merge`]);
        const remote = await this.git.raw(['config', `branch.${data.name}.remote`]);
        if (tracking.trim() && remote.trim()) {
          const upstream = `${remote.trim()}/${tracking.trim().replace('refs/heads/', '')}`;
          branch.upstream = upstream;
          const counts = await this.git.raw(['rev-list', '--left-right', '--count', `${data.name}...${upstream}`]);
          const [ahead, behind] = counts.trim().split(/\s+/).map(Number);
          branch.ahead = ahead ?? 0;
          branch.behind = behind ?? 0;
        }
      } catch { /* no upstream configured */ }

      branches.push(branch);
    }
    return branches;
  }

  async checkout(branch: string): Promise<void> {
    await this.git.checkout(branch);
  }

  async createBranch(name: string, from?: string): Promise<void> {
    if (from) {
      await this.git.checkoutBranch(name, from);
    } else {
      await this.git.checkoutLocalBranch(name);
    }
  }

  async stage(paths: string[]): Promise<void> {
    await this.git.add(paths);
  }

  async unstage(paths: string[]): Promise<void> {
    await this.git.reset(['HEAD', '--', ...paths]);
  }

  async commit(message: string): Promise<void> {
    await this.git.commit(message);
  }

  async push(remote = 'origin', branch?: string): Promise<void> {
    if (branch) {
      await this.git.push(remote, branch);
    } else {
      await this.git.push();
    }
  }

  async pull(remote = 'origin', branch?: string): Promise<void> {
    if (branch) {
      await this.git.pull(remote, branch);
    } else {
      await this.git.pull();
    }
  }

  async getDiff(ref1?: string, ref2?: string): Promise<string> {
    if (ref1 && ref2) {
      return this.git.diff([ref1, ref2]);
    } else if (ref1) {
      return this.git.diff([ref1]);
    }
    return this.git.diff();
  }

  async getLog(options?: GitLogOptions): Promise<GitCommit[]> {
    const logOptions: string[] = [];
    const maxCount = options?.maxCount ?? 50;
    logOptions.push(`--max-count=${maxCount}`);
    if (options?.author) logOptions.push(`--author=${options.author}`);
    if (options?.branch) logOptions.push(options.branch);
    if (options?.filePath) logOptions.push('--', options.filePath);
    if (options?.searchQuery) logOptions.push(`--grep=${options.searchQuery}`);

    const log = await this.git.log(logOptions);
    return log.all.map(entry => ({
      hash: entry.hash,
      hashShort: entry.hash.substring(0, 7),
      author: entry.author_name,
      authorEmail: entry.author_email,
      date: new Date(entry.date).getTime(),
      message: entry.message,
      parents: (entry as any).parent?.split(' ') ?? [],
      refs: entry.refs?.split(',').map(r => r.trim()).filter(Boolean) ?? [],
    }));
  }

  async getBlame(filePath: string): Promise<BlameLine[]> {
    // Use raw git blame output
    try {
      const raw = await this.git.raw(['blame', '--porcelain', filePath]);
      return this.parseBlame(raw);
    } catch { /* Expected: blame fails on uncommitted/binary files */
      return [];
    }
  }

  async getStashList(): Promise<GitStash[]> {
    try {
      const result = await this.git.stashList();
      return result.all.map((entry, index) => ({
        index,
        message: entry.message,
        date: new Date(entry.date).getTime(),
        branch: entry.refs || '',
      }));
    } catch { /* Expected: stash list fails on repos with no stashes */
      return [];
    }
  }

  async stashApply(stashId: string): Promise<void> {
    await this.git.stash(['apply', stashId]);
  }

  // ── Merge / Rebase / Cherry-pick / Revert ──────────────────────────

  /** Merge a branch into the current branch. Returns success or conflict list. */
  async merge(branch: string): Promise<GitOperationResult> {
    try {
      await this.git.merge([branch]);
      return { success: true, conflicts: [], message: `Merged ${branch} successfully` };
    } catch (err: unknown) {
      const conflicts = await this.getConflictedPaths();
      if (conflicts.length > 0) {
        return { success: false, conflicts, message: `Merge of ${branch} produced ${conflicts.length} conflict(s)` };
      }
      throw err;
    }
  }

  /** Rebase the current branch onto an upstream ref. */
  async rebase(upstream: string): Promise<GitOperationResult> {
    try {
      await this.git.rebase([upstream]);
      return { success: true, conflicts: [], message: `Rebased onto ${upstream} successfully` };
    } catch (err: unknown) {
      const conflicts = await this.getConflictedPaths();
      if (conflicts.length > 0) {
        return { success: false, conflicts, message: `Rebase onto ${upstream} produced ${conflicts.length} conflict(s)` };
      }
      throw err;
    }
  }

  /** Cherry-pick a single commit. */
  async cherryPick(commitHash: string): Promise<GitOperationResult> {
    try {
      await this.git.raw(['cherry-pick', commitHash]);
      return { success: true, conflicts: [], message: `Cherry-picked ${commitHash.substring(0, 7)} successfully` };
    } catch (err: unknown) {
      const conflicts = await this.getConflictedPaths();
      if (conflicts.length > 0) {
        return { success: false, conflicts, message: `Cherry-pick of ${commitHash.substring(0, 7)} produced ${conflicts.length} conflict(s)` };
      }
      throw err;
    }
  }

  /** Revert a single commit. */
  async revert(commitHash: string): Promise<GitOperationResult> {
    try {
      await this.git.raw(['revert', commitHash]);
      return { success: true, conflicts: [], message: `Reverted ${commitHash.substring(0, 7)} successfully` };
    } catch (err: unknown) {
      const conflicts = await this.getConflictedPaths();
      if (conflicts.length > 0) {
        return { success: false, conflicts, message: `Revert of ${commitHash.substring(0, 7)} produced ${conflicts.length} conflict(s)` };
      }
      throw err;
    }
  }

  /** Get detailed info for all conflicted files (ours, theirs, base content). */
  async getConflictedFiles(): Promise<ConflictFile[]> {
    const paths = await this.getConflictedPaths();
    if (paths.length === 0) return [];

    const opState = this.getOperationState();
    const oursRef = 'HEAD';
    const theirsRef = opState?.incoming ?? 'MERGE_HEAD';

    const results: ConflictFile[] = [];
    for (const filePath of paths) {
      try {
        // :1: = base (common ancestor), :2: = ours (HEAD), :3: = theirs (incoming)
        const [baseContent, oursContent, theirsContent, markerContent] = await Promise.all([
          this.git.raw(['show', `:1:${filePath}`]).catch(() => null),
          this.git.raw(['show', `:2:${filePath}`]).catch(() => ''),
          this.git.raw(['show', `:3:${filePath}`]).catch(() => ''),
          readFileSync(join(this.cwd, filePath), 'utf-8'),
        ]);

        const conflictCount = (markerContent.match(/^<{7} /gm) ?? []).length;

        results.push({
          path: filePath,
          baseContent,
          oursContent,
          theirsContent,
          markerContent,
          oursRef,
          theirsRef,
          conflictCount,
        });
      } catch {
        /* Expected: file may have been deleted on one side */
      }
    }
    return results;
  }

  /** Detect which operation (merge/rebase/cherry-pick/revert) is in progress. */
  getOperationState(): GitOperationState | null {
    const gitDir = join(this.cwd, '.git');

    // Rebase in progress — check rebase-merge (interactive) or rebase-apply (am/non-interactive)
    if (existsSync(join(gitDir, 'rebase-merge'))) {
      const step = this.readGitInt(join(gitDir, 'rebase-merge', 'msgnum'));
      const totalSteps = this.readGitInt(join(gitDir, 'rebase-merge', 'end'));
      const incoming = this.readGitFile(join(gitDir, 'rebase-merge', 'head-name'))
        ?.replace('refs/heads/', '') ?? 'unknown';
      const currentCommit = this.readGitFile(join(gitDir, 'rebase-merge', 'stopped-sha'))
        ?.substring(0, 7) ?? undefined;
      return { type: 'rebase', incoming, step: step ?? undefined, totalSteps: totalSteps ?? undefined, currentCommit };
    }
    if (existsSync(join(gitDir, 'rebase-apply'))) {
      const step = this.readGitInt(join(gitDir, 'rebase-apply', 'next'));
      const totalSteps = this.readGitInt(join(gitDir, 'rebase-apply', 'last'));
      return { type: 'rebase', incoming: 'unknown', step: step ?? undefined, totalSteps: totalSteps ?? undefined };
    }

    // Merge in progress
    if (existsSync(join(gitDir, 'MERGE_HEAD'))) {
      const incoming = this.readGitFile(join(gitDir, 'MERGE_MSG'))
        ?.match(/Merge branch '([^']+)'/)?.[1]
        ?? this.readGitFile(join(gitDir, 'MERGE_HEAD'))?.substring(0, 7)
        ?? 'unknown';
      return { type: 'merge', incoming };
    }

    // Cherry-pick in progress
    if (existsSync(join(gitDir, 'CHERRY_PICK_HEAD'))) {
      const incoming = this.readGitFile(join(gitDir, 'CHERRY_PICK_HEAD'))?.substring(0, 7) ?? 'unknown';
      return { type: 'cherry-pick', incoming, currentCommit: incoming };
    }

    // Revert in progress
    if (existsSync(join(gitDir, 'REVERT_HEAD'))) {
      const incoming = this.readGitFile(join(gitDir, 'REVERT_HEAD'))?.substring(0, 7) ?? 'unknown';
      return { type: 'revert', incoming, currentCommit: incoming };
    }

    return null;
  }

  /** Abort the current in-progress operation (merge/rebase/cherry-pick/revert). */
  async abortOperation(): Promise<void> {
    const state = this.getOperationState();
    if (!state) throw new Error('No operation in progress to abort');

    switch (state.type) {
      case 'merge':       await this.git.merge(['--abort']); break;
      case 'rebase':      await this.git.rebase(['--abort']); break;
      case 'cherry-pick': await this.git.raw(['cherry-pick', '--abort']); break;
      case 'revert':      await this.git.raw(['revert', '--abort']); break;
    }
  }

  /** Continue the current operation after all conflicts are resolved. */
  async continueOperation(): Promise<GitOperationResult> {
    const state = this.getOperationState();
    if (!state) throw new Error('No operation in progress to continue');

    try {
      switch (state.type) {
        case 'merge':
          // Merge continues by committing — git commit (no --continue flag)
          await this.git.commit([]);
          break;
        case 'rebase':
          await this.git.rebase(['--continue']);
          break;
        case 'cherry-pick':
          await this.git.raw(['cherry-pick', '--continue']);
          break;
        case 'revert':
          await this.git.raw(['revert', '--continue']);
          break;
      }
      return { success: true, conflicts: [], message: `${state.type} continued successfully` };
    } catch (err: unknown) {
      // Rebase may hit the next commit's conflicts
      const conflicts = await this.getConflictedPaths();
      if (conflicts.length > 0) {
        return { success: false, conflicts, message: `${state.type} hit new conflicts on the next commit` };
      }
      throw err;
    }
  }

  /** Mark a file as resolved by staging it. */
  async resolveFile(filePath: string): Promise<void> {
    await this.git.add([filePath]);
  }

  /** Resolve a conflict by choosing a strategy: keep ours, keep theirs, or just mark resolved. */
  async resolveConflictWithStrategy(filePath: string, strategy: 'ours' | 'theirs' | 'mark-resolved'): Promise<void> {
    if (strategy === 'ours') {
      await this.git.raw(['checkout', '--ours', '--', filePath]);
    } else if (strategy === 'theirs') {
      await this.git.raw(['checkout', '--theirs', '--', filePath]);
    }
    // All strategies finish with git add to mark as resolved
    await this.git.add([filePath]);
  }

  /** Skip the current commit during a rebase. */
  async skipRebaseCommit(): Promise<GitOperationResult> {
    try {
      await this.git.rebase(['--skip']);
      return { success: true, conflicts: [], message: 'Skipped commit and continued rebase' };
    } catch (err: unknown) {
      const conflicts = await this.getConflictedPaths();
      if (conflicts.length > 0) {
        return { success: false, conflicts, message: 'Rebase hit new conflicts after skip' };
      }
      throw err;
    }
  }

  // ── Private helpers ────────────────────────────────────────────────

  /** Get list of conflicted file paths from git status. */
  private async getConflictedPaths(): Promise<string[]> {
    const status = await this.git.status();
    return status.conflicted ?? [];
  }

  /** Read a small git metadata file, trimming whitespace. Returns null if missing. */
  private readGitFile(filePath: string): string | null {
    try {
      return readFileSync(filePath, 'utf-8').trim();
    } catch { return null; }
  }

  /** Read a git metadata file and parse as integer. Returns null if missing or not a number. */
  private readGitInt(filePath: string): number | null {
    const content = this.readGitFile(filePath);
    if (content === null) return null;
    const n = parseInt(content, 10);
    return isNaN(n) ? null : n;
  }

  // Private helpers
  private mapFileChanges(
    files: string[],
    status: StatusResult,
    forceStatus?: GitFileChange['status']
  ): GitFileChange[] {
    return files.map(path => ({
      path,
      status: forceStatus ?? this.inferStatus(path, status),
    }));
  }

  private inferStatus(path: string, status: StatusResult): GitFileChange['status'] {
    if (status.created.includes(path)) return 'added';
    if (status.deleted.includes(path)) return 'deleted';
    if (status.renamed.some(r => r.to === path || r.from === path)) return 'renamed';
    return 'modified';
  }

  private parseBlame(raw: string): BlameLine[] {
    const lines: BlameLine[] = [];
    const blameLines = raw.split('\n');

    let current = { hash: '', author: '', date: 0, lineNum: 0 };

    for (const line of blameLines) {
      const hashMatch = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/);
      if (hashMatch) {
        current = { ...current, hash: hashMatch[1], lineNum: parseInt(hashMatch[2], 10) };
      } else if (line.startsWith('author ')) {
        current = { ...current, author: line.substring(7) };
      } else if (line.startsWith('author-time ')) {
        current = { ...current, date: parseInt(line.substring(12), 10) * 1000 };
      } else if (line.startsWith('\t')) {
        lines.push({
          lineNumber: current.lineNum,
          commitHash: current.hash.substring(0, 7),
          author: current.author,
          date: current.date,
          content: line.substring(1),
        });
      }
    }
    return lines;
  }
}
