import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import { stableId } from '@setsu-ai/core';
import { getGraphRevision, type GraphStore } from '@setsu-ai/storage';
import { GraphView } from './graph-view.js';
import { pagerank } from './algorithms/pagerank.js';

/** Deterministic rng so Louvain results are stable across runs (golden tests). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface AnalyzeResult {
  communities: number;
  rankedNodes: number;
}

/**
 * Compute centrality (PageRank + degree) and Louvain communities, persisting
 * both for the current graph revision (spec sections 22-23).
 */
export function analyzeGraph(store: GraphStore, view?: GraphView): AnalyzeResult {
  const g = view ?? GraphView.load(store);
  const revision = getGraphRevision(store.db);
  const nodeIds = g.nodeIds();

  const ranks = pagerank(
    nodeIds,
    g.edges.map((e) => ({ source: e.source_id, target: e.target_id, weight: e.confidence })),
  );

  const graph = new Graph({ type: 'undirected', multi: false });
  for (const id of nodeIds) graph.addNode(id);
  for (const e of g.edges) {
    if (e.source_id === e.target_id) continue;
    graph.mergeUndirectedEdge(e.source_id, e.target_id, { weight: e.confidence });
  }

  let assignments: Record<string, number> = {};
  if (graph.order > 0 && graph.size > 0) {
    assignments = louvain(graph, {
      getEdgeWeight: 'weight',
      rng: mulberry32(0x5e75),
    }) as Record<string, number>;
  }

  store.db.transaction(() => {
    store.db.run(`DELETE FROM centrality`);
    for (const [nodeId, value] of ranks) {
      store.db.run(
        `INSERT OR REPLACE INTO centrality (node_id, metric, value, revision) VALUES (?, 'pagerank', ?, ?)`,
        nodeId,
        value,
        revision,
      );
    }
    for (const id of nodeIds) {
      const degree = (g.out.get(id)?.length ?? 0) + (g.in.get(id)?.length ?? 0);
      store.db.run(
        `INSERT OR REPLACE INTO centrality (node_id, metric, value, revision) VALUES (?, 'degree', ?, ?)`,
        id,
        degree,
        revision,
      );
    }

    store.db.run(`DELETE FROM community_members`);
    store.db.run(`DELETE FROM communities WHERE repo_id = ?`, store.repoId);
    const members = new Map<number, string[]>();
    for (const [nodeId, community] of Object.entries(assignments)) {
      const list = members.get(community);
      if (list) list.push(nodeId);
      else members.set(community, [nodeId]);
    }
    for (const [community, nodeList] of members) {
      // Label the community by its highest-ranked member's location.
      let best = nodeList[0]!;
      let bestRank = -1;
      for (const nodeId of nodeList) {
        const r = ranks.get(nodeId) ?? 0;
        if (r > bestRank) {
          bestRank = r;
          best = nodeId;
        }
      }
      const bestNode = g.nodes.get(best);
      const label = bestNode
        ? bestNode.path
          ? bestNode.path.split('/').slice(0, -1).join('/') || bestNode.name
          : bestNode.name
        : `community-${community}`;
      const communityId = stableId('com', String(revision), String(community));
      store.db.run(
        `INSERT OR REPLACE INTO communities (id, repo_id, algorithm, revision, label) VALUES (?, ?, 'louvain', ?, ?)`,
        communityId,
        store.repoId,
        revision,
        label,
      );
      for (const nodeId of nodeList) {
        store.db.run(
          `INSERT OR REPLACE INTO community_members (community_id, node_id) VALUES (?, ?)`,
          communityId,
          nodeId,
        );
      }
    }
  });

  return { communities: new Set(Object.values(assignments)).size, rankedNodes: ranks.size };
}
