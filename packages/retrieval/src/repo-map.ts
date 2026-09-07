import { estimateTokens } from '@setsu-ai/core';
import type { GraphStore } from '@setsu-ai/storage';
import { topRanked, type GraphView } from '@setsu-ai/graph';

/**
 * Budgeted repository map (Aider RepoMap concept, spec section 3.3):
 * highest-PageRank symbols grouped by file, emitted until the budget runs out.
 */
export function buildRepoMap(store: GraphStore, view: GraphView, budget: number): string {
  const ranked = topRanked(store, view, 200);
  const byFile = new Map<string, string[]>();
  const fileOrder: string[] = [];
  let used = 0;

  const header = 'Repository map (highest-centrality symbols):\n';
  used += estimateTokens(header, 'prose');

  for (const { node } of ranked) {
    if (node.kind === 'file' || node.path === '') continue;
    const line = `  ${node.kind} ${node.qualifiedName}${node.signature ? ` — ${node.signature}` : ''}`;
    const cost = estimateTokens(line);
    const fileHeaderCost = byFile.has(node.path) ? 0 : estimateTokens(node.path) + 1;
    if (used + cost + fileHeaderCost > budget) break;
    if (!byFile.has(node.path)) {
      byFile.set(node.path, []);
      fileOrder.push(node.path);
    }
    byFile.get(node.path)!.push(line);
    used += cost + fileHeaderCost;
  }

  const parts: string[] = [header];
  for (const file of fileOrder) {
    parts.push(`${file}:`);
    parts.push(...byFile.get(file)!);
  }
  return parts.join('\n');
}
