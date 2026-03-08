import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

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
    raw: vi.fn(),
  };
  return {
    default: () => mockGit,
    __mockGit: mockGit,
  };
});

const { __mockGit: mockGit } = await import('simple-git') as any;
const mockedExistsSync = vi.mocked(existsSync);

import { GitService } from '../../../electron/services/git-service';

describe('GitService — submodule support', () => {
  let service: GitService;
  const cwd = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset raw to a clean default — clearAllMocks doesn't clear implementations
    mockGit.raw.mockReset();
    mockGit.raw.mockResolvedValue('');
    service = new GitService(cwd);
  });

  describe('getSubmodules()', () => {
    it('returns empty array when no .gitmodules file exists', async () => {
      mockedExistsSync.mockReturnValue(false);
      const result = await service.getSubmodules();
      expect(result).toEqual([]);
    });

    it('returns empty array when submodule status output is empty', async () => {
      mockedExistsSync.mockReturnValue(true);
      mockGit.raw.mockImplementation((args: string[]) => {
        if (args[0] === 'submodule' && args[1] === 'status') return Promise.resolve('');
        if (args[0] === 'config') return Promise.resolve('');
        return Promise.resolve('');
      });

      const result = await service.getSubmodules();
      expect(result).toEqual([]);
    });

    it('parses initialized submodule at recorded commit', async () => {
      mockedExistsSync.mockReturnValue(true);
      mockGit.raw.mockImplementation((args: string[]) => {
        if (args[0] === 'submodule' && args[1] === 'status') {
          return Promise.resolve(' abc1234567890abcdef1234567890abcdef123456 libs/utils (v1.2.0)\n');
        }
        if (args[0] === 'config' && args[1] === '--file') {
          return Promise.resolve(
            'submodule.utils.path=libs/utils\n' +
            'submodule.utils.url=https://github.com/org/utils.git\n' +
            'submodule.utils.branch=main\n'
          );
        }
        // dirty check — clean
        if (args[0] === '-C') return Promise.resolve('');
        return Promise.resolve('');
      });

      const result = await service.getSubmodules();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: 'utils',
        path: 'libs/utils',
        url: 'https://github.com/org/utils.git',
        branch: 'main',
        status: 'initialized',
        dirty: false,
        statusLabel: 'Up to date',
      });
    });

    it('parses uninitialized submodule', async () => {
      mockedExistsSync.mockReturnValue(true);
      mockGit.raw.mockImplementation((args: string[]) => {
        if (args[0] === 'submodule' && args[1] === 'status') {
          return Promise.resolve('-abc1234567890abcdef1234567890abcdef123456 vendor/lib\n');
        }
        if (args[0] === 'config' && args[1] === '--file') {
          return Promise.resolve(
            'submodule.lib.path=vendor/lib\n' +
            'submodule.lib.url=git@github.com:org/lib.git\n'
          );
        }
        return Promise.resolve('');
      });

      const result = await service.getSubmodules();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: 'lib',
        path: 'vendor/lib',
        status: 'uninitialized',
        currentCommit: null,
        dirty: false,
      });
    });

    it('parses modified submodule (HEAD differs) and resolves recorded commit via ls-tree', async () => {
      mockedExistsSync.mockReturnValue(true);
      const currentHead = 'def4567890abcdef1234567890abcdef12345678';
      const recordedCommit = 'aaa0000000000000000000000000000000000000';
      mockGit.raw.mockImplementation((args: string[]) => {
        if (args[0] === 'submodule' && args[1] === 'status') {
          return Promise.resolve(`+${currentHead} libs/core (heads/feature)\n`);
        }
        if (args[0] === 'config' && args[1] === '--file') {
          return Promise.resolve('submodule.core.path=libs/core\nsubmodule.core.url=https://github.com/org/core.git\n');
        }
        if (args[0] === 'ls-tree') {
          return Promise.resolve(`160000 commit ${recordedCommit}\tlibs/core\n`);
        }
        if (args[0] === '-C') return Promise.resolve('');
        return Promise.resolve('');
      });

      const result = await service.getSubmodules();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        status: 'modified',
        statusLabel: 'Modified (HEAD differs from recorded commit)',
        expectedCommit: recordedCommit,
        currentCommit: currentHead,
      });
    });

    it('parses conflicted submodule', async () => {
      mockedExistsSync.mockReturnValue(true);
      mockGit.raw.mockImplementation((args: string[]) => {
        if (args[0] === 'submodule' && args[1] === 'status') {
          return Promise.resolve('Uabc1234567890abcdef1234567890abcdef123456 libs/shared\n');
        }
        if (args[0] === 'config' && args[1] === '--file') {
          return Promise.resolve('submodule.shared.path=libs/shared\nsubmodule.shared.url=https://example.com/shared.git\n');
        }
        if (args[0] === '-C') return Promise.resolve('');
        return Promise.resolve('');
      });

      const result = await service.getSubmodules();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        status: 'conflict',
        statusLabel: 'Merge conflict',
      });
    });

    it('detects dirty submodule working tree', async () => {
      mockedExistsSync.mockReturnValue(true);
      mockGit.raw.mockImplementation((args: string[]) => {
        if (args[0] === 'submodule' && args[1] === 'status') {
          return Promise.resolve(' abc1234567890abcdef1234567890abcdef123456 libs/utils\n');
        }
        if (args[0] === 'config' && args[1] === '--file') {
          return Promise.resolve('submodule.utils.path=libs/utils\nsubmodule.utils.url=https://example.com/utils.git\n');
        }
        // dirty check — has changes
        if (args[0] === '-C') return Promise.resolve(' M src/index.ts\n');
        return Promise.resolve('');
      });

      const result = await service.getSubmodules();
      expect(result).toHaveLength(1);
      expect(result[0].dirty).toBe(true);
      expect(result[0].statusLabel).toContain('dirty');
    });

    it('handles multiple submodules', async () => {
      mockedExistsSync.mockReturnValue(true);
      mockGit.raw.mockImplementation((args: string[]) => {
        if (args[0] === 'submodule' && args[1] === 'status') {
          return Promise.resolve(
            ' aaa1234567890abcdef1234567890abcdef123456 libs/a\n' +
            '-bbb1234567890abcdef1234567890abcdef123456 libs/b\n' +
            '+ccc1234567890abcdef1234567890abcdef123456 libs/c\n'
          );
        }
        if (args[0] === 'config' && args[1] === '--file') {
          return Promise.resolve(
            'submodule.a.path=libs/a\nsubmodule.a.url=https://example.com/a.git\n' +
            'submodule.b.path=libs/b\nsubmodule.b.url=https://example.com/b.git\n' +
            'submodule.c.path=libs/c\nsubmodule.c.url=https://example.com/c.git\n'
          );
        }
        if (args[0] === '-C') return Promise.resolve('');
        return Promise.resolve('');
      });

      const result = await service.getSubmodules();
      expect(result).toHaveLength(3);
      expect(result[0].status).toBe('initialized');
      expect(result[1].status).toBe('uninitialized');
      expect(result[2].status).toBe('modified');
    });

    it('handles git command failure gracefully', async () => {
      mockedExistsSync.mockReturnValue(true);
      mockGit.raw.mockRejectedValue(new Error('git too old'));

      const result = await service.getSubmodules();
      expect(result).toEqual([]);
    });
  });

  describe('initSubmodule()', () => {
    it('initializes a specific submodule', async () => {
      await service.initSubmodule('libs/utils');
      expect(mockGit.raw).toHaveBeenCalledWith(['submodule', 'init', '--', 'libs/utils']);
    });

    it('initializes all submodules when no path given', async () => {
      await service.initSubmodule();
      expect(mockGit.raw).toHaveBeenCalledWith(['submodule', 'init']);
    });
  });

  describe('deinitSubmodule()', () => {
    it('deinitializes a submodule', async () => {
      await service.deinitSubmodule('libs/utils');
      expect(mockGit.raw).toHaveBeenCalledWith(['submodule', 'deinit', '--', 'libs/utils']);
    });

    it('supports force flag', async () => {
      await service.deinitSubmodule('libs/utils', true);
      expect(mockGit.raw).toHaveBeenCalledWith(['submodule', 'deinit', '--force', '--', 'libs/utils']);
    });
  });

  describe('updateSubmodule()', () => {
    it('updates a specific submodule', async () => {
      await service.updateSubmodule('libs/utils');
      expect(mockGit.raw).toHaveBeenCalledWith(['submodule', 'update', '--', 'libs/utils']);
    });

    it('updates all submodules when no path given', async () => {
      await service.updateSubmodule();
      expect(mockGit.raw).toHaveBeenCalledWith(['submodule', 'update']);
    });

    it('supports init flag', async () => {
      await service.updateSubmodule(undefined, { init: true });
      expect(mockGit.raw).toHaveBeenCalledWith(['submodule', 'update', '--init']);
    });

    it('supports recursive flag', async () => {
      await service.updateSubmodule(undefined, { recursive: true });
      expect(mockGit.raw).toHaveBeenCalledWith(['submodule', 'update', '--recursive']);
    });

    it('supports both init and recursive flags', async () => {
      await service.updateSubmodule(undefined, { init: true, recursive: true });
      expect(mockGit.raw).toHaveBeenCalledWith(['submodule', 'update', '--init', '--recursive']);
    });

    it('supports path with options', async () => {
      await service.updateSubmodule('libs/utils', { init: true, recursive: true });
      expect(mockGit.raw).toHaveBeenCalledWith(['submodule', 'update', '--init', '--recursive', '--', 'libs/utils']);
    });
  });

  describe('syncSubmodule()', () => {
    it('syncs a specific submodule', async () => {
      await service.syncSubmodule('libs/utils');
      expect(mockGit.raw).toHaveBeenCalledWith(['submodule', 'sync', '--', 'libs/utils']);
    });

    it('syncs all submodules when no path given', async () => {
      await service.syncSubmodule();
      expect(mockGit.raw).toHaveBeenCalledWith(['submodule', 'sync']);
    });
  });
});
