#!/usr/bin/env node
import { Command } from 'commander';
import { runInit } from './commands/init.js';
import { runIndex, runGraphStats } from './commands/index-cmd.js';
import {
  runSymbol,
  runPath,
  runImpact,
  runGraphNode,
  runGraphCommunity,
  runGraphTop,
  runGraphExport,
} from './commands/graph-cmds.js';
import { runContext } from './commands/context-cmd.js';
import { runWatch } from './commands/watch-cmd.js';
import { serveStdio } from '@setsu-ai/mcp';
import { runAdapters } from './commands/adapters-cmd.js';

declare const __SETSU_VERSION__: string;
const version = typeof __SETSU_VERSION__ === 'string' ? __SETSU_VERSION__ : '0.0.0-dev';

// node:sqlite prints an ExperimentalWarning on Node 22.13-23.x; it is stable
// behavior for our usage, so silence just that warning.
process.on('warning', (w) => {
  if (w.name === 'ExperimentalWarning' && w.message.includes('SQLite')) return;
});

const program = new Command();

program
  .name('setsu')
  .description('SETSU — local-first context efficiency and code intelligence for AI coding agents')
  .version(version);

program
  .command('init')
  .description('Initialize SETSU: detect agents, build the graph, offer MCP install')
  .option('--repo <root>', 'repository root', process.cwd())
  .option('--yes', 'accept all defaults (MCP install + guidance)')
  .option('--mcp', 'register the SETSU MCP server for detected agents')
  .option('--no-mcp', 'skip MCP registration')
  .option('--guidance', 'add graph-first guidance to instruction files')
  .option('--no-guidance', 'skip guidance block')
  .option('--skip-index', 'do not build the initial graph')
  .action(async (opts: { repo: string; yes?: boolean; mcp?: boolean; guidance?: boolean; skipIndex?: boolean }) => {
    await runInit(opts.repo, opts);
  });

program
  .command('adapters')
  .description('Show detected AI agents and their instruction inventory')
  .option('--repo <root>', 'repository root', process.cwd())
  .action(async (opts: { repo: string }) => {
    await runAdapters(opts);
  });

program
  .command('index')
  .description('Index the repository (incremental by default)')
  .option('--repo <root>', 'repository root', process.cwd())
  .option('--stats', 'print index statistics')
  .option('--full', 'discard the existing index and rebuild')
  .option('--watch', 'keep indexing incrementally as files change')
  .action(async (opts: { repo: string; stats?: boolean; full?: boolean; watch?: boolean }) => {
    if (opts.watch) {
      await runWatch(opts);
      return;
    }
    await runIndex(opts);
  });

program
  .command('watch')
  .description('Watch the repository and keep the graph fresh')
  .option('--repo <root>', 'repository root', process.cwd())
  .action(async (opts: { repo: string }) => {
    await runWatch(opts);
  });

program
  .command('context <query>')
  .description('Build a token-budgeted evidence pack for a question')
  .option('--repo <root>', 'repository root', process.cwd())
  .option('--budget <tokens>', 'max estimated tokens')
  .option('--mode <mode>', 'auto | graph | symbol | search | repo_map', 'auto')
  .option('--json', 'emit the ContextPack as JSON')
  .option('--explain', 'show routing and packing decisions')
  .action(async (query: string, opts: { repo: string; budget?: string; json?: boolean; explain?: boolean; mode?: string }) => {
    await runContext(query, opts);
  });

program
  .command('symbol <name>')
  .description('Look up a symbol: definition, callers, callees')
  .option('--repo <root>', 'repository root', process.cwd())
  .option('--references', 'list incoming references')
  .option('--implementations', 'list implementations/subclasses')
  .action(async (name: string, opts: { repo: string; references?: boolean; implementations?: boolean }) => {
    await runSymbol(name, opts);
  });

program
  .command('path <from> <to>')
  .description('Shortest relationship path between two symbols')
  .option('--repo <root>', 'repository root', process.cwd())
  .action(async (from: string, to: string, opts: { repo: string }) => {
    await runPath(from, to, opts);
  });

program
  .command('impact <name>')
  .description('Blast radius: what depends on this symbol')
  .option('--repo <root>', 'repository root', process.cwd())
  .option('--depth <n>', 'traversal depth', '3')
  .action(async (name: string, opts: { repo: string; depth?: string }) => {
    await runImpact(name, opts);
  });

const graph = program.command('graph').description('Inspect the code graph');
graph
  .command('stats')
  .description('Show node/edge counts and revision')
  .option('--repo <root>', 'repository root', process.cwd())
  .action(async (opts: { repo: string }) => {
    await runGraphStats(opts.repo);
  });
graph
  .command('node <name>')
  .description('Show a node and its immediate relationships')
  .option('--repo <root>', 'repository root', process.cwd())
  .action(async (name: string, opts: { repo: string }) => {
    await runGraphNode(name, opts);
  });
graph
  .command('community <name>')
  .description('Show the community a symbol belongs to')
  .option('--repo <root>', 'repository root', process.cwd())
  .action(async (name: string, opts: { repo: string }) => {
    await runGraphCommunity(name, opts);
  });
graph
  .command('top')
  .description('Highest-PageRank nodes in the graph')
  .option('--repo <root>', 'repository root', process.cwd())
  .action(async (opts: { repo: string }) => {
    await runGraphTop(opts);
  });
graph
  .command('export')
  .description('Dump the graph as JSON to stdout')
  .option('--repo <root>', 'repository root', process.cwd())
  .action(async (opts: { repo: string }) => {
    await runGraphExport(opts);
  });

const mcp = program.command('mcp').description('Model Context Protocol server');
mcp
  .command('serve')
  .description('Serve the 5-tool SETSU MCP surface over stdio')
  .option('--repo <root>', 'repository root', process.cwd())
  .action(async (opts: { repo: string }) => {
    await serveStdio(opts.repo, version);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
