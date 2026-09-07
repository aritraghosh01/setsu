import type { GraphStore } from '@setsu-ai/storage';
import type { GraphView, GraphNode, GraphEdgeRow } from './graph-view.js';

/** Resolve a user-facing name to graph nodes (spec section 26 findNode). */
export function findNodes(store: GraphStore, query: string, limit = 10): GraphNode[] {
  const rows = store.db.all<{
    id: string;
    name: string;
    qualified_name: string;
    kind: string;
    language: string;
    file_path: string;
    start_line: number;
    end_line: number;
    signature: string | null;
  }>(
    `SELECT id, name, qualified_name, kind, language, file_path, start_line, end_line, signature
     FROM symbols
     WHERE repo_id = ? AND kind != 'external' AND (qualified_name = ? OR name = ? OR qualified_name LIKE ?)
     ORDER BY CASE WHEN qualified_name = ? THEN 0 WHEN name = ? THEN 1 ELSE 2 END, length(qualified_name)
     LIMIT ?`,
    store.repoId,
    query,
    query,
    `%${query}%`,
    query,
    query,
    limit,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    qualifiedName: row.qualified_name,
    kind: row.kind,
    language: row.language,
    path: row.file_path,
    startLine: row.start_line,
    endLine: row.end_line,
    signature: row.signature,
  }));
}

export interface TraversalOptions {
  direction?: 'out' | 'in' | 'both';
  maxDepth?: number;
  maxNodes?: number;
  edgeTypes?: readonly string[];
  minConfidence?: number;
}

export interface NeighborHit {
  node: GraphNode;
  edge: GraphEdgeRow;
  direction: 'out' | 'in';
  depth: number;
}

/** Bounded BFS neighborhood (spec section 25: every operation has caps). */
export function neighbors(view: GraphView, id: string, opts: TraversalOptions = {}): NeighborHit[] {
  const direction = opts.direction ?? 'both';
  const maxDepth = opts.maxDepth ?? 1;
  const maxNodes = opts.maxNodes ?? 50;
  const minConfidence = opts.minConfidence ?? 0;
  const edgeTypes = opts.edgeTypes ? new Set(opts.edgeTypes) : undefined;

  const hits: NeighborHit[] = [];
  const visited = new Set<string>([id]);
  let frontier = [id];
  for (let depth = 1; depth <= maxDepth && hits.length < maxNodes; depth += 1) {
    const next: string[] = [];
    for (const current of frontier) {
      const candidates: Array<{ edge: GraphEdgeRow; dir: 'out' | 'in'; other: string }> = [];
      if (direction !== 'in') {
        for (const edge of view.out.get(current) ?? []) {
          candidates.push({ edge, dir: 'out', other: edge.target_id });
        }
      }
      if (direction !== 'out') {
        for (const edge of view.in.get(current) ?? []) {
          candidates.push({ edge, dir: 'in', other: edge.source_id });
        }
      }
      for (const { edge, dir, other } of candidates) {
        if (visited.has(other)) continue;
        if (edge.confidence < minConfidence) continue;
        if (edgeTypes && !edgeTypes.has(edge.edge_type)) continue;
        const node = view.nodes.get(other);
        if (!node) continue;
        visited.add(other);
        hits.push({ node, edge, direction: dir, depth });
        next.push(other);
        if (hits.length >= maxNodes) break;
      }
      if (hits.length >= maxNodes) break;
    }
    frontier = next;
  }
  return hits;
}

export interface PathStep {
  node: GraphNode;
  /** Edge that led here from the previous step (undefined for the start). */
  via?: GraphEdgeRow;
  /** True when the edge was traversed against its direction. */
  reversed?: boolean;
}

const PATH_DEFAULT_TYPES = [
  'calls',
  'implements',
  'extends',
  'references',
  'imports',
  'contains',
  'defines',
  'depends_on',
];

/**
 * Shortest undirected path between two nodes via BFS. Architecture questions
 * ("how does checkout reach Stripe?") need direction-agnostic chains like
 * calls -> implements^-1 (spec section 54 example).
 */
export function shortestPath(
  view: GraphView,
  fromId: string,
  toId: string,
  opts: TraversalOptions = {},
): PathStep[] | undefined {
  const maxDepth = opts.maxDepth ?? 8;
  const edgeTypes = new Set(opts.edgeTypes ?? PATH_DEFAULT_TYPES);
  const minConfidence = opts.minConfidence ?? 0;

  interface Visit {
    edge: GraphEdgeRow;
    prev: string;
    reversed: boolean;
  }
  const visited = new Map<string, Visit | null>([[fromId, null]]);
  let frontier = [fromId];
  let found = fromId === toId;

  for (let depth = 0; depth < maxDepth && !found && frontier.length > 0; depth += 1) {
    const next: string[] = [];
    for (const current of frontier) {
      const step = (edge: GraphEdgeRow, other: string, reversed: boolean): boolean => {
        if (visited.has(other)) return false;
        if (edge.confidence < minConfidence || !edgeTypes.has(edge.edge_type)) return false;
        visited.set(other, { edge, prev: current, reversed });
        next.push(other);
        return other === toId;
      };
      for (const edge of view.out.get(current) ?? []) {
        if (step(edge, edge.target_id, false)) {
          found = true;
          break;
        }
      }
      if (found) break;
      for (const edge of view.in.get(current) ?? []) {
        if (step(edge, edge.source_id, true)) {
          found = true;
          break;
        }
      }
      if (found) break;
    }
    frontier = next;
  }

  if (!found) return undefined;

  const steps: PathStep[] = [];
  let cursor: string | undefined = toId;
  while (cursor !== undefined) {
    const visit = visited.get(cursor);
    const node = view.nodes.get(cursor);
    if (!node) return undefined;
    if (visit) {
      steps.push({ node, via: visit.edge, reversed: visit.reversed });
      cursor = visit.prev;
    } else {
      steps.push({ node });
      cursor = undefined;
    }
  }
  steps.reverse();
  return steps;
}

export function callers(view: GraphView, id: string, opts: TraversalOptions = {}): NeighborHit[] {
  return neighbors(view, id, { ...opts, direction: 'in', edgeTypes: ['calls'] });
}

export function callees(view: GraphView, id: string, opts: TraversalOptions = {}): NeighborHit[] {
  return neighbors(view, id, { ...opts, direction: 'out', edgeTypes: ['calls'] });
}

export interface ImpactResult {
  direct: NeighborHit[];
  transitive: NeighborHit[];
  tests: NeighborHit[];
  filesAffected: string[];
}

const IMPACT_EDGE_TYPES = ['calls', 'references', 'implements', 'extends', 'imports', 'contains'];

/** Reverse blast radius: who breaks if this node changes (spec section 55). */
export function impact(view: GraphView, id: string, opts: TraversalOptions = {}): ImpactResult {
  const hits = neighbors(view, id, {
    direction: 'in',
    maxDepth: opts.maxDepth ?? 3,
    maxNodes: opts.maxNodes ?? 200,
    edgeTypes: opts.edgeTypes ?? IMPACT_EDGE_TYPES,
    minConfidence: opts.minConfidence ?? 0.5,
  });
  const isTest = (node: GraphNode): boolean =>
    /(^|\/)(tests?|__tests__)(\/|$)|\.test\.|\.spec\.|^test_|\/test_/.test(node.path);
  const direct = hits.filter((h) => h.depth === 1);
  const transitive = hits.filter((h) => h.depth > 1);
  const tests = hits.filter((h) => isTest(h.node));
  const filesAffected = [...new Set(hits.map((h) => h.node.path).filter((p) => p !== ''))].sort();
  return { direct, transitive, tests, filesAffected };
}

export interface CommunityInfo {
  id: string;
  label: string | null;
  members: GraphNode[];
}

export function communityOf(store: GraphStore, view: GraphView, nodeId: string): CommunityInfo | undefined {
  const row = store.db.get<{ community_id: string; label: string | null }>(
    `SELECT cm.community_id, c.label FROM community_members cm
     JOIN communities c ON c.id = cm.community_id
     WHERE cm.node_id = ?`,
    nodeId,
  );
  if (!row) return undefined;
  const members: GraphNode[] = [];
  for (const member of store.db.all<{ node_id: string }>(
    `SELECT node_id FROM community_members WHERE community_id = ?`,
    row.community_id,
  )) {
    const node = view.nodes.get(member.node_id);
    if (node) members.push(node);
  }
  members.sort((a, b) => (a.qualifiedName < b.qualifiedName ? -1 : 1));
  return { id: row.community_id, label: row.label, members };
}

export function topRanked(store: GraphStore, view: GraphView, limit = 20): Array<{ node: GraphNode; rank: number }> {
  const rows = store.db.all<{ node_id: string; value: number }>(
    `SELECT node_id, value FROM centrality WHERE metric = 'pagerank' ORDER BY value DESC LIMIT ?`,
    limit * 2,
  );
  const out: Array<{ node: GraphNode; rank: number }> = [];
  for (const row of rows) {
    const node = view.nodes.get(row.node_id);
    if (node && node.kind !== 'external') {
      out.push({ node, rank: row.value });
      if (out.length >= limit) break;
    }
  }
  return out;
}
