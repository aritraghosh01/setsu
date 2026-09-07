#!/usr/bin/env node
import { Command } from 'commander';
import { runInit } from './commands/init.js';

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
  .description('Initialize SETSU for this repository (creates .setsu/)')
  .option('--repo <root>', 'repository root', process.cwd())
  .action(async (opts: { repo: string }) => {
    await runInit(opts.repo);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
