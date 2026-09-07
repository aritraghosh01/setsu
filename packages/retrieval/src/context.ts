import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  estimateTokens,
  sha256Hex,
  stableId,
  loadConfig,
  type ContextEvidence,
  type ContextPack,
  type RetrievalStrategy,
} from '@setsu-ai/core';
import { getGraphRevision, type GraphStore } from '@setsu-ai/storage';
import {
  GraphView,
  findNodes,
  neighbors,
  shortestPath,
  impact,
  type GraphNode,
  type PathStep,
} from '@setsu-ai/graph';
import { classifyTask, extractSeedTerms, type TaskClass } from './classifier.js';
import { searchSymbols, searchSource } from './lexical.js';
import { packEvidence } from './packer.js';
import { buildRepoMap } from './repo-map.js';

export interface ContextOptions {
  budget?: number;
  mode?: 'auto' | 'graph' | 'symbol' | 'search' | 'repo_map';
}

export interface ContextExplain {
  taskClass: TaskClass;
  strategy: RetrievalStrategy;
  seeds: string[];
  candidateCount: number;
  packedCount: number;
  omittedCount: number;
  budget: number;
  usedTokens: number;
}

export interface ContextResult {
  pack: ContextPack;
  explain: ContextExplain;
}

const SNIPPET_MAX_LINES = 36;

class SourceReader {
  private readonly cache = new Map<string, string[] | null>();
  constructor(private readonly repoRoot: string) {}

  lines(path: string): string[] | null {
    let cached = this.cache.get(path);
    if (cached === undefined) {
      try {
        cached = readFileSync(join(this.repoRoot, path), 'utf8').split('\n');
      } catch {
        cached = null;
      }
      this.cache.set(path, cached);
    }
    return cached;
  }
}

function signatureEvidence(node: GraphNode, relevance: number): ContextEvidence {
  const text = `${node.kind} ${node.qualifiedName} (${node.path}:${node.startLine})${
    node.signature ? `\n  ${node.signature}` : ''
  }`;
  return {
    id: `sig:${node.id}`,
    kind: 'symbol_signature',
    file: node.path,
    startLine: node.startLine,
    endLine: node.startLine,
    text,
    estimatedTokens: estimateTokens(text),
    relevance,
    confidence: 1,
    provenance: 'ast',
  };
}

function snippetEvidence(
  node: GraphNode,
  reader: SourceReader,
  relevance: number,
): ContextEvidence | undefined {
  const lines = reader.lines(node.path);
  if (!lines) return undefined;
  const start = Math.max(node.startLine - 1, 0);
  const end = Math.min(node.endLine, start + SNIPPET_MAX_LINES, lines.length);
  const body = lines.slice(start, end).join('\n');
  const truncated = end < node.endLine ? '\n  ...' : '';
  const text = `${node.path}:${node.startLine}-${end}\n${body}${truncated}`;
  return {
    id: `snip:${node.id}`,
    kind: 'source_snippet',
    file: node.path,
    startLine: node.startLine,
    endLine: end,
    text,
    estimatedTokens: estimateTokens(text),
    relevance,
    confidence: 1,
    provenance: 'ast',
  };
}

function pathEvidence(steps: PathStep[]): ContextEvidence {
  const parts: string[] = [];
  for (const step of steps) {
    if (step.via) {
      parts.push(step.reversed ? `  <- ${step.via.edge_type} -` : `  - ${step.via.edge_type} ->`);
    }
    parts.push(`${step.node.kind} ${step.node.qualifiedName} (${step.node.path}:${step.node.startLine})`);
  }
  const text = `Path:\n${parts.join('\n')}`;
  const minConfidence = Math.min(...steps.filter((s) => s.via).map((s) => s.via!.confidence), 1);
  return {
    id: `path:${steps[0]!.node.id}:${steps[steps.length - 1]!.node.id}`,
    kind: 'graph_path',
    text,
    estimatedTokens: estimateTokens(text, 'prose'),
    relevance: 1,
    confidence: minConfidence,
    provenance: minConfidence >= 1 ? 'ast' : 'lexical',
  };
}

export async function buildContext(
  store: GraphStore,
  query: string,
  opts: ContextOptions = {},
): Promise<ContextResult> {
  const config = await loadConfig(store.repoRoot);
  const budget = opts.budget ?? config.retrieval.defaultBudget;
  const mode = opts.mode ?? 'auto';
  const taskClass = classifyTask(query);
  const terms = extractSeedTerms(query);
  const view = GraphView.load(store);
  const reader = new SourceReader(store.repoRoot);

  // Seed resolution: identifiers via exact lookup, then FTS over everything.
  const seedNodes: Array<{ node: GraphNode; relevance: number }> = [];
  const seen = new Set<string>();
  for (const identifier of terms.identifiers) {
    // Only the best match per identifier is a strong seed; trailing LIKE
    // matches (e.g. Foo.constructor for "Foo") must not outrank other
    // identifiers when picking path endpoints.
    let first = true;
    for (const node of findNodes(store, identifier, 3)) {
      if (!seen.has(node.id)) {
        seen.add(node.id);
        seedNodes.push({ node, relevance: first ? 1 : 0.75 });
      }
      first = false;
    }
  }
  const allTerms = [...terms.identifiers, ...terms.words];
  for (const hit of searchSymbols(store, allTerms, 10)) {
    const node = view.nodes.get(hit.symbolId);
    if (node && !seen.has(node.id)) {
      seen.add(node.id);
      seedNodes.push({ node, relevance: 0.7 * hit.score });
    }
  }
  const sourceHits = searchSource(store, allTerms, 10);

  // Strategy selection (spec sections 6-7).
  let strategy: RetrievalStrategy;
  if (mode === 'repo_map' || taskClass === 'repository_orientation') strategy = 'repo_map';
  else if (mode === 'graph' || mode === 'symbol') strategy = 'graph';
  else if (mode === 'search') strategy = 'lexical';
  else if (seedNodes.length >= 2) strategy = 'graph';
  else if (seedNodes.length === 1) strategy = 'hybrid';
  else if (sourceHits.length > 0) strategy = 'lexical';
  else strategy = 'repo_map';

  const evidence: ContextEvidence[] = [];
  const mandatoryIds = new Set<string>();
  const paths: PathStep[][] = [];
  let omittedNeighbors = 0;

  if (strategy === 'repo_map') {
    const text = buildRepoMap(store, view, Math.floor(budget * 0.9));
    evidence.push({
      id: 'repo-map',
      kind: 'file_summary',
      text,
      estimatedTokens: estimateTokens(text, 'prose'),
      relevance: 1,
      confidence: 1,
      provenance: 'ast',
    });
    mandatoryIds.add('repo-map');
  } else {
    const strongSeeds = seedNodes.filter((s) => s.relevance >= 0.9).slice(0, 4);
    const seeds = (strongSeeds.length > 0 ? strongSeeds : seedNodes.slice(0, 3)).filter(
      (s) => s.node.kind !== 'file',
    );

    // Path between the two strongest distinct-file seeds (architecture flows).
    if (seeds.length >= 2) {
      const [a, b] = [seeds[0]!.node, seeds[1]!.node];
      const path = shortestPath(view, a.id, b.id);
      if (path && path.length > 1) {
        paths.push(path);
        const ev = pathEvidence(path);
        evidence.push(ev);
        mandatoryIds.add(ev.id);
        for (const step of path) {
          if (step.node.kind !== 'file' && step.node.path !== '') {
            const snip = snippetEvidence(step.node, reader, 0.9);
            if (snip && !evidence.some((e) => e.id === snip.id)) evidence.push(snip);
          }
        }
      }
    }

    for (const { node, relevance } of seeds) {
      const sig = signatureEvidence(node, relevance);
      if (!evidence.some((e) => e.id === sig.id)) {
        evidence.push(sig);
        mandatoryIds.add(sig.id);
      }
      const snip = snippetEvidence(node, reader, relevance * 0.95);
      if (snip && !evidence.some((e) => e.id === snip.id)) evidence.push(snip);

      // Refactor/debug tasks care about dependents; others about neighborhood.
      if (taskClass === 'refactor') {
        const blast = impact(view, node.id, { maxDepth: 2, maxNodes: 40 });
        omittedNeighbors += Math.max(0, blast.direct.length + blast.transitive.length - 20);
        const lines = [
          `Dependents of ${node.qualifiedName}:`,
          ...blast.direct.slice(0, 12).map((h) => `  ${h.node.kind} ${h.node.qualifiedName} (${h.node.path}) [${h.edge.edge_type}]`),
          ...(blast.tests.length > 0
            ? ['  tests:', ...blast.tests.slice(0, 6).map((h) => `    ${h.node.path}`)]
            : []),
          `  files affected: ${blast.filesAffected.join(', ')}`,
        ];
        const text = lines.join('\n');
        evidence.push({
          id: `impact:${node.id}`,
          kind: 'file_summary',
          text,
          estimatedTokens: estimateTokens(text, 'prose'),
          relevance: relevance * 0.95,
          confidence: 0.9,
          provenance: 'ast',
        });
      } else {
        const hood = neighbors(view, node.id, { maxDepth: 1, maxNodes: 12, minConfidence: 0.5 });
        omittedNeighbors += Math.max(0, (view.in.get(node.id)?.length ?? 0) + (view.out.get(node.id)?.length ?? 0) - hood.length);
        for (const hit of hood) {
          if (hit.node.kind === 'file' || hit.node.kind === 'external') continue;
          const sigN = signatureEvidence(hit.node, relevance * 0.6 * hit.edge.confidence);
          if (!evidence.some((e) => e.id === sigN.id)) evidence.push(sigN);
        }
      }
    }

    for (const hit of sourceHits.slice(0, 6)) {
      const text = `${hit.path}:${hit.chunkStart}\n${hit.snippet}`;
      evidence.push({
        id: `fts:${hit.path}:${hit.chunkStart}`,
        kind: 'source_snippet',
        file: hit.path,
        startLine: hit.chunkStart,
        text,
        estimatedTokens: estimateTokens(text),
        relevance: 0.5 * hit.score,
        confidence: 0.8,
        provenance: 'lexical',
      });
    }
  }

  const packResult = packEvidence({ evidence, mandatoryIds, budget });

  const seedRelevanceMax = seedNodes.length > 0 ? Math.max(...seedNodes.map((s) => s.relevance)) : 0;
  const confidence =
    strategy === 'repo_map' ? 0.8 : seedRelevanceMax >= 0.9 ? 0.9 : seedRelevanceMax > 0 ? 0.6 : 0.35;
  const completeness =
    packResult.omittedCount === 0 ? 'high' : packResult.omittedCount <= 5 ? 'medium' : 'low';

  const pack: ContextPack = {
    id: stableId('pack', query, String(Date.now())),
    query,
    repoId: store.repoId,
    taskClass,
    budget: { maxEstimatedTokens: budget, usedEstimatedTokens: packResult.usedTokens },
    strategy,
    evidence: packResult.packed,
    graph: {
      seedNodeIds: seedNodes.map((s) => s.node.id),
      paths: paths.map((p) => ({
        nodeIds: p.map((s) => s.node.id),
        labels: p.map((s) => s.node.qualifiedName),
      })),
      omittedNeighborCount: omittedNeighbors,
    },
    quality: { confidence, completeness },
    graphRevision: getGraphRevision(store.db),
    schemaVersion: 1,
  };

  store.db.run(
    `INSERT INTO context_packs (id, query_hash, task_class, strategy, budget, used_tokens, graph_revision, created_at, pack)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    pack.id,
    sha256Hex(query).slice(0, 16),
    taskClass,
    strategy,
    budget,
    packResult.usedTokens,
    pack.graphRevision,
    new Date().toISOString(),
    JSON.stringify(pack),
  );

  return {
    pack,
    explain: {
      taskClass,
      strategy,
      seeds: seedNodes.slice(0, 8).map((s) => s.node.qualifiedName),
      candidateCount: evidence.length,
      packedCount: packResult.packed.length,
      omittedCount: packResult.omittedCount,
      budget,
      usedTokens: packResult.usedTokens,
    },
  };
}
