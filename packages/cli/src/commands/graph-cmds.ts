import { openGraphDb, type GraphStore } from '@setsu-ai/storage';
import {
  GraphView,
  findNodes,
  neighbors,
  shortestPath,
  callers,
  callees,
  impact,
  communityOf,
  topRanked,
  type GraphNode,
} from '@setsu-ai/graph';

function loc(node: GraphNode): string {
  return node.path ? `${node.path}:${node.startLine}` : '(external)';
}

function describe(node: GraphNode): string {
  return `${node.kind} ${node.qualifiedName}  ${loc(node)}`;
}

function resolveOne(store: GraphStore, query: string): GraphNode | undefined {
  const matches = findNodes(store, query, 5);
  if (matches.length === 0) {
    console.log(`No symbol found for "${query}".`);
    return undefined;
  }
  if (matches.length > 1 && matches[0]!.qualifiedName !== query && matches[0]!.name !== query) {
    console.log(`Multiple matches for "${query}", using first:`);
    for (const m of matches) console.log(`  ${describe(m)}`);
  }
  return matches[0];
}

export async function runSymbol(
  query: string,
  opts: { repo: string; references?: boolean; implementations?: boolean },
): Promise<void> {
  const store = openGraphDb(opts.repo);
  try {
    const node = resolveOne(store, query);
    if (!node) return;
    const view = GraphView.load(store);
    console.log(describe(node));
    if (node.signature) console.log(`  ${node.signature}`);

    const inCalls = callers(view, node.id, { maxNodes: 15 });
    const outCalls = callees(view, node.id, { maxNodes: 15 });
    if (inCalls.length > 0) {
      console.log(`  callers (${inCalls.length}):`);
      for (const hit of inCalls) console.log(`    ${describe(hit.node)}`);
    }
    if (outCalls.length > 0) {
      console.log(`  callees (${outCalls.length}):`);
      for (const hit of outCalls) console.log(`    ${describe(hit.node)}`);
    }
    if (opts.implementations) {
      const impls = neighbors(view, node.id, {
        direction: 'in',
        edgeTypes: ['implements', 'extends'],
        maxNodes: 20,
      });
      console.log(`  implementations (${impls.length}):`);
      for (const hit of impls) console.log(`    ${describe(hit.node)}`);
    }
    if (opts.references) {
      const refs = neighbors(view, node.id, {
        direction: 'in',
        edgeTypes: ['references', 'imports', 'depends_on'],
        maxNodes: 30,
      });
      console.log(`  references (${refs.length}):`);
      for (const hit of refs) console.log(`    ${describe(hit.node)} [${hit.edge.edge_type}]`);
    }
  } finally {
    store.db.close();
  }
}

export async function runPath(from: string, to: string, opts: { repo: string }): Promise<void> {
  const store = openGraphDb(opts.repo);
  try {
    const source = resolveOne(store, from);
    const target = resolveOne(store, to);
    if (!source || !target) return;
    const view = GraphView.load(store);
    const path = shortestPath(view, source.id, target.id);
    if (!path) {
      console.log(`No path found between ${source.qualifiedName} and ${target.qualifiedName}.`);
      return;
    }
    for (const step of path) {
      if (step.via) {
        const arrow = step.reversed ? `<- ${step.via.edge_type} -` : `- ${step.via.edge_type} ->`;
        console.log(`  ${arrow}  [${step.via.provenance} ${step.via.confidence.toFixed(2)}]`);
      }
      console.log(describe(step.node));
    }
  } finally {
    store.db.close();
  }
}

export async function runImpact(query: string, opts: { repo: string; depth?: string }): Promise<void> {
  const store = openGraphDb(opts.repo);
  try {
    const node = resolveOne(store, query);
    if (!node) return;
    const view = GraphView.load(store);
    const result = impact(view, node.id, { maxDepth: Number(opts.depth ?? 3) });
    console.log(`Impact of ${node.kind} ${node.qualifiedName}:`);
    console.log(`  direct dependents (${result.direct.length}):`);
    for (const hit of result.direct) {
      console.log(`    ${describe(hit.node)} [${hit.edge.edge_type}]`);
    }
    if (result.transitive.length > 0) {
      console.log(`  transitive (${result.transitive.length}):`);
      for (const hit of result.transitive.slice(0, 20)) {
        console.log(`    ${describe(hit.node)} (depth ${hit.depth})`);
      }
    }
    if (result.tests.length > 0) {
      console.log(`  tests touching this (${result.tests.length}):`);
      for (const hit of result.tests) console.log(`    ${loc(hit.node)}`);
    }
    console.log(`  files affected: ${result.filesAffected.length}`);
    for (const file of result.filesAffected) console.log(`    ${file}`);
  } finally {
    store.db.close();
  }
}

export async function runGraphNode(query: string, opts: { repo: string }): Promise<void> {
  const store = openGraphDb(opts.repo);
  try {
    const node = resolveOne(store, query);
    if (!node) return;
    const view = GraphView.load(store);
    console.log(describe(node));
    const hits = neighbors(view, node.id, { maxNodes: 30 });
    for (const hit of hits) {
      const arrow = hit.direction === 'out' ? '->' : '<-';
      console.log(`  ${arrow} ${hit.edge.edge_type.padEnd(11)} ${describe(hit.node)}`);
    }
  } finally {
    store.db.close();
  }
}

export async function runGraphCommunity(query: string, opts: { repo: string }): Promise<void> {
  const store = openGraphDb(opts.repo);
  try {
    const node = resolveOne(store, query);
    if (!node) return;
    const view = GraphView.load(store);
    const info = communityOf(store, view, node.id);
    if (!info) {
      console.log('Node has no community assignment (run setsu index).');
      return;
    }
    console.log(`Community "${info.label ?? info.id}" (${info.members.length} members):`);
    for (const member of info.members.slice(0, 40)) console.log(`  ${describe(member)}`);
  } finally {
    store.db.close();
  }
}

export async function runGraphTop(opts: { repo: string }): Promise<void> {
  const store = openGraphDb(opts.repo);
  try {
    const view = GraphView.load(store);
    for (const { node, rank } of topRanked(store, view, 20)) {
      console.log(`  ${rank.toFixed(5)}  ${describe(node)}`);
    }
  } finally {
    store.db.close();
  }
}

export async function runGraphExport(opts: { repo: string }): Promise<void> {
  const store = openGraphDb(opts.repo);
  try {
    const view = GraphView.load(store);
    const payload = {
      schemaVersion: 1,
      nodes: [...view.nodes.values()],
      edges: view.edges,
    };
    console.log(JSON.stringify(payload, null, 2));
  } finally {
    store.db.close();
  }
}
