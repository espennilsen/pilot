import simpleGit, { type SimpleGit, type StatusResult } from 'simple-git';
import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import type {
  GitStatus, GitBranch, GitCommit, GitLogOptions,
  BlameLine, GitStash, GitFileChange,
  GitOperationState, ConflictFile, GitOperationResult,
  RebaseTodoEntry, InteractiveRebaseRequest, RebaseAction,
  GitSubmodule, SubmoduleStatusCode,
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

  async pull(remote = 'origin', branch?: string): Promise<GitOperationResult> {
    try {
      if (branch) {
        await this.git.pull(remote, branch);
      } else {
        await this.git.pull();
      }
      return { success: true, conflicts: [], message: 'Pull completed successfully' };
    } catch (err: unknown) {
      const conflicts = await this.getConflictedPaths();
      if (conflicts.length > 0) {
        return { success: false, conflicts, message: `Pull produced ${conflicts.length} conflict(s)` };
      }
      throw err;
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

  async stashApply(stashId: string): Promise<GitOperationResult> {
    try {
      await this.git.stash(['apply', stashId]);
      return { success: true, conflicts: [], message: `Applied stash ${stashId} successfully` };
    } catch (err: unknown) {
      const conflicts = await this.getConflictedPaths();
      if (conflicts.length > 0) {
        return { success: false, conflicts, message: `Stash apply produced ${conflicts.length} conflict(s)` };
      }
      throw err;
    }
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

  // ── Interactive Rebase ──────────────────────────────────────────────

  /**
   * Prepare an interactive rebase by listing commits between `onto` and HEAD.
   * Returns a todo list the UI can reorder and assign actions to.
   */
  async prepareInteractiveRebase(onto: string): Promise<RebaseTodoEntry[]> {
    // Block if another operation is already in progress
    const existingOp = this.getOperationState();
    if (existingOp) {
      throw new Error(`Cannot start interactive rebase: a ${existingOp.type} is already in progress. Resolve it first.`);
    }

    // Get commits from (onto, HEAD] — these are the ones that will be replayed
    const logOutput = await this.git.log([`${onto}..HEAD`, '--reverse']);

    return logOutput.all.map(entry => ({
      hash: entry.hash,
      hashShort: entry.hash.substring(0, 7),
      action: 'pick' as RebaseAction,
      message: entry.message,
      author: entry.author_name,
      date: new Date(entry.date).getTime(),
    }));
  }

  /**
   * Execute an interactive rebase using GIT_SEQUENCE_EDITOR to inject the todo list.
   *
   * This works by setting GIT_SEQUENCE_EDITOR to a script that replaces the
   * editor-generated todo file with our pre-built one, then running `git rebase -i`.
   */
  async executeInteractiveRebase(request: InteractiveRebaseRequest): Promise<GitOperationResult> {
    const os = await import('os');
    const fs = await import('fs/promises');
    const path = await import('path');

    // ── Block if another operation is already in progress ────────────
    // Instead of silently aborting, return an error so the user can
    // decide via the conflict banner (Resume / Abort).
    const existingOp = this.getOperationState();
    if (existingOp) {
      return {
        success: false,
        conflicts: [],
        message: `Cannot start interactive rebase: a ${existingOp.type} is already in progress. Use the git panel to resume or abort it first.`,
      };
    }

    const todoLines = request.entries
      .map(entry => `${entry.action} ${entry.hash} ${entry.message}`)
      .join('\n');

    const tmpDir = os.tmpdir();
    const timestamp = Date.now();
    const todoFile = path.join(tmpDir, `pilot-rebase-todo-${timestamp}`);
    const manifestFile = path.join(tmpDir, `pilot-rebase-manifest-${timestamp}.json`);
    const editorScript = path.join(tmpDir, `pilot-rebase-editor-${timestamp}.js`);
    const tmpFiles = [todoFile, manifestFile, editorScript];

    await fs.writeFile(todoFile, todoLines + '\n', 'utf-8');

    // ── Build editor manifest ────────────────────────────────────────
    // GIT_EDITOR is invoked for:
    //   1. Each `reword` commit (to edit the commit message)
    //   2. Each squash group with ≥1 `squash` member (combined-message editor;
    //      fixup-only groups skip the editor)
    // We walk the todo and emit manifest entries in invocation order.
    const manifest: Array<{ message: string | null }> = [];
    const entries = request.entries;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      if (entry.action === 'reword') {
        manifest.push({ message: entry.newMessage ?? null });
      }

      // After a non-squash/fixup/drop entry, check for a trailing squash group.
      if (entry.action !== 'squash' && entry.action !== 'fixup' && entry.action !== 'drop') {
        let hasSquashMember = false;
        let j = i + 1;
        while (j < entries.length && (entries[j].action === 'squash' || entries[j].action === 'fixup')) {
          if (entries[j].action === 'squash') hasSquashMember = true;
          j++;
        }
        if (hasSquashMember) {
          manifest.push({ message: entry.squashMessage ?? null });
        }
      }
    }

    await fs.writeFile(manifestFile, JSON.stringify(manifest), 'utf-8');

    // ── Write editor script ──────────────────────────────────────────
    // Standalone .js file — avoids shell quoting and node -e argv issues.
    // Git invokes: node "/path/to/editor.js" "/path/to/COMMIT_EDITMSG"
    const editorCode = `'use strict';
const fs = require('fs');
const manifestPath = ${JSON.stringify(manifestFile)};
const msgFile = process.argv[2];
try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  if (manifest.length === 0) process.exit(0);
  const action = manifest.shift();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf-8');
  if (action.message != null) {
    fs.writeFileSync(msgFile, action.message, 'utf-8');
  }
} catch {
  process.exit(0);
}
`;
    await fs.writeFile(editorScript, editorCode, 'utf-8');

    // ── Sequence editor: copies our todo over git's todo ─────────────
    // Git runs: system("$GIT_SEQUENCE_EDITOR \"$path\"") — appends path as last arg.
    const seqEditor = process.platform === 'win32'
      ? `node -e "require('fs').copyFileSync('${todoFile.replace(/\\/g, '\\\\')}', process.argv[1])"`
      : `cp "${todoFile}"`;

    const env = {
      ...process.env,
      GIT_SEQUENCE_EDITOR: seqEditor,
      GIT_EDITOR: `node "${editorScript}"`,
    };

    try {
      await this.git.env(env).rebase(['-i', request.onto]);
      return { success: true, conflicts: [], message: 'Interactive rebase completed successfully' };
    } catch (err: unknown) {
      const conflicts = await this.getConflictedPaths();
      if (conflicts.length > 0) {
        return {
          success: false,
          conflicts,
          message: `Interactive rebase produced ${conflicts.length} conflict(s)`,
        };
      }
      throw err;
    } finally {
      // NOTE: Temp files (including the editor manifest) are deleted here.
      // If the todo contains an `edit` action, git pauses the rebase and this
      // process exits — the manifest is gone. When the user later runs
      // `git rebase --continue`, any subsequent squash step will not find the
      // manifest, causing the editor script to exit silently and git to
      // auto-generate the squash message instead of using the user's custom one.
      // A UI warning is shown when edit + squash/fixup are combined.
      await Promise.all(tmpFiles.map(f => fs.unlink(f).catch(() => {})));
    }
  }

  // ── Submodules ──────────────────────────────────────────────────────

  /** List all submodules with their current status. Returns [] if no .gitmodules. */
  async getSubmodules(): Promise<GitSubmodule[]> {
    if (!existsSync(join(this.cwd, '.gitmodules'))) return [];

    try {
      // `git submodule status` outputs one line per submodule:
      //   <status-char><sha1> <path> (<describe>)
      // Status char: ' ' = initialized at recorded commit, '-' = uninitialized,
      //              '+' = different commit, 'U' = merge conflict
      const raw = await this.git.raw(['submodule', 'status', '--recursive']);
      if (!raw.trim()) return [];

      // Parse .gitmodules for url and branch info
      const moduleConfig = await this.parseGitmodules();

      const submodules: GitSubmodule[] = [];
      // Split on newlines but preserve leading status character (space = initialized)
      for (const line of raw.split('\n').filter(l => l.length > 0)) {
        const match = line.match(/^([U+ -])([0-9a-f]+)\s+(\S+)(?:\s+\((.+)\))?$/);
        if (!match) continue;

        const [, statusChar, hash, subPath] = match;
        const config = moduleConfig.get(subPath);

        let status: SubmoduleStatusCode;
        let statusLabel: string;
        switch (statusChar) {
          case '-':
            status = 'uninitialized';
            statusLabel = 'Not initialized';
            break;
          case '+':
            status = 'modified';
            statusLabel = 'Modified (HEAD differs from recorded commit)';
            break;
          case 'U':
            status = 'conflict';
            statusLabel = 'Merge conflict';
            break;
          default:
            status = 'initialized';
            statusLabel = 'Up to date';
            break;
        }

        // For modified submodules, `hash` is the current HEAD, not the recorded commit.
        // Fetch the recorded commit from the parent index via ls-tree.
        let expectedCommit = hash;
        if (status === 'modified') {
          try {
            const lsTree = await this.git.raw(['ls-tree', 'HEAD', '--', subPath]);
            const treeMatch = lsTree.match(/\s([0-9a-f]{40})\s/);
            if (treeMatch) expectedCommit = treeMatch[1];
          } catch { /* fall back to hash from submodule status */ }
        }

        submodules.push({
          name: config?.name ?? subPath,
          path: subPath,
          url: config?.url ?? '',
          branch: config?.branch ?? null,
          expectedCommit,
          currentCommit: status === 'uninitialized' ? null : hash,
          status,
          dirty: false, // populated below
          statusLabel,
        });
      }

      // Check dirty status for all initialized submodules in parallel
      await Promise.all(
        submodules
          .filter(s => s.status !== 'uninitialized')
          .map(async (s) => {
            try {
              const dirtyCheck = await this.git.raw([
                '-C', join(this.cwd, s.path), 'status', '--porcelain',
              ]);
              if (dirtyCheck.trim().length > 0) {
                s.dirty = true;
                s.statusLabel += ' (dirty)';
              }
            } catch { /* submodule dir may not exist */ }
          })
      );

      return submodules;
    } catch { /* Expected: submodule command may fail if git is too old */
      return [];
    }
  }

  /** Initialize one or all submodules. */
  async initSubmodule(subPath?: string): Promise<void> {
    const args = ['submodule', 'init'];
    if (subPath) args.push('--', subPath);
    await this.git.raw(args);
  }

  /** Deinitialize a submodule (removes its working tree). */
  async deinitSubmodule(subPath: string, force?: boolean): Promise<void> {
    const args = ['submodule', 'deinit'];
    if (force) args.push('--force');
    args.push('--', subPath);
    await this.git.raw(args);
  }

  /** Update one or all submodules to the commit recorded in the parent. */
  async updateSubmodule(subPath?: string, options?: { recursive?: boolean; init?: boolean }): Promise<void> {
    const args = ['submodule', 'update'];
    if (options?.init) args.push('--init');
    if (options?.recursive) args.push('--recursive');
    if (subPath) args.push('--', subPath);
    await this.git.raw(args);
  }

  /** Sync submodule remote URLs from .gitmodules to .git/config. */
  async syncSubmodule(subPath?: string): Promise<void> {
    const args = ['submodule', 'sync'];
    if (subPath) args.push('--', subPath);
    await this.git.raw(args);
  }

  // ── Private helpers ────────────────────────────────────────────────

  /** Parse .gitmodules file to extract submodule config (name, url, branch). */
  private async parseGitmodules(): Promise<Map<string, { name: string; url: string; branch: string | null }>> {
    const result = new Map<string, { name: string; url: string; branch: string | null }>();
    try {
      const raw = await this.git.raw(['config', '--file', '.gitmodules', '--list']);
      // Output lines: submodule.<name>.path=<path>, submodule.<name>.url=<url>, etc.
      const entries = new Map<string, Record<string, string>>();
      for (const line of raw.trim().split('\n')) {
        const match = line.match(/^submodule\.(.+?)\.(path|url|branch)=(.*)$/);
        if (!match) continue;
        const [, name, key, value] = match;
        if (!entries.has(name)) entries.set(name, {});
        entries.get(name)![key] = value;
      }
      for (const [name, config] of entries) {
        const path = config['path'];
        if (path) {
          result.set(path, {
            name,
            url: config['url'] ?? '',
            branch: config['branch'] ?? null,
          });
        }
      }
    } catch { /* Expected: .gitmodules may be malformed or missing */ }
    return result;
  }

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
