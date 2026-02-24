import simpleGit, { type SimpleGit, type StatusResult } from 'simple-git';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import type {
  GitStatus, GitBranch, GitCommit, GitLogOptions,
  BlameLine, GitStash, GitFileChange
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
      isClean: status.isClean(),
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
