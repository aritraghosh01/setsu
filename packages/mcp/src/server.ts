import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { openGraphDb, type GraphStore } from '@setsu-ai/storage';
import {
  indexRepo,
  graphStats,
  GraphView,
  findNodes,
  shortestPath,
  callers,
  callees,
  impact,
} from '@setsu-ai/graph';
import { buildContext } from '@setsu-ai/retrieval';

const REINDEX_MIN_INTERVAL_MS = 10_000;

interface ServerState {
  store: GraphStore;
  lastIndexAt: number;
}

async function freshen(state: ServerState): Promise<void> {
  if (Date.now() - state.lastIndexAt < REINDEX_MIN_INTERVAL_MS) return;
  await indexRepo(state.store);
  state.lastIndexAt = Date.now();
}

function text(value: string): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: value }] };
}

/**
 * Minimal MCP surface, spec section 27: exactly five tools. setsu_context is
 * the workhorse; the router handles strategy internally.
 */
export interface SetsuMcpHandle {
  server: McpServer;
  close(): void;
}

export function createSetsuMcpServer(repoRoot: string, version: string): SetsuMcpHandle {
  const store = openGraphDb(repoRoot);
  const state: ServerState = { store, lastIndexAt: 0 };

  const server = new McpServer({ name: 'setsu', version });

  server.registerTool(
    'setsu_context',
    {
      description:
        'Get a token-budgeted evidence pack for a question about this repository. ' +
        'Call this BEFORE broad file search: it returns the smallest set of symbols, ' +
        'snippets and graph paths that answer the question.',
      inputSchema: {
        query: z.string().describe('The task or question, in natural language'),
        maxTokens: z.number().int().positive().optional().describe('Evidence budget (default 1500)'),
        mode: z.enum(['auto', 'graph', 'symbol', 'search']).optional(),
      },
    },
    async ({ query, maxTokens, mode }) => {
      await freshen(state);
      const { pack, explain } = await buildContext(store, query, {
        ...(maxTokens !== undefined ? { budget: maxTokens } : {}),
        ...(mode !== undefined ? { mode } : {}),
      });
      const lines: string[] = [];
      for (const item of pack.evidence) {
        lines.push(`--- ${item.kind}${item.file ? ` ${item.file}:${item.startLine ?? ''}` : ''}`);
        lines.push(item.text);
      }
      lines.push('');
      lines.push(
        `[setsu] strategy=${explain.strategy} class=${explain.taskClass} ` +
          `evidence=${pack.evidence.length} tokens~${pack.budget.usedEstimatedTokens}/${pack.budget.maxEstimatedTokens} ` +
          `confidence=${pack.quality.confidence.toFixed(2)} graphRevision=${pack.graphRevision}`,
      );
      return text(lines.join('\n'));
    },
  );

  server.registerTool(
    'setsu_symbol',
    {
      description:
        'Look up a symbol by name or qualified name: definition location, signature, callers and callees.',
      inputSchema: {
        name: z.string().describe('Symbol name, e.g. "UserService" or "UserService.authenticate"'),
      },
    },
    async ({ name }) => {
      await freshen(state);
      const matches = findNodes(store, name, 5);
      if (matches.length === 0) return text(`No symbol found for "${name}".`);
      const view = GraphView.load(store);
      const lines: string[] = [];
      for (const node of matches.slice(0, 3)) {
        lines.push(`${node.kind} ${node.qualifiedName} (${node.path}:${node.startLine}-${node.endLine})`);
        if (node.signature) lines.push(`  ${node.signature}`);
        const inCalls = callers(view, node.id, { maxNodes: 10 });
        if (inCalls.length > 0) {
          lines.push(`  callers: ${inCalls.map((h) => h.node.qualifiedName).join(', ')}`);
        }
        const outCalls = callees(view, node.id, { maxNodes: 10 });
        if (outCalls.length > 0) {
          lines.push(`  callees: ${outCalls.map((h) => h.node.qualifiedName).join(', ')}`);
        }
      }
      return text(lines.join('\n'));
    },
  );

  server.registerTool(
    'setsu_path',
    {
      description:
        'Shortest relationship path between two symbols (how does A reach B), with edge types and provenance.',
      inputSchema: {
        from: z.string().describe('Start symbol name'),
        to: z.string().describe('End symbol name'),
      },
    },
    async ({ from, to }) => {
      await freshen(state);
      const source = findNodes(store, from, 1)[0];
      const target = findNodes(store, to, 1)[0];
      if (!source || !target) {
        return text(`Could not resolve ${!source ? from : to} to a symbol.`);
      }
      const view = GraphView.load(store);
      const path = shortestPath(view, source.id, target.id);
      if (!path) return text(`No path found between ${source.qualifiedName} and ${target.qualifiedName}.`);
      const lines: string[] = [];
      for (const step of path) {
        if (step.via) {
          lines.push(
            step.reversed
              ? `  <- ${step.via.edge_type} - [${step.via.provenance}]`
              : `  - ${step.via.edge_type} -> [${step.via.provenance}]`,
          );
        }
        lines.push(`${step.node.kind} ${step.node.qualifiedName} (${step.node.path}:${step.node.startLine})`);
      }
      return text(lines.join('\n'));
    },
  );

  server.registerTool(
    'setsu_impact',
    {
      description:
        'Blast radius: what depends on a symbol (direct/transitive dependents, affected tests and files).',
      inputSchema: {
        name: z.string().describe('Symbol name'),
        depth: z.number().int().min(1).max(5).optional().describe('Traversal depth (default 3)'),
      },
    },
    async ({ name, depth }) => {
      await freshen(state);
      const node = findNodes(store, name, 1)[0];
      if (!node) return text(`No symbol found for "${name}".`);
      const view = GraphView.load(store);
      const result = impact(view, node.id, { maxDepth: depth ?? 3 });
      const lines = [
        `Impact of ${node.kind} ${node.qualifiedName}:`,
        `direct dependents (${result.direct.length}):`,
        ...result.direct.slice(0, 15).map((h) => `  ${h.node.kind} ${h.node.qualifiedName} (${h.node.path}) [${h.edge.edge_type}]`),
      ];
      if (result.tests.length > 0) {
        lines.push(`tests: ${result.tests.map((h) => h.node.path).join(', ')}`);
      }
      lines.push(`files affected (${result.filesAffected.length}): ${result.filesAffected.join(', ')}`);
      return text(lines.join('\n'));
    },
  );

  server.registerTool(
    'setsu_status',
    {
      description: 'Index freshness and graph size for this repository.',
      inputSchema: {},
    },
    async () => {
      await freshen(state);
      const stats = graphStats(store);
      return text(
        `repo: ${store.repoRoot}\nfiles: ${stats.files}\nsymbols: ${stats.symbols}\n` +
          `edges: ${stats.edges}\ngraph revision: ${stats.revision}\n` +
          `lsp: degraded (detection-only in v0.1)\nsemantic: disabled`,
      );
    },
  );

  return {
    server,
    close(): void {
      store.db.close();
    },
  };
}
