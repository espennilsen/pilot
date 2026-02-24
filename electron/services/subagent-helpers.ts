import type { AgentSession } from '@mariozechner/pi-coding-agent';
import type {
  SubagentRecord,
  SubagentResult,
  SubagentPoolResult,
} from '../../shared/types';

// ─── Internal types ───────────────────────────────────────────────

export interface SubagentInternal extends SubagentRecord {
  session: AgentSession | null;
  unsub: () => void;
}

export interface PoolInternal {
  id: string;
  parentTabId: string;
  subagentIds: string[];
  total: number;
  completed: number;
  failures: number;
  resolveAll?: (results: SubagentResult[]) => void;
  results: Map<string, SubagentResult>;
}

// ─── Default limits ───────────────────────────────────────────────

export const DEFAULT_MAX_PER_TAB = 10;
export const DEFAULT_MAX_CONCURRENT = 4;
export const DEFAULT_MAX_TURNS = 20;
export const DEFAULT_MAX_TOKENS = 200000;
export const DEFAULT_TIMEOUT = 300000; // 5 minutes

// ─── Helper functions ─────────────────────────────────────────────

export function buildPoolResult(pool: PoolInternal): SubagentPoolResult {
  const results: SubagentResult[] = [];
  const failures: SubagentResult[] = [];
  for (const subId of pool.subagentIds) {
    const r = pool.results.get(subId);
    if (r) {
      if (r.error) failures.push(r);
      else results.push(r);
    }
  }
  return { poolId: pool.id, results, failures };
}
