import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFile } from 'child_process';

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    execFile: vi.fn(),
  };
});

const mockedExecFile = vi.mocked(execFile);

import { TaskReviewService } from '../../../electron/services/task-review-service';

describe('TaskReviewService', () => {
  let service: TaskReviewService;
  const projectPath = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TaskReviewService();

    // Default: td is found on PATH
    mockedExecFile.mockImplementation(((cmd: string, args: string[], opts: any, cb?: Function) => {
      // Handle both 3-arg (which/where) and 4-arg (td approve/reject) overloads
      const callback = cb || opts;
      if (typeof callback !== 'function') return;

      // 'which td' / 'where td'
      if (cmd === 'which' || cmd === 'where') {
        callback(null, { stdout: '/usr/local/bin/td\n', stderr: '' });
        return;
      }

      // Default: td command succeeds
      if (cmd === '/usr/local/bin/td') {
        const subCmd = (args as string[])[0];
        if (subCmd === 'approve') {
          callback(null, { stdout: `APPROVED ${(args as string[])[1]}\n`, stderr: '' });
        } else if (subCmd === 'reject') {
          callback(null, { stdout: `REJECTED ${(args as string[])[1]}\n`, stderr: '' });
        } else {
          callback(null, { stdout: '', stderr: '' });
        }
        return;
      }

      callback(null, { stdout: '', stderr: '' });
    }) as any);
  });

  describe('approve()', () => {
    it('returns success when td approve succeeds', async () => {
      const result = await service.approve(projectPath, 'td-abc123');
      expect(result.success).toBe(true);
      expect(result.message).toContain('APPROVED');
    });

    it('passes correct arguments to td', async () => {
      await service.approve(projectPath, 'td-abc123');

      // Find the td call (not the which call)
      const tdCall = mockedExecFile.mock.calls.find(
        (call) => call[0] === '/usr/local/bin/td'
      );
      expect(tdCall).toBeDefined();
      expect(tdCall![1]).toEqual(['approve', 'td-abc123']);
      expect((tdCall![2] as any).cwd).toBe(projectPath);
    });

    it('returns failure when td is not found', async () => {
      mockedExecFile.mockImplementation(((cmd: string, _args: any, opts: any, cb?: Function) => {
        const callback = cb || opts;
        if (typeof callback !== 'function') return;
        if (cmd === 'which' || cmd === 'where') {
          callback(new Error('not found'), { stdout: '', stderr: '' });
          return;
        }
        callback(null, { stdout: '', stderr: '' });
      }) as any);

      const result = await service.approve(projectPath, 'td-abc123');
      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('returns failure when td approve fails', async () => {
      mockedExecFile.mockImplementation(((cmd: string, args: string[], opts: any, cb?: Function) => {
        const callback = cb || opts;
        if (typeof callback !== 'function') return;
        if (cmd === 'which' || cmd === 'where') {
          callback(null, { stdout: '/usr/local/bin/td\n', stderr: '' });
          return;
        }
        if (cmd === '/usr/local/bin/td') {
          const err = new Error('cannot approve own work') as any;
          err.stderr = 'ERROR: cannot approve issues you implemented';
          callback(err, { stdout: '', stderr: err.stderr });
          return;
        }
        callback(null, { stdout: '', stderr: '' });
      }) as any);

      const result = await service.approve(projectPath, 'td-abc123');
      expect(result.success).toBe(false);
      expect(result.message).toContain('cannot approve');
    });
  });

  describe('reject()', () => {
    it('returns success when td reject succeeds', async () => {
      const result = await service.reject(projectPath, 'td-abc123', 'needs tests');
      expect(result.success).toBe(true);
      expect(result.message).toContain('REJECTED');
    });

    it('passes reason flag to td', async () => {
      await service.reject(projectPath, 'td-abc123', 'needs more tests');

      const tdCall = mockedExecFile.mock.calls.find(
        (call) => call[0] === '/usr/local/bin/td'
      );
      expect(tdCall).toBeDefined();
      expect(tdCall![1]).toEqual(['reject', 'td-abc123', '--reason', 'needs more tests']);
    });

    it('works without a reason', async () => {
      await service.reject(projectPath, 'td-abc123');

      const tdCall = mockedExecFile.mock.calls.find(
        (call) => call[0] === '/usr/local/bin/td'
      );
      expect(tdCall).toBeDefined();
      expect(tdCall![1]).toEqual(['reject', 'td-abc123']);
    });

    it('returns failure when td is not found', async () => {
      mockedExecFile.mockImplementation(((cmd: string, _args: any, opts: any, cb?: Function) => {
        const callback = cb || opts;
        if (typeof callback !== 'function') return;
        if (cmd === 'which' || cmd === 'where') {
          callback(new Error('not found'), { stdout: '', stderr: '' });
          return;
        }
        callback(null, { stdout: '', stderr: '' });
      }) as any);

      const result = await service.reject(projectPath, 'td-abc123', 'bad code');
      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('returns failure when td reject fails', async () => {
      mockedExecFile.mockImplementation(((cmd: string, _args: any, opts: any, cb?: Function) => {
        const callback = cb || opts;
        if (typeof callback !== 'function') return;
        if (cmd === 'which' || cmd === 'where') {
          callback(null, { stdout: '/usr/local/bin/td\n', stderr: '' });
          return;
        }
        if (cmd === '/usr/local/bin/td') {
          const err = new Error('issue not in review') as any;
          err.stderr = 'ERROR: issue td-abc123 is not in review status';
          callback(err, { stdout: '', stderr: err.stderr });
          return;
        }
        callback(null, { stdout: '', stderr: '' });
      }) as any);

      const result = await service.reject(projectPath, 'td-abc123', 'nope');
      expect(result.success).toBe(false);
      expect(result.message).toContain('not in review');
    });
  });
});
