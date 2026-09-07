import type { Db } from '@setsu-ai/storage';

/**
 * v1 strategy learning, spec section 35: weighted historical scores per task
 * class. Explicitly not a bandit; that is v0.2+ (spec section 104).
 */
export interface StrategyScore {
  strategy: string;
  samples: number;
  score: number;
}

interface OutcomeRow {
  payload: string;
  ts: string;
}

export function strategyScores(db: Db, taskClass: string): StrategyScore[] {
  const rows = db.all<OutcomeRow>(
    `SELECT payload, ts FROM events WHERE type = 'retrieval_outcome' ORDER BY ts DESC LIMIT 500`,
  );
  const byStrategy = new Map<string, { weight: number; value: number; samples: number }>();
  const now = Date.now();
  for (const row of rows) {
    let payload: { taskClass?: string; strategy?: string; success?: boolean; fallbackReads?: number; usedTokens?: number; budget?: number };
    try {
      payload = JSON.parse(row.payload);
    } catch {
      continue;
    }
    if (payload.taskClass !== taskClass || !payload.strategy) continue;
    // Outcome value: success (or absence of fallback reads) discounted by
    // budget overuse; recency-weighted with a 30-day half-life.
    const success = payload.success ?? (payload.fallbackReads ?? 0) === 0;
    const efficiency =
      payload.budget && payload.usedTokens ? Math.min(1, payload.budget / Math.max(payload.usedTokens, 1)) : 1;
    const value = (success ? 1 : 0) * 0.8 + efficiency * 0.2;
    const ageDays = (now - Date.parse(row.ts)) / 86_400_000;
    const weight = Math.pow(0.5, ageDays / 30);
    const entry = byStrategy.get(payload.strategy) ?? { weight: 0, value: 0, samples: 0 };
    entry.weight += weight;
    entry.value += value * weight;
    entry.samples += 1;
    byStrategy.set(payload.strategy, entry);
  }
  return [...byStrategy.entries()]
    .map(([strategy, entry]) => ({
      strategy,
      samples: entry.samples,
      score: entry.weight > 0 ? entry.value / entry.weight : 0,
    }))
    .sort((a, b) => b.score - a.score);
}

/** Best-known strategy for a task class, if we have enough signal. */
export function recommendStrategy(db: Db, taskClass: string, minSamples = 5): string | undefined {
  const scores = strategyScores(db, taskClass);
  const best = scores[0];
  if (!best || best.samples < minSamples) return undefined;
  return best.strategy;
}
