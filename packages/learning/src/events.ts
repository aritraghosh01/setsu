import { stableId } from '@setsu-ai/core';
import type { Db } from '@setsu-ai/storage';
import type { TaskFingerprint } from './fingerprint.js';

export interface EventInput {
  type: string;
  repoId?: string;
  fingerprint?: TaskFingerprint;
  /** JSON-safe payload; must never contain raw prompts or source text. */
  payload?: Record<string, unknown>;
}

export function recordEvent(db: Db, input: EventInput): string {
  const id = stableId('evt', input.type, String(Date.now()), String(Math.floor(Math.random() * 1e9)));
  db.run(
    `INSERT INTO events (id, ts, type, repo_id, task_fingerprint, payload) VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    new Date().toISOString(),
    input.type,
    input.repoId ?? null,
    input.fingerprint ? JSON.stringify(input.fingerprint) : null,
    input.payload ? JSON.stringify(input.payload) : null,
  );
  return id;
}

/** Delete events older than retentionDays (spec section 98). */
export function pruneEvents(db: Db, retentionDays: number): number {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
  const result = db.run(`DELETE FROM events WHERE ts < ?`, cutoff);
  return Number(result.changes);
}

export interface RetrievalOutcome {
  taskClass: string;
  strategy: string;
  usedTokens: number;
  budget: number;
  /** follow-up full-file reads reported by the agent = under-retrieval signal */
  fallbackReads?: number;
  success?: boolean;
}

export function recordRetrievalOutcome(db: Db, repoId: string, outcome: RetrievalOutcome): void {
  recordEvent(db, {
    type: 'retrieval_outcome',
    repoId,
    payload: { ...outcome },
  });
}
