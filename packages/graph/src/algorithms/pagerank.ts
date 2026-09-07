/**
 * Power-iteration PageRank with an optional personalization vector
 * (spec sections 23-24). Implemented in-house because task-biased
 * personalized PageRank is SETSU's core ranking primitive and the
 * graphology metrics package has no personalization support.
 */

export interface PageRankEdge {
  source: string;
  target: string;
  weight: number;
}

export interface PageRankOptions {
  damping?: number;
  maxIterations?: number;
  tolerance?: number;
  /** Seed weights; missing nodes get 0. Empty/omitted = uniform. */
  personalization?: ReadonlyMap<string, number>;
}

export function pagerank(
  nodes: readonly string[],
  edges: readonly PageRankEdge[],
  options: PageRankOptions = {},
): Map<string, number> {
  const damping = options.damping ?? 0.85;
  const maxIterations = options.maxIterations ?? 60;
  const tolerance = options.tolerance ?? 1e-8;
  const n = nodes.length;
  const result = new Map<string, number>();
  if (n === 0) return result;

  const index = new Map<string, number>();
  nodes.forEach((node, i) => index.set(node, i));

  // Base (teleport) distribution.
  const base = new Float64Array(n);
  const personalization = options.personalization;
  if (personalization && personalization.size > 0) {
    let total = 0;
    for (const [node, weight] of personalization) {
      const i = index.get(node);
      if (i !== undefined && weight > 0) {
        base[i] = weight;
        total += weight;
      }
    }
    if (total > 0) {
      for (let i = 0; i < n; i += 1) base[i]! /= total;
    } else {
      base.fill(1 / n);
    }
  } else {
    base.fill(1 / n);
  }

  // Outgoing adjacency with normalized weights.
  const outTargets: number[][] = Array.from({ length: n }, () => []);
  const outWeights: number[][] = Array.from({ length: n }, () => []);
  const outTotal = new Float64Array(n);
  for (const edge of edges) {
    const s = index.get(edge.source);
    const t = index.get(edge.target);
    if (s === undefined || t === undefined || edge.weight <= 0) continue;
    outTargets[s]!.push(t);
    outWeights[s]!.push(edge.weight);
    outTotal[s]! += edge.weight;
  }

  let rank = Float64Array.from(base);
  const next = new Float64Array(n);

  for (let iter = 0; iter < maxIterations; iter += 1) {
    next.fill(0);
    let danglingMass = 0;
    for (let i = 0; i < n; i += 1) {
      const r = rank[i]!;
      if (outTotal[i]! === 0) {
        danglingMass += r;
        continue;
      }
      const targets = outTargets[i]!;
      const weights = outWeights[i]!;
      const total = outTotal[i]!;
      for (let j = 0; j < targets.length; j += 1) {
        next[targets[j]!]! += r * (weights[j]! / total);
      }
    }
    let delta = 0;
    for (let i = 0; i < n; i += 1) {
      const value = damping * (next[i]! + danglingMass * base[i]!) + (1 - damping) * base[i]!;
      delta += Math.abs(value - rank[i]!);
      next[i] = value;
    }
    const tmp = rank;
    rank = Float64Array.from(next);
    tmp.fill(0);
    if (delta < tolerance) break;
  }

  nodes.forEach((node, i) => result.set(node, rank[i]!));
  return result;
}
