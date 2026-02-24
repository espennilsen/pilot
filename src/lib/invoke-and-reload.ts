import { invoke } from './ipc-client';

/**
 * Utility to invoke an IPC channel and reload state after success.
 * Handles errors with console warning.
 *
 * @param channel - IPC channel name
 * @param args - Arguments to pass to the IPC handler
 * @param reloadFn - Function to call after successful invoke
 * @returns Result from the IPC call
 */
export async function invokeAndReload<T = unknown>(
  channel: string,
  args: unknown[],
  reloadFn: () => Promise<void>
): Promise<T | null> {
  try {
    const result = await invoke(channel, ...args) as T;
    await reloadFn();
    return result;
  } catch (err) {
    console.warn(`[invokeAndReload] ${channel} failed:`, err);
    return null;
  }
}
