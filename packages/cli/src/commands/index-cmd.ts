import { discoverFiles } from '@setsu-ai/core';
import {
  openGraphDb,
  classifyFiles,
  applyFileChanges,
  bumpGraphRevision,
  getGraphRevision,
  graphDbPath,
} from '@setsu-ai/storage';

export interface IndexOptions {
  repo: string;
  stats?: boolean;
  full?: boolean;
}

export async function runIndex(opts: IndexOptions): Promise<void> {
  const started = Date.now();
  const store = openGraphDb(opts.repo);
  try {
    if (opts.full) {
      store.db.transaction(() => {
        store.db.run(`DELETE FROM files WHERE repo_id = ?`, store.repoId);
        store.db.run(`DELETE FROM symbols WHERE repo_id = ?`, store.repoId);
        store.db.run(`DELETE FROM edges WHERE repo_id = ?`, store.repoId);
      });
    }

    const discovered = await discoverFiles(store.repoRoot);
    const plan = await classifyFiles(store.db, store.repoId, store.repoRoot, discovered);

    const changed = plan.counts.NEW + plan.counts.MODIFIED + plan.counts.DELETED;
    store.db.transaction(() => {
      applyFileChanges(store.db, store.repoId, plan);
      if (changed > 0) bumpGraphRevision(store.db);
    });

    const byLanguage = new Map<string, number>();
    for (const f of discovered) {
      const lang = f.language ?? 'other';
      byLanguage.set(lang, (byLanguage.get(lang) ?? 0) + 1);
    }

    console.log(`Indexed ${discovered.length} files in ${Date.now() - started}ms`);
    console.log(
      `  new ${plan.counts.NEW} | modified ${plan.counts.MODIFIED} | unchanged ${plan.counts.UNCHANGED} | deleted ${plan.counts.DELETED}`,
    );
    console.log(`  graph revision: ${getGraphRevision(store.db)}`);
    console.log(`  db: ${graphDbPath(store.repoRoot)}`);

    if (opts.stats) {
      const langs = [...byLanguage.entries()].sort((a, b) => b[1] - a[1]);
      console.log('  languages:');
      for (const [lang, count] of langs) console.log(`    ${lang.padEnd(12)} ${count}`);
    }
  } finally {
    store.db.close();
  }
}
