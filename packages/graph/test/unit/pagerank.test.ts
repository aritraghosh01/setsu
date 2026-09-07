import { describe, it, expect } from 'vitest';
import { pagerank } from '@setsu-ai/graph';

const NODES = ['a', 'b', 'c'];
const EDGES = [
  { source: 'a', target: 'b', weight: 1 },
  { source: 'a', target: 'c', weight: 1 },
  { source: 'b', target: 'c', weight: 1 },
  { source: 'c', target: 'a', weight: 1 },
];

describe('pagerank', () => {
  it('sums to ~1 and ranks the most-linked node highest', () => {
    const ranks = pagerank(NODES, EDGES);
    const total = [...ranks.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
    // c has two in-links (from a and b); a has one strong one (all of c's mass).
    expect(ranks.get('c')!).toBeGreaterThan(ranks.get('b')!);
    expect(ranks.get('a')!).toBeGreaterThan(ranks.get('b')!);
  });

  it('is deterministic', () => {
    const first = pagerank(NODES, EDGES);
    const second = pagerank(NODES, EDGES);
    expect([...first.entries()]).toEqual([...second.entries()]);
  });

  it('personalization biases mass toward seeds', () => {
    const global = pagerank(NODES, EDGES);
    const biased = pagerank(NODES, EDGES, { personalization: new Map([['b', 1]]) });
    expect(biased.get('b')!).toBeGreaterThan(global.get('b')!);
    const total = [...biased.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('handles dangling nodes without losing mass', () => {
    const ranks = pagerank(
      ['a', 'b', 'sink'],
      [
        { source: 'a', target: 'sink', weight: 1 },
        { source: 'b', target: 'sink', weight: 1 },
      ],
    );
    const total = [...ranks.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(ranks.get('sink')!).toBeGreaterThan(ranks.get('a')!);
  });

  it('respects edge weights', () => {
    const ranks = pagerank(
      ['s', 'heavy', 'light'],
      [
        { source: 's', target: 'heavy', weight: 9 },
        { source: 's', target: 'light', weight: 1 },
      ],
    );
    expect(ranks.get('heavy')!).toBeGreaterThan(ranks.get('light')!);
  });

  it('empty graph returns empty map', () => {
    expect(pagerank([], []).size).toBe(0);
  });
});
