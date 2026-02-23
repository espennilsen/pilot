import { ipcMain } from 'electron';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { IPC } from '../../shared/ipc';

/**
 * Register IPC handler for saving image attachments to disk.
 * Images are saved to <projectPath>/.pilot/attachments/ so the agent's
 * read tool can access them.
 */
export function registerAttachmentIpc(): void {
  ipcMain.handle(
    IPC.ATTACHMENT_SAVE,
    async (_event, projectPath: string, fileName: string, base64Data: string): Promise<string> => {
      const dir = join(projectPath, '.pilot', 'attachments');
      await mkdir(dir, { recursive: true });

      // Deduplicate with timestamp prefix
      const ts = Date.now();
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = join(dir, `${ts}-${safeName}`);

      const buffer = Buffer.from(base64Data, 'base64');
      await writeFile(filePath, buffer);

      return filePath;
    }
  );
}
