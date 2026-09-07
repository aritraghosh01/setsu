import { stableId } from '@setsu-ai/core';
import type { Db } from '@setsu-ai/storage';

/** Beta-Bernoulli acceptance adaptation, spec section 36. */
export interface RecommendationState {
  id: string;
  type: string;
  target: string | null;
  status: string;
  alpha: number;
  beta: number;
  expectedAcceptance: number;
}

export function ensureRecommendation(db: Db, type: string, target?: string): string {
  const id = stableId('rec', type, target ?? '');
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO recommendations (id, type, target, status, alpha, beta, created_at, updated_at)
     VALUES (?, ?, ?, 'open', 1, 1, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
    id,
    type,
    target ?? null,
    now,
    now,
  );
  return id;
}

export function recordAcceptance(db: Db, id: string, accepted: boolean): void {
  db.run(
    accepted
      ? `UPDATE recommendations SET alpha = alpha + 1, updated_at = ? WHERE id = ?`
      : `UPDATE recommendations SET beta = beta + 1, updated_at = ? WHERE id = ?`,
    new Date().toISOString(),
    id,
  );
}

export function recommendationStates(db: Db): RecommendationState[] {
  return db
    .all<{ id: string; type: string; target: string | null; status: string; alpha: number; beta: number }>(
      `SELECT id, type, target, status, alpha, beta FROM recommendations ORDER BY updated_at DESC`,
    )
    .map((row) => ({
      ...row,
      expectedAcceptance: row.alpha / (row.alpha + row.beta),
    }));
}

/**
 * Should we keep surfacing this recommendation type? Quiet down when the
 * user keeps rejecting it (spec section 75: learning gets quieter).
 */
export function shouldSurface(state: RecommendationState, threshold = 0.25): boolean {
  return state.expectedAcceptance >= threshold;
}
