import { isCompanionMode } from './ipc-client';

/**
 * Build a URL to display a local attachment file.
 * - Electron: uses the `pilot-attachment://` custom protocol
 * - Companion (browser): uses the `/api/attachments?path=` HTTP endpoint
 */
export function attachmentUrl(absolutePath: string): string {
  if (isCompanionMode()) {
    return `/api/attachments?path=${encodeURIComponent(absolutePath)}`;
  }
  return `pilot-attachment://${absolutePath}`;
}
