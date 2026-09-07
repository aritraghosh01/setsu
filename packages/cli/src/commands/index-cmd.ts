import { openGraphDb, graphDbPath } from '@setsu-ai/storage';
import { indexRepo, graphStats } from '@setsu-ai/graph';

export interface IndexOptions {
  repo: string;
  stats?: boolean;
  full?: boolean;
}

export async function runIndex(opts: IndexOptions): Promise<void> {
  const store = openGraphDb(opts.repo);
  try {
    const result = await indexRepo(store, { full: opts.full ?? false });
    console.log(
      `Indexed ${result.files} files in ${result.durationMs}ms ` +
        `(parsed ${result.parsed}, cache hits ${result.cacheHits})`,
    );
    console.log(
      `  new ${result.counts['NEW']} | modified ${result.counts['MODIFIED']} | ` +
        `unchanged ${result.counts['UNCHANGED']} | deleted ${result.counts['DELETED']}`,
    );
    console.log(`  symbols ${result.symbols} | edges ${result.edges} | revision ${result.revision}`);
    console.log(`  db: ${graphDbPath(store.repoRoot)}`);
    if (opts.stats) {
      printStats(store);
    }
  } finally {
    store.db.close();
  }
}

export async function runGraphStats(repo: string): Promise<void> {
  const store = openGraphDb(repo);
  try {
    printStats(store);
  } finally {
    store.db.close();
  }
}

function printStats(store: ReturnType<typeof openGraphDb>): void {
  const stats = graphStats(store);
  console.log(`Graph: ${stats.files} files, ${stats.symbols} symbols, ${stats.edges} edges (revision ${stats.revision})`);
  console.log('  symbols by kind:');
  for (const [kind, n] of Object.entries(stats.symbolsByKind)) {
    console.log(`    ${kind.padEnd(12)} ${n}`);
  }
  console.log('  edges by type:');
  for (const [type, n] of Object.entries(stats.edgesByType)) {
    console.log(`    ${type.padEnd(12)} ${n}`);
  }
  console.log(`  estimated signature tokens: ~${stats.estimatedGraphTokens}`);
}
