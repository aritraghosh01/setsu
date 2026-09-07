import { describe, it, expect } from 'vitest';
import { contextTax, findDuplicates, computeEfficiencyScore } from '@setsu-ai/agents';
import type { InstructionFile } from '@setsu-ai/agents';

function instruction(path: string, mode: InstructionFile['currentMode'], tokens: number, hash = path): InstructionFile {
  return {
    agent: 'test',
    path,
    contentHash: hash,
    estimatedTokens: tokens,
    currentMode: mode,
  };
}

describe('contextTax', () => {
  it('always-on instructions tax at full weight, manual barely', () => {
    const tax = contextTax([
      instruction('CLAUDE.md', 'always', 1000),
      instruction('manual.md', 'manual', 1000),
    ]);
    expect(tax[0]!.effectiveTokens).toBe(1000);
    expect(tax[1]!.effectiveTokens).toBe(50);
  });
});

describe('findDuplicates', () => {
  it('detects identical files and shared long lines', () => {
    const a = instruction('a.md', 'always', 100, 'same-hash');
    const b = instruction('b.md', 'always', 100, 'same-hash');
    const c = instruction('c.md', 'always', 100, 'other');
    const contents = new Map([
      ['a.md', 'Run `npm test` before every commit. Use conventional commits.\n'],
      ['b.md', 'Run `npm test` before every commit. Use conventional commits.\n'],
      ['c.md', 'Run `npm test` before every commit. Use conventional commits.\nOther stuff.\n'],
    ]);
    const dupes = findDuplicates([a, b, c], contents);
    expect(dupes.some((d) => d.sample === '(entire file duplicated)')).toBe(true);
    const lineDupe = dupes.find((d) => d.sample.startsWith('Run `npm test`'));
    expect(lineDupe).toBeDefined();
    expect(lineDupe!.files).toEqual(['a.md', 'b.md', 'c.md']);
  });
});

describe('computeEfficiencyScore', () => {
  const base = {
    alwaysTokens: 1000,
    totalInstructionTokens: 2000,
    scopedTokens: 1000,
    duplicateTokens: 0,
    graphFreshness: 1,
    graphReady: true,
    mcpServerCount: 1,
  };

  it('healthy setup scores high', () => {
    const { total } = computeEfficiencyScore(base);
    expect(total).toBeGreaterThan(80);
  });

  it('reweights unavailable metrics instead of zeroing them (spec s79)', () => {
    const score = computeEfficiencyScore(base);
    const unavailable = score.components.filter((c) => c.score === undefined);
    expect(unavailable.length).toBeGreaterThan(0);
    // If unavailable metrics counted as 0, a perfect setup could never
    // exceed the available weight sum (~60).
    expect(score.total).toBeGreaterThan(60);
  });

  it('heavy always-on context tanks the persistent component', () => {
    const bloated = computeEfficiencyScore({ ...base, alwaysTokens: 25_000, totalInstructionTokens: 26_000, scopedTokens: 1000 });
    const persistent = bloated.components.find((c) => c.name === 'persistent context')!;
    expect(persistent.score).toBe(0);
    expect(bloated.total).toBeLessThan(computeEfficiencyScore(base).total);
  });

  it('missing graph zeroes freshness (that metric IS available: it is bad)', () => {
    const noGraph = computeEfficiencyScore({ ...base, graphReady: false, graphFreshness: undefined });
    const freshness = noGraph.components.find((c) => c.name === 'graph freshness')!;
    expect(freshness.score).toBe(0);
  });

  it('duplication reduces the score', () => {
    const dupes = computeEfficiencyScore({ ...base, duplicateTokens: 600 });
    expect(dupes.total).toBeLessThan(computeEfficiencyScore(base).total);
  });
});
