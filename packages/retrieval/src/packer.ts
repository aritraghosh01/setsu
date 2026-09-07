import type { ContextEvidence } from '@setsu-ai/core';

/**
 * Greedy value/cost budget packer with mandatory inclusions (spec section 9).
 * value(i) = relevance * confidence * novelty; cost(i) = estimatedTokens.
 */
export interface PackInput {
  evidence: ContextEvidence[];
  /** Evidence ids that must be included regardless of ratio (spec section 9). */
  mandatoryIds?: ReadonlySet<string>;
  budget: number;
}

export interface PackResult {
  packed: ContextEvidence[];
  usedTokens: number;
  omittedCount: number;
}

function noveltyAgainst(picked: ContextEvidence[], candidate: ContextEvidence): number {
  // Evidence overlapping an already-picked span of the same file adds little.
  for (const p of picked) {
    if (
      p.file !== undefined &&
      p.file === candidate.file &&
      p.startLine !== undefined &&
      candidate.startLine !== undefined &&
      p.endLine !== undefined &&
      candidate.endLine !== undefined &&
      candidate.startLine <= p.endLine &&
      candidate.endLine >= p.startLine
    ) {
      return 0.3;
    }
  }
  return 1;
}

export function packEvidence(input: PackInput): PackResult {
  const mandatoryIds = input.mandatoryIds ?? new Set<string>();
  const packed: ContextEvidence[] = [];
  let used = 0;

  const mandatory = input.evidence.filter((e) => mandatoryIds.has(e.id));
  const optional = input.evidence.filter((e) => !mandatoryIds.has(e.id));

  // Mandatory items always go in, cheapest first so as many fit as possible.
  mandatory.sort((a, b) => a.estimatedTokens - b.estimatedTokens);
  for (const item of mandatory) {
    if (used + item.estimatedTokens > input.budget && packed.length > 0) continue;
    packed.push(item);
    used += item.estimatedTokens;
  }

  const remaining = [...optional];
  while (remaining.length > 0) {
    let bestIndex = -1;
    let bestRatio = -1;
    for (let i = 0; i < remaining.length; i += 1) {
      const item = remaining[i]!;
      if (used + item.estimatedTokens > input.budget) continue;
      const value = item.relevance * item.confidence * noveltyAgainst(packed, item);
      const ratio = value / Math.max(item.estimatedTokens, 1);
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestIndex = i;
      }
    }
    if (bestIndex === -1) break;
    const [item] = remaining.splice(bestIndex, 1);
    packed.push(item!);
    used += item!.estimatedTokens;
  }

  return {
    packed,
    usedTokens: used,
    omittedCount: input.evidence.length - packed.length,
  };
}
