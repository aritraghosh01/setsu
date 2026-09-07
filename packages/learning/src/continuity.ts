import type { TaskFingerprint } from './fingerprint.js';

/** Session continuity, spec section 37. Advisory only — never auto-executed. */

function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) if (setB.has(item)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

export interface ContinuityResult {
  score: number;
  recommendation: 'continue' | 'compact' | 'new_session';
  parts: Record<string, number>;
}

export function continuity(previous: TaskFingerprint, current: TaskFingerprint): ContinuityResult {
  const pathSimilarity = jaccard(previous.paths, current.paths);
  const symbolSimilarity = jaccard(previous.symbols, current.symbols);
  const communitySimilarity = jaccard(previous.extensions, current.extensions);
  const taskClassSimilarity = previous.taskClass === current.taskClass ? 1 : 0;
  const toolSimilarity = jaccard(previous.toolCategories, current.toolCategories);
  const gapMinutes = Math.abs(Date.parse(current.startedAt) - Date.parse(previous.startedAt)) / 60_000;
  const temporalContinuity = Math.max(0, 1 - gapMinutes / 240); // fades over 4 hours

  // Spec section 37 baseline weights.
  const score =
    0.25 * pathSimilarity +
    0.2 * symbolSimilarity +
    0.2 * communitySimilarity +
    0.15 * taskClassSimilarity +
    0.1 * toolSimilarity +
    0.1 * temporalContinuity;

  const recommendation = score >= 0.6 ? 'continue' : score >= 0.3 ? 'compact' : 'new_session';
  return {
    score,
    recommendation,
    parts: {
      pathSimilarity,
      symbolSimilarity,
      communitySimilarity,
      taskClassSimilarity,
      toolSimilarity,
      temporalContinuity,
    },
  };
}
