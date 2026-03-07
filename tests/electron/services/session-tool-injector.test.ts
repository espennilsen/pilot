import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateSessionInternals,
  injectTools,
  ejectTools,
  hasTools,
} from '../../../electron/services/session-tool-injector';
import type { AgentSession, ToolDefinition } from '@mariozechner/pi-coding-agent';

// ─── Helpers ──────────────────────────────────────────────────────

/** Create a minimal ToolDefinition stub. */
function makeTool(name: string): ToolDefinition {
  return {
    name,
    label: name,
    description: `${name} tool`,
    parameters: { type: 'object', properties: {} } as any,
    execute: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }),
  };
}

/** Build a fake AgentSession with the private internals that the injector expects. */
function makeFakeSession(customTools: ToolDefinition[] = []): AgentSession {
  const activeToolNames = new Set<string>();
  const session = {
    _customTools: customTools,
    _refreshToolRegistry: vi.fn(() => {
      // Simulate what the real SDK does: all custom tools become active
      activeToolNames.clear();
      for (const t of (session as any)._customTools) {
        activeToolNames.add(t.name);
      }
    }),
    getActiveToolNames: () => [...activeToolNames],
    setActiveToolsByName: vi.fn((names: string[]) => {
      activeToolNames.clear();
      for (const n of names) activeToolNames.add(n);
    }),
  } as unknown as AgentSession;

  // Seed active tools from initial custom tools
  for (const t of customTools) activeToolNames.add(t.name);

  return session;
}

// ─── Tests ────────────────────────────────────────────────────────

describe('SessionToolInjector', () => {
  // ── validateSessionInternals ──

  describe('validateSessionInternals', () => {
    it('succeeds for a valid session', () => {
      const session = makeFakeSession();
      const result = validateSessionInternals(session);
      expect(result.ok).toBe(true);
    });

    it('fails when _customTools is missing', () => {
      const session = { _refreshToolRegistry: vi.fn() } as unknown as AgentSession;
      const result = validateSessionInternals(session);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain('_customTools is not an array');
      }
    });

    it('fails when _customTools is not an array', () => {
      const session = {
        _customTools: 'not-an-array',
        _refreshToolRegistry: vi.fn(),
      } as unknown as AgentSession;
      const result = validateSessionInternals(session);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain('_customTools is not an array');
      }
    });

    it('fails when _refreshToolRegistry is missing', () => {
      const session = { _customTools: [] } as unknown as AgentSession;
      const result = validateSessionInternals(session);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain('_refreshToolRegistry is not a function');
      }
    });

    it('fails when _refreshToolRegistry is not a function', () => {
      const session = {
        _customTools: [],
        _refreshToolRegistry: 'not-a-function',
      } as unknown as AgentSession;
      const result = validateSessionInternals(session);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain('_refreshToolRegistry is not a function');
      }
    });

    it('includes SDK version in error messages', () => {
      const session = {} as unknown as AgentSession;
      const result = validateSessionInternals(session);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        // Should mention the verified version range
        expect(result.message).toMatch(/0\.5[0-9]/);
      }
    });
  });

  // ── injectTools ──

  describe('injectTools', () => {
    it('adds tools to an empty session', () => {
      const session = makeFakeSession();
      const tools = [makeTool('desktop_screenshot'), makeTool('desktop_click')];

      const result = injectTools(session, tools);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.added).toBe(2);
        expect(result.removed).toBe(0);
      }
      expect((session as any)._customTools).toHaveLength(2);
      expect((session as any)._refreshToolRegistry).toHaveBeenCalledTimes(1);
    });

    it('adds tools alongside existing custom tools', () => {
      const existing = makeTool('web_fetch');
      const session = makeFakeSession([existing]);

      const result = injectTools(session, [makeTool('desktop_screenshot')]);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.added).toBe(1);
      expect((session as any)._customTools).toHaveLength(2);
      expect((session as any)._customTools[0].name).toBe('web_fetch');
      expect((session as any)._customTools[1].name).toBe('desktop_screenshot');
    });

    it('skips tools that already exist (no duplicates)', () => {
      const session = makeFakeSession([makeTool('desktop_screenshot')]);

      const result = injectTools(session, [makeTool('desktop_screenshot'), makeTool('desktop_click')]);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.added).toBe(1);
      expect((session as any)._customTools).toHaveLength(2);
    });

    it('does nothing when all tools already exist', () => {
      const session = makeFakeSession([makeTool('desktop_screenshot')]);

      const result = injectTools(session, [makeTool('desktop_screenshot')]);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.added).toBe(0);
      expect((session as any)._refreshToolRegistry).not.toHaveBeenCalled();
    });

    it('does nothing for empty tools array', () => {
      const session = makeFakeSession();

      const result = injectTools(session, []);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.added).toBe(0);
      expect((session as any)._refreshToolRegistry).not.toHaveBeenCalled();
    });

    it('returns error when SDK internals are invalid', () => {
      const session = {} as unknown as AgentSession;
      const result = injectTools(session, [makeTool('foo')]);
      expect(result.ok).toBe(false);
    });
  });

  // ── ejectTools ──

  describe('ejectTools', () => {
    it('removes matching tools by prefix', () => {
      const session = makeFakeSession([
        makeTool('web_fetch'),
        makeTool('desktop_screenshot'),
        makeTool('desktop_click'),
        makeTool('desktop_type'),
      ]);

      const result = ejectTools(session, name => name.startsWith('desktop_'));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.removed).toBe(3);
        expect(result.added).toBe(0);
      }
      expect((session as any)._customTools).toHaveLength(1);
      expect((session as any)._customTools[0].name).toBe('web_fetch');
      expect((session as any)._refreshToolRegistry).toHaveBeenCalledTimes(1);
    });

    it('removes tools by exact name', () => {
      const session = makeFakeSession([makeTool('a'), makeTool('b'), makeTool('c')]);

      const result = ejectTools(session, name => name === 'b');

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.removed).toBe(1);
      expect((session as any)._customTools.map((t: any) => t.name)).toEqual(['a', 'c']);
    });

    it('does nothing when no tools match', () => {
      const session = makeFakeSession([makeTool('web_fetch')]);

      const result = ejectTools(session, name => name.startsWith('desktop_'));

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.removed).toBe(0);
      expect((session as any)._refreshToolRegistry).not.toHaveBeenCalled();
    });

    it('can remove all tools', () => {
      const session = makeFakeSession([makeTool('a'), makeTool('b')]);

      const result = ejectTools(session, () => true);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.removed).toBe(2);
      expect((session as any)._customTools).toHaveLength(0);
    });

    it('returns error when SDK internals are invalid', () => {
      const session = {} as unknown as AgentSession;
      const result = ejectTools(session, () => true);
      expect(result.ok).toBe(false);
    });
  });

  // ── hasTools ──

  describe('hasTools', () => {
    it('returns true when matching tools are active', () => {
      const session = makeFakeSession([makeTool('desktop_screenshot')]);
      expect(hasTools(session, name => name.startsWith('desktop_'))).toBe(true);
    });

    it('returns false when no matching tools are active', () => {
      const session = makeFakeSession([makeTool('web_fetch')]);
      expect(hasTools(session, name => name.startsWith('desktop_'))).toBe(false);
    });

    it('returns false for empty session', () => {
      const session = makeFakeSession();
      expect(hasTools(session, () => true)).toBe(false);
    });
  });

  // ── inject → eject round-trip ──

  describe('inject + eject round-trip', () => {
    it('restores original state after inject then eject', () => {
      const originalTool = makeTool('web_fetch');
      const session = makeFakeSession([originalTool]);

      injectTools(session, [makeTool('desktop_screenshot'), makeTool('desktop_click')]);
      expect((session as any)._customTools).toHaveLength(3);

      ejectTools(session, name => name.startsWith('desktop_'));
      expect((session as any)._customTools).toHaveLength(1);
      expect((session as any)._customTools[0]).toBe(originalTool);
    });

    it('can inject again after ejecting', () => {
      const session = makeFakeSession();

      injectTools(session, [makeTool('desktop_screenshot')]);
      ejectTools(session, name => name.startsWith('desktop_'));
      const result = injectTools(session, [makeTool('desktop_screenshot')]);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.added).toBe(1);
      expect((session as any)._customTools).toHaveLength(1);
    });
  });
});
