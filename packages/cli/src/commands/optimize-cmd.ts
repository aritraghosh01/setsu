import { join } from 'node:path';
import { planOptimizations, changesFor, applyChanges, renderDiff } from '@setsu-ai/agents';
import { setsuHome } from '@setsu-ai/storage';

export interface OptimizeOptions {
  repo: string;
  dryRun?: boolean;
  apply?: boolean;
}

export async function runOptimize(opts: OptimizeOptions): Promise<void> {
  const plan = await planOptimizations(opts.repo);
  if (plan.recommendations.length === 0) {
    console.log('No optimizations recommended. Setup looks healthy.');
    return;
  }

  console.log(`Recommendations (${plan.recommendations.length}):`);
  for (const rec of plan.recommendations) {
    const tag = rec.applicable ? 'auto' : 'advisory';
    console.log(`  [${tag}] ${rec.type} -> ${rec.target}`);
    console.log(`         ${rec.description}`);
  }
  console.log('');

  const changes = await changesFor(opts.repo, plan.recommendations);
  if (changes.length === 0) {
    console.log('Nothing to apply automatically. Advisory items are yours to act on.');
    return;
  }

  if (opts.dryRun) {
    console.log('Dry run — these files would change:');
    for (const change of changes) {
      console.log(renderDiff(change));
    }
    console.log('Run `setsu optimize --apply` to apply with backup + rollback.');
    return;
  }

  if (!opts.apply) {
    console.log(`${changes.length} change(s) available. Preview with --dry-run, apply with --apply.`);
    return;
  }

  const result = await applyChanges(opts.repo, changes, join(setsuHome(), 'backups'));
  if (result.rolledBack) {
    console.error(`Apply failed and was rolled back: ${result.error}`);
    console.error(`Originals preserved in ${result.backupDir}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Applied ${result.applied.length} change(s): ${result.applied.join(', ')}`);
  console.log(`Backups: ${result.backupDir}`);
}
