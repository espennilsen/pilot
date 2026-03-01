/**
 * @file Tests for the Desktop Zustand store.
 *
 * The store calls `invoke()` from ipc-client.ts which requires `window.api`.
 * We mock `window.api.invoke` to test store logic in isolation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DesktopState } from '../../../shared/types';

// ── Mock window.api before importing the store ─────────────────────
const mockInvoke = vi.fn();

// @ts-ignore — minimal window.api mock for testing
globalThis.window = {
  api: {
    invoke: mockInvoke,
    on: vi.fn(() => () => {}),
    send: vi.fn(),
  },
} as any;

// Import after mock is in place
const { useDesktopStore } = await import('../../../src/stores/desktop-store');

function makeDesktopState(overrides: Partial<DesktopState> = {}): DesktopState {
  return {
    containerId: 'abc123',
    wsPort: 6080,
    vncPort: 5900,
    status: 'running',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('useDesktopStore', () => {
  beforeEach(() => {
    useDesktopStore.getState().reset();
    mockInvoke.mockReset();
  });

  // ── handleEvent ───────────────────────────────────────────────

  describe('handleEvent', () => {
    it('adds desktop state for a project', () => {
      const state = makeDesktopState();
      useDesktopStore.getState().handleEvent({
        projectPath: '/project/a',
        ...state,
      });

      expect(useDesktopStore.getState().stateByProject['/project/a']).toEqual(
        expect.objectContaining({ containerId: 'abc123', status: 'running' }),
      );
    });

    it('updates existing desktop state', () => {
      useDesktopStore.getState().handleEvent({
        projectPath: '/project/a',
        ...makeDesktopState({ status: 'starting' }),
      });
      useDesktopStore.getState().handleEvent({
        projectPath: '/project/a',
        status: 'running',
      });

      expect(useDesktopStore.getState().stateByProject['/project/a']?.status).toBe('running');
    });

    it('removes state when status is stopped', () => {
      useDesktopStore.getState().handleEvent({
        projectPath: '/project/a',
        ...makeDesktopState(),
      });
      useDesktopStore.getState().handleEvent({
        projectPath: '/project/a',
        status: 'stopped',
      });

      expect(useDesktopStore.getState().stateByProject['/project/a']).toBeUndefined();
    });

    it('ignores events without projectPath', () => {
      useDesktopStore.getState().handleEvent({
        projectPath: '',
        status: 'running',
      });

      expect(Object.keys(useDesktopStore.getState().stateByProject)).toHaveLength(0);
    });

    it('keeps other projects untouched when updating one', () => {
      useDesktopStore.getState().handleEvent({
        projectPath: '/project/a',
        ...makeDesktopState({ containerId: 'aaa' }),
      });
      useDesktopStore.getState().handleEvent({
        projectPath: '/project/b',
        ...makeDesktopState({ containerId: 'bbb' }),
      });
      useDesktopStore.getState().handleEvent({
        projectPath: '/project/a',
        status: 'stopped',
      });

      expect(useDesktopStore.getState().stateByProject['/project/a']).toBeUndefined();
      expect(useDesktopStore.getState().stateByProject['/project/b']?.containerId).toBe('bbb');
    });
  });

  // ── Selectors ─────────────────────────────────────────────────

  describe('selectors', () => {
    it('getDesktopState returns null for unknown project', () => {
      expect(useDesktopStore.getState().getDesktopState('/unknown')).toBeNull();
    });

    it('getDesktopState returns state for known project', () => {
      useDesktopStore.getState().handleEvent({
        projectPath: '/project/a',
        ...makeDesktopState(),
      });
      const state = useDesktopStore.getState().getDesktopState('/project/a');
      expect(state?.status).toBe('running');
    });

    it('isToolsEnabled defaults to false', () => {
      expect(useDesktopStore.getState().isToolsEnabled('/unknown')).toBe(false);
    });

    it('isProjectLoading defaults to false', () => {
      expect(useDesktopStore.getState().isProjectLoading('/unknown')).toBe(false);
    });
  });

  // ── checkDesktopAvailable ─────────────────────────────────────

  describe('checkDesktopAvailable', () => {
    it('sets isDesktopAvailable to true when Docker is available', async () => {
      mockInvoke.mockResolvedValue({ available: true });

      const result = await useDesktopStore.getState().checkDesktopAvailable();

      expect(result).toBe(true);
      expect(useDesktopStore.getState().isDesktopAvailable).toBe(true);
      expect(useDesktopStore.getState().desktopUnavailableMessage).toBeNull();
    });

    it('sets isDesktopAvailable to false with message when not available', async () => {
      mockInvoke.mockResolvedValue({
        available: false,
        message: 'Docker is not running',
      });

      const result = await useDesktopStore.getState().checkDesktopAvailable();

      expect(result).toBe(false);
      expect(useDesktopStore.getState().isDesktopAvailable).toBe(false);
      expect(useDesktopStore.getState().desktopUnavailableMessage).toBe('Docker is not running');
    });

    it('sets isDesktopAvailable to false on invoke error', async () => {
      mockInvoke.mockRejectedValue(new Error('IPC failed'));

      const result = await useDesktopStore.getState().checkDesktopAvailable();

      expect(result).toBe(false);
      expect(useDesktopStore.getState().isDesktopAvailable).toBe(false);
    });
  });

  // ── startDesktop ──────────────────────────────────────────────

  describe('startDesktop', () => {
    it('sets loading then stores result on success', async () => {
      const desktopState = makeDesktopState();
      mockInvoke.mockResolvedValue(desktopState);

      await useDesktopStore.getState().startDesktop('/project/a');

      expect(useDesktopStore.getState().stateByProject['/project/a']).toEqual(desktopState);
      expect(useDesktopStore.getState().loadingByProject['/project/a']).toBe(false);
      expect(useDesktopStore.getState().error).toBeNull();
    });

    it('sets error on failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Docker failed'));

      await useDesktopStore.getState().startDesktop('/project/a');

      expect(useDesktopStore.getState().stateByProject['/project/a']).toBeUndefined();
      expect(useDesktopStore.getState().loadingByProject['/project/a']).toBe(false);
      expect(useDesktopStore.getState().error).toContain('Docker failed');
    });
  });

  // ── stopDesktop ───────────────────────────────────────────────

  describe('stopDesktop', () => {
    it('removes project state on success', async () => {
      // Seed state
      useDesktopStore.getState().handleEvent({
        projectPath: '/project/a',
        ...makeDesktopState(),
      });
      mockInvoke.mockResolvedValue(undefined);

      await useDesktopStore.getState().stopDesktop('/project/a');

      expect(useDesktopStore.getState().stateByProject['/project/a']).toBeUndefined();
      expect(useDesktopStore.getState().loadingByProject['/project/a']).toBe(false);
    });

    it('sets error on failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Stop failed'));

      await useDesktopStore.getState().stopDesktop('/project/a');

      expect(useDesktopStore.getState().loadingByProject['/project/a']).toBe(false);
      expect(useDesktopStore.getState().error).toContain('Stop failed');
    });
  });

  // ── loadStatus ────────────────────────────────────────────────

  describe('loadStatus', () => {
    it('stores status when desktop exists', async () => {
      const desktopState = makeDesktopState();
      mockInvoke.mockResolvedValue(desktopState);

      await useDesktopStore.getState().loadStatus('/project/a');

      expect(useDesktopStore.getState().stateByProject['/project/a']).toEqual(desktopState);
    });

    it('removes stale state when desktop returns null', async () => {
      // Seed stale state
      useDesktopStore.getState().handleEvent({
        projectPath: '/project/a',
        ...makeDesktopState(),
      });
      mockInvoke.mockResolvedValue(null);

      await useDesktopStore.getState().loadStatus('/project/a');

      expect(useDesktopStore.getState().stateByProject['/project/a']).toBeUndefined();
    });

    it('fails silently on error', async () => {
      mockInvoke.mockRejectedValue(new Error('Network error'));

      // Should not throw
      await useDesktopStore.getState().loadStatus('/project/a');
    });
  });

  // ── setToolsEnabled ───────────────────────────────────────────

  describe('setToolsEnabled', () => {
    it('stores tools enabled state on success', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await useDesktopStore.getState().setToolsEnabled('/project/a', true);

      expect(useDesktopStore.getState().toolsEnabledByProject['/project/a']).toBe(true);
    });

    it('can toggle tools off', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await useDesktopStore.getState().setToolsEnabled('/project/a', true);
      await useDesktopStore.getState().setToolsEnabled('/project/a', false);

      expect(useDesktopStore.getState().toolsEnabledByProject['/project/a']).toBe(false);
    });

    it('sets error on failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Settings failed'));

      await useDesktopStore.getState().setToolsEnabled('/project/a', true);

      expect(useDesktopStore.getState().error).toContain('Settings failed');
    });
  });

  // ── loadToolsEnabled ──────────────────────────────────────────

  describe('loadToolsEnabled', () => {
    it('stores enabled state from project settings', async () => {
      mockInvoke.mockResolvedValue(true);

      await useDesktopStore.getState().loadToolsEnabled('/project/a');

      expect(useDesktopStore.getState().toolsEnabledByProject['/project/a']).toBe(true);
    });

    it('removes stale entry when setting returns null', async () => {
      // Seed a stale entry
      mockInvoke.mockResolvedValue(undefined);
      await useDesktopStore.getState().setToolsEnabled('/project/a', true);

      mockInvoke.mockResolvedValue(null);
      await useDesktopStore.getState().loadToolsEnabled('/project/a');

      expect(useDesktopStore.getState().toolsEnabledByProject['/project/a']).toBeUndefined();
    });

    it('fails silently on error', async () => {
      mockInvoke.mockRejectedValue(new Error('Load failed'));

      // Should not throw
      await useDesktopStore.getState().loadToolsEnabled('/project/a');
    });
  });

  // ── reset ─────────────────────────────────────────────────────

  describe('reset', () => {
    it('clears all state', async () => {
      // Seed state
      useDesktopStore.getState().handleEvent({
        projectPath: '/project/a',
        ...makeDesktopState(),
      });
      mockInvoke.mockResolvedValue({ available: true });
      await useDesktopStore.getState().checkDesktopAvailable();

      useDesktopStore.getState().reset();

      const state = useDesktopStore.getState();
      expect(state.stateByProject).toEqual({});
      expect(state.toolsEnabledByProject).toEqual({});
      expect(state.isDesktopAvailable).toBeNull();
      expect(state.desktopUnavailableMessage).toBeNull();
      expect(state.loadingByProject).toEqual({});
      expect(state.error).toBeNull();
    });
  });
});
