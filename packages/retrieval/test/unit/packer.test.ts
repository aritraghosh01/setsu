import { describe, it, expect } from 'vitest';
import { packEvidence } from '@setsu-ai/retrieval';
import type { ContextEvidence } from '@setsu-ai/core';

function ev(id: string, tokens: number, relevance: number, extra: Partial<ContextEvidence> = {}): ContextEvidence {
  return {
    id,
    kind: 'symbol_signature',
    text: 'x'.repeat(tokens * 4),
    estimatedTokens: tokens,
    relevance,
    confidence: 1,
    provenance: 'ast',
    ...extra,
  };
}

describe('packEvidence', () => {
  it('never exceeds the budget', () => {
    const evidence = Array.from({ length: 30 }, (_, i) => ev(`e${i}`, 100, Math.random() + 0.1));
    const result = packEvidence({ evidence, budget: 550 });
    expect(result.usedTokens).toBeLessThanOrEqual(550);
    expect(result.packed.length).toBeLessThanOrEqual(5);
  });

  it('always includes mandatory items', () => {
    const evidence = [ev('big-mandatory', 400, 0.1), ...Array.from({ length: 10 }, (_, i) => ev(`e${i}`, 50, 1))];
    const result = packEvidence({ evidence, mandatoryIds: new Set(['big-mandatory']), budget: 500 });
    expect(result.packed.map((e) => e.id)).toContain('big-mandatory');
    expect(result.usedTokens).toBeLessThanOrEqual(500);
  });

  it('prefers higher value/cost ratio', () => {
    const evidence = [ev('cheap-good', 10, 0.9), ev('expensive-good', 500, 1), ev('cheap-bad', 10, 0.05)];
    const result = packEvidence({ evidence, budget: 30 });
    expect(result.packed[0]!.id).toBe('cheap-good');
    expect(result.packed.map((e) => e.id)).not.toContain('expensive-good');
  });

  it('discounts overlapping spans of the same file (novelty)', () => {
    const evidence = [
      ev('a', 50, 0.9, { file: 'f.ts', startLine: 1, endLine: 40 }),
      ev('overlap', 50, 0.85, { file: 'f.ts', startLine: 10, endLine: 30 }),
      ev('fresh', 50, 0.5, { file: 'g.ts', startLine: 1, endLine: 40 }),
    ];
    const result = packEvidence({ evidence, budget: 100 });
    const ids = result.packed.map((e) => e.id);
    expect(ids).toContain('a');
    expect(ids).toContain('fresh');
    expect(ids).not.toContain('overlap');
  });

  it('reports omitted count', () => {
    const evidence = Array.from({ length: 5 }, (_, i) => ev(`e${i}`, 100, 1));
    const result = packEvidence({ evidence, budget: 250 });
    expect(result.packed.length + result.omittedCount).toBe(5);
  });
});
