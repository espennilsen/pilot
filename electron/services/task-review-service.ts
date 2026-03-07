/**
 * @file Task review service — runs td approve/reject in a subprocess.
 *
 * td requires that the approving session differs from the implementing session.
 * By spawning td as a child process, it automatically gets a fresh session ID,
 * satisfying this constraint without any manual session management.
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { TaskReviewResult } from '../../shared/types';

const execFileAsync = promisify(execFile);

export class TaskReviewService {
  /** Cached td binary path. `undefined` = not yet looked up, `null` = not found. */
  private tdPath: string | null | undefined = undefined;

  /**
   * Find the td binary path. Caches the result after first lookup.
   * Returns null if td is not installed.
   */
  private async findTd(): Promise<string | null> {
    if (this.tdPath !== undefined) return this.tdPath;

    try {
      // Use 'which' on macOS/Linux, 'where' on Windows
      const cmd = process.platform === 'win32' ? 'where' : 'which';
      const { stdout } = await execFileAsync(cmd, ['td']);
      // Trim each line individually to strip \r on Windows
      this.tdPath = stdout.split('\n')[0].trim() || null;
    } catch {
      this.tdPath = null;
    }
    return this.tdPath;
  }

  /**
   * Approve a task that is in review status.
   * Spawns `td approve <taskId>` in a subprocess with its own td session.
   */
  async approve(projectPath: string, taskId: string): Promise<TaskReviewResult> {
    const tdPath = await this.findTd();
    if (!tdPath) {
      return { success: false, message: 'td CLI not found on PATH', error: 'td not available' };
    }

    try {
      const { stdout, stderr } = await execFileAsync(tdPath, ['approve', taskId], {
        cwd: projectPath,
        timeout: 15_000,
      });

      const output = (stdout || stderr || '').trim();
      return { success: true, message: output || `Approved ${taskId}` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Extract stderr if available
      const stderr = (err as any)?.stderr?.trim();
      return {
        success: false,
        message: stderr || message,
        error: message,
      };
    }
  }

  /**
   * Reject a task that is in review status, sending it back to in_progress.
   * Spawns `td reject <taskId> --reason <reason>` in a subprocess.
   */
  async reject(projectPath: string, taskId: string, reason?: string): Promise<TaskReviewResult> {
    const tdPath = await this.findTd();
    if (!tdPath) {
      return { success: false, message: 'td CLI not found on PATH', error: 'td not available' };
    }

    try {
      const args = ['reject', taskId];
      if (reason) {
        args.push('--reason', reason);
      }

      const { stdout, stderr } = await execFileAsync(tdPath, args, {
        cwd: projectPath,
        timeout: 15_000,
      });

      const output = (stdout || stderr || '').trim();
      return { success: true, message: output || `Rejected ${taskId}` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const stderr = (err as any)?.stderr?.trim();
      return {
        success: false,
        message: stderr || message,
        error: message,
      };
    }
  }
}
