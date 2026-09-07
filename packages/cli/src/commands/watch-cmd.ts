import { createWatcher } from '@setsu-ai/core';
import { openGraphDb } from '@setsu-ai/storage';
import { indexRepo } from '@setsu-ai/graph';

export async function runWatch(opts: { repo: string }): Promise<void> {
  const store = openGraphDb(opts.repo);
  const initial = await indexRepo(store);
  console.log(
    `Watching ${store.repoRoot} (${initial.files} files, ${initial.symbols} symbols, revision ${initial.revision})`,
  );

  const watcher = createWatcher();
  let running = false;
  let queued = false;

  const reindex = async (changedPaths: string[]): Promise<void> => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      const result = await indexRepo(store);
      const changed = result.counts['NEW']! + result.counts['MODIFIED']! + result.counts['DELETED']!;
      if (changed > 0) {
        console.log(
          `[${new Date().toISOString()}] ${changedPaths.length} fs events -> ` +
            `${changed} files reindexed in ${result.durationMs}ms (revision ${result.revision})`,
        );
      }
    } catch (err) {
      console.error(`reindex failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      running = false;
      if (queued) {
        queued = false;
        void reindex([]);
      }
    }
  };

  watcher.onChange((change) => void reindex(change.paths));
  await watcher.start(store.repoRoot);

  const shutdown = async (): Promise<void> => {
    await watcher.stop();
    store.db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  // Keep the process alive until interrupted.
  await new Promise(() => {});
}
