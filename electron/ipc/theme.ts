/**
 * @file Theme IPC handlers — CRUD for custom themes.
 */

import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type { ThemeService } from '../services/theme-service';
import type { CustomTheme } from '../../shared/types';

export function registerThemeIpc(themeService: ThemeService): void {

  ipcMain.handle(IPC.THEME_LIST, async () => {
    return themeService.list();
  });

  ipcMain.handle(IPC.THEME_GET, async (_event, slug: string) => {
    if (typeof slug !== 'string') throw new Error('slug must be a string');
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('Invalid theme slug');
    return themeService.get(slug);
  });

  ipcMain.handle(IPC.THEME_SAVE, async (_event, theme: CustomTheme) => {
    if (!theme || typeof theme !== 'object') throw new Error('Invalid theme object');
    themeService.save(theme);
  });

  ipcMain.handle(IPC.THEME_DELETE, async (_event, slug: string) => {
    if (typeof slug !== 'string') throw new Error('slug must be a string');
    themeService.delete(slug);
  });

  ipcMain.handle(IPC.THEME_IMPORT, async () => {
    return themeService.import();
  });

  ipcMain.handle(IPC.THEME_EXPORT, async (_event, slug: string) => {
    if (typeof slug !== 'string') throw new Error('slug must be a string');
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('Invalid theme slug');
    await themeService.export(slug);
  });
}
