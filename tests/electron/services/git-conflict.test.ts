import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// We test getOperationState() logic by extracting the detection patterns
// Since GitService is tightly coupled to simple-git, we test the state detection
// logic by mocking fs calls that getOperationState() depends on.

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

// Import after mocking
import { GitService } from '../../../electron/services/git-service';

// We need to also mock simple-git to construct GitService without a real repo
vi.mock('simple-git', () => {
  const mockGit = {
    checkIsRepo: vi.fn().mockResolvedValue(true),
    status: vi.fn().mockResolvedValue({
      current: 'main',
      tracking: null,
      ahead: 0,
      behind: 0,
      staged: [],
      modified: [],
      deleted: [],
      not_added: [],
      created: [],
      renamed: [],
      conflicted: [],
      isClean: () => true,
    }),
    merge: vi.fn(),
    rebase: vi.fn(),
    raw: vi.fn(),
    add: vi.fn(),
    commit: vi.fn(),
  };
  return {
    default: () => mockGit,
    __mockGit: mockGit,
  };
});

const { __mockGit: mockGit } = await import('simple-git') as any;

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);

describe('GitService — conflict resolution', () => {
  let service: GitService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GitService('/test/project');
  });

  describe('getOperationState', () => {
    it('returns null when no operation is in progress', () => {
      mockedExistsSync.mockReturnValue(false);
      expect(service.getOperationState()).toBeNull();
    });

    it('detects merge in progress from MERGE_HEAD', () => {
      mockedExistsSync.mockImplementation((p) => {
        const path = String(p);
        if (path === join('/test/project', '.git', 'rebase-merge')) return false;
        if (path === join('/test/project', '.git', 'rebase-apply')) return false;
        if (path === join('/test/project', '.git', 'MERGE_HEAD')) return true;
        return false;
      });
      mockedReadFileSync.mockImplementation((p) => {
        const path = String(p);
        if (path === join('/test/project', '.git', 'MERGE_MSG'))
          return "Merge branch 'feature/auth' into main" as any;
        if (path === join('/test/project', '.git', 'MERGE_HEAD'))
          return 'abc1234567890' as any;
        return '' as any;
      });

      const state = service.getOperationState();
      expect(state).not.toBeNull();
      expect(state!.type).toBe('merge');
      expect(state!.incoming).toBe('feature/auth');
    });

    it('detects interactive rebase in progress from rebase-merge', () => {
      mockedExistsSync.mockImplementation((p) => {
        const path = String(p);
        if (path === join('/test/project', '.git', 'rebase-merge')) return true;
        return false;
      });
      mockedReadFileSync.mockImplementation((p) => {
        const path = String(p);
        if (path === join('/test/project', '.git', 'rebase-merge', 'msgnum')) return '2' as any;
        if (path === join('/test/project', '.git', 'rebase-merge', 'end')) return '5' as any;
        if (path === join('/test/project', '.git', 'rebase-merge', 'head-name')) return 'refs/heads/feature/ui' as any;
        if (path === join('/test/project', '.git', 'rebase-merge', 'stopped-sha')) return 'deadbeef1234567890' as any;
        return '' as any;
      });

      const state = service.getOperationState();
      expect(state).not.toBeNull();
      expect(state!.type).toBe('rebase');
      expect(state!.incoming).toBe('feature/ui');
      expect(state!.step).toBe(2);
      expect(state!.totalSteps).toBe(5);
      expect(state!.currentCommit).toBe('deadbee');
    });

    it('detects non-interactive rebase from rebase-apply', () => {
      mockedExistsSync.mockImplementation((p) => {
        const path = String(p);
        if (path === join('/test/project', '.git', 'rebase-merge')) return false;
        if (path === join('/test/project', '.git', 'rebase-apply')) return true;
        return false;
      });
      mockedReadFileSync.mockImplementation((p) => {
        const path = String(p);
        if (path === join('/test/project', '.git', 'rebase-apply', 'next')) return '3' as any;
        if (path === join('/test/project', '.git', 'rebase-apply', 'last')) return '7' as any;
        return '' as any;
      });

      const state = service.getOperationState();
      expect(state).not.toBeNull();
      expect(state!.type).toBe('rebase');
      expect(state!.step).toBe(3);
      expect(state!.totalSteps).toBe(7);
    });

    it('detects cherry-pick in progress from CHERRY_PICK_HEAD', () => {
      mockedExistsSync.mockImplementation((p) => {
        const path = String(p);
        if (path === join('/test/project', '.git', 'rebase-merge')) return false;
        if (path === join('/test/project', '.git', 'rebase-apply')) return false;
        if (path === join('/test/project', '.git', 'MERGE_HEAD')) return false;
        if (path === join('/test/project', '.git', 'CHERRY_PICK_HEAD')) return true;
        return false;
      });
      mockedReadFileSync.mockImplementation((p) => {
        const path = String(p);
        if (path === join('/test/project', '.git', 'CHERRY_PICK_HEAD'))
          return 'abc1234567890abcdef' as any;
        return '' as any;
      });

      const state = service.getOperationState();
      expect(state).not.toBeNull();
      expect(state!.type).toBe('cherry-pick');
      expect(state!.incoming).toBe('abc1234');
      expect(state!.currentCommit).toBe('abc1234');
    });

    it('detects revert in progress from REVERT_HEAD', () => {
      mockedExistsSync.mockImplementation((p) => {
        const path = String(p);
        if (path === join('/test/project', '.git', 'rebase-merge')) return false;
        if (path === join('/test/project', '.git', 'rebase-apply')) return false;
        if (path === join('/test/project', '.git', 'MERGE_HEAD')) return false;
        if (path === join('/test/project', '.git', 'CHERRY_PICK_HEAD')) return false;
        if (path === join('/test/project', '.git', 'REVERT_HEAD')) return true;
        return false;
      });
      mockedReadFileSync.mockImplementation((p) => {
        const path = String(p);
        if (path === join('/test/project', '.git', 'REVERT_HEAD'))
          return 'def4567890abcdef12' as any;
        return '' as any;
      });

      const state = service.getOperationState();
      expect(state).not.toBeNull();
      expect(state!.type).toBe('revert');
      expect(state!.incoming).toBe('def4567');
    });

    it('prioritises rebase over merge detection', () => {
      // Both rebase-merge and MERGE_HEAD exist — rebase takes precedence
      mockedExistsSync.mockImplementation((p) => {
        const path = String(p);
        if (path === join('/test/project', '.git', 'rebase-merge')) return true;
        if (path === join('/test/project', '.git', 'MERGE_HEAD')) return true;
        return false;
      });
      mockedReadFileSync.mockImplementation(() => '' as any);

      const state = service.getOperationState();
      expect(state!.type).toBe('rebase');
    });
  });

  describe('merge', () => {
    it('returns success when merge completes cleanly', async () => {
      mockGit.merge.mockResolvedValueOnce({});
      const result = await service.merge('feature/auth');
      expect(result.success).toBe(true);
      expect(result.conflicts).toEqual([]);
      expect(mockGit.merge).toHaveBeenCalledWith(['feature/auth']);
    });

    it('returns conflicts when merge fails with conflicts', async () => {
      mockGit.merge.mockRejectedValueOnce(new Error('CONFLICTS'));
      mockGit.status.mockResolvedValueOnce({
        current: 'main', tracking: null, ahead: 0, behind: 0,
        staged: [], modified: [], deleted: [], not_added: [],
        created: [], renamed: [],
        conflicted: ['src/auth.ts', 'src/login.tsx'],
        isClean: () => false,
      });

      const result = await service.merge('feature/auth');
      expect(result.success).toBe(false);
      expect(result.conflicts).toEqual(['src/auth.ts', 'src/login.tsx']);
    });

    it('throws non-conflict errors', async () => {
      mockGit.merge.mockRejectedValueOnce(new Error('fatal: not a git repository'));
      mockGit.status.mockResolvedValueOnce({
        current: 'main', tracking: null, ahead: 0, behind: 0,
        staged: [], modified: [], deleted: [], not_added: [],
        created: [], renamed: [], conflicted: [],
        isClean: () => true,
      });

      await expect(service.merge('nonexistent')).rejects.toThrow('fatal: not a git repository');
    });
  });

  describe('abortOperation', () => {
    it('aborts merge when merge is in progress', async () => {
      mockedExistsSync.mockImplementation((p) => {
        const path = String(p);
        if (path === join('/test/project', '.git', 'rebase-merge')) return false;
        if (path === join('/test/project', '.git', 'rebase-apply')) return false;
        if (path === join('/test/project', '.git', 'MERGE_HEAD')) return true;
        return false;
      });
      mockedReadFileSync.mockImplementation(() => 'abc123' as any);
      mockGit.merge.mockResolvedValueOnce({});

      await service.abortOperation();
      expect(mockGit.merge).toHaveBeenCalledWith(['--abort']);
    });

    it('aborts rebase when rebase is in progress', async () => {
      mockedExistsSync.mockImplementation((p) => {
        const path = String(p);
        if (path === join('/test/project', '.git', 'rebase-merge')) return true;
        return false;
      });
      mockedReadFileSync.mockImplementation(() => '' as any);
      mockGit.rebase.mockResolvedValueOnce({});

      await service.abortOperation();
      expect(mockGit.rebase).toHaveBeenCalledWith(['--abort']);
    });

    it('aborts cherry-pick when cherry-pick is in progress', async () => {
      mockedExistsSync.mockImplementation((p) => {
        const path = String(p);
        if (path === join('/test/project', '.git', 'rebase-merge')) return false;
        if (path === join('/test/project', '.git', 'rebase-apply')) return false;
        if (path === join('/test/project', '.git', 'MERGE_HEAD')) return false;
        if (path === join('/test/project', '.git', 'CHERRY_PICK_HEAD')) return true;
        return false;
      });
      mockedReadFileSync.mockImplementation(() => 'abc123' as any);
      mockGit.raw.mockResolvedValueOnce('');

      await service.abortOperation();
      expect(mockGit.raw).toHaveBeenCalledWith(['cherry-pick', '--abort']);
    });

    it('throws when no operation is in progress', async () => {
      mockedExistsSync.mockReturnValue(false);
      await expect(service.abortOperation()).rejects.toThrow('No operation in progress');
    });
  });

  describe('resolveFile', () => {
    it('stages the file via git add', async () => {
      mockGit.add.mockResolvedValueOnce({});
      await service.resolveFile('src/auth.ts');
      expect(mockGit.add).toHaveBeenCalledWith(['src/auth.ts']);
    });
  });

  describe('continueOperation', () => {
    it('continues rebase when rebase is in progress', async () => {
      mockedExistsSync.mockImplementation((p) => {
        const path = String(p);
        if (path === join('/test/project', '.git', 'rebase-merge')) return true;
        return false;
      });
      mockedReadFileSync.mockImplementation(() => '' as any);
      mockGit.rebase.mockResolvedValueOnce({});

      const result = await service.continueOperation();
      expect(result.success).toBe(true);
      expect(mockGit.rebase).toHaveBeenCalledWith(['--continue']);
    });

    it('throws when no operation is in progress', async () => {
      mockedExistsSync.mockReturnValue(false);
      await expect(service.continueOperation()).rejects.toThrow('No operation in progress');
    });
  });
});

describe('Conflict marker parsing', () => {
  it('counts conflict regions in file content', () => {
    const content = `line 1
<<<<<<< HEAD
our code
=======
their code
>>>>>>> feature/x
line 2
<<<<<<< HEAD
more ours
=======
more theirs
>>>>>>> feature/x
line 3`;

    const count = (content.match(/^<{7} /gm) ?? []).length;
    expect(count).toBe(2);
  });

  it('returns 0 for files without markers', () => {
    const content = 'just normal code\nno conflicts here\n';
    const count = (content.match(/^<{7} /gm) ?? []).length;
    expect(count).toBe(0);
  });

  it('handles empty content', () => {
    const count = (''.match(/^<{7} /gm) ?? []).length;
    expect(count).toBe(0);
  });
});
