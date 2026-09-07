import { openGraphDb } from '@setsu-ai/storage';
import { buildContext, type ContextOptions } from '@setsu-ai/retrieval';

export interface ContextCmdOptions {
  repo: string;
  budget?: string;
  json?: boolean;
  explain?: boolean;
  mode?: string;
}

export async function runContext(query: string, opts: ContextCmdOptions): Promise<void> {
  const store = openGraphDb(opts.repo);
  try {
    const options: ContextOptions = {};
    if (opts.budget !== undefined) options.budget = Number(opts.budget);
    if (opts.mode !== undefined) {
      options.mode = opts.mode as NonNullable<ContextOptions['mode']>;
    }
    const { pack, explain } = await buildContext(store, query, options);

    if (opts.json) {
      console.log(JSON.stringify({ ...pack, evidenceQuality: pack.quality }, null, 2));
      return;
    }

    if (opts.explain) {
      console.log('QUERY CLASS');
      console.log(`  ${explain.taskClass}`);
      console.log('STRATEGY');
      console.log(`  ${explain.strategy}`);
      console.log('SEEDS');
      for (const seed of explain.seeds) console.log(`  ${seed}`);
      if (explain.seeds.length === 0) console.log('  (none — lexical/map fallback)');
      console.log('EVIDENCE');
      console.log(`  ${explain.candidateCount} candidates, ${explain.packedCount} selected, ${explain.omittedCount} omitted`);
      console.log('TOKEN BUDGET');
      console.log(`  ${explain.budget} budget, ~${explain.usedTokens} used (estimated)`);
      console.log('');
    }

    for (const item of pack.evidence) {
      console.log(`--- ${item.kind}${item.file ? ` ${item.file}:${item.startLine ?? ''}` : ''} [${item.provenance}, relevance ${item.relevance.toFixed(2)}]`);
      console.log(item.text);
    }
    console.log('');
    console.log(
      `Strategy: ${pack.strategy} | evidence: ${pack.evidence.length} items | ` +
        `~${pack.budget.usedEstimatedTokens}/${pack.budget.maxEstimatedTokens} estimated tokens | ` +
        `confidence: ${pack.quality.confidence >= 0.85 ? 'HIGH' : pack.quality.confidence >= 0.55 ? 'MEDIUM' : 'LOW'} | ` +
        `graph revision: ${pack.graphRevision}`,
    );
  } finally {
    store.db.close();
  }
}
