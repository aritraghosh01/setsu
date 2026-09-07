import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { confirm } from '@inquirer/prompts';
import { DEFAULT_CONFIG } from '@setsu-ai/core';
import { openGraphDb } from '@setsu-ai/storage';
import { indexRepo } from '@setsu-ai/graph';
import { discoverAll, installAll } from '@setsu-ai/agents';

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export interface InitCmdOptions {
  repo: string;
  yes?: boolean;
  mcp?: boolean;
  guidance?: boolean;
  skipIndex?: boolean;
}

export interface InitResult {
  setsuDir: string;
  createdConfig: boolean;
}

/** Full first-run flow, spec section 48. */
export async function runInit(repoRoot: string, opts: Partial<InitCmdOptions> = {}): Promise<InitResult> {
  const setsuDir = join(repoRoot, '.setsu');
  await mkdir(setsuDir, { recursive: true });

  const configPath = join(setsuDir, 'config.json');
  let createdConfig = false;
  if (!(await exists(configPath))) {
    await writeFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n', 'utf8');
    createdConfig = true;
  }
  const gitignorePath = join(setsuDir, '.gitignore');
  if (!(await exists(gitignorePath))) {
    // Local caches under .setsu/ must never be committed (spec section 99).
    await writeFile(gitignorePath, 'cache/\n*.db\n*.db-*\n', 'utf8');
  }

  console.log('SETSU');
  console.log('');

  const inventories = await discoverAll(repoRoot);
  const detected = inventories.filter((inv) => inv.detection.detected);
  console.log('Detected:');
  if (detected.length === 0) {
    console.log('  (no agent configs found yet)');
  }
  for (const inv of detected) {
    console.log(`  ✓ ${inv.detection.agent} (${inv.detection.markers.join(', ')})`);
  }
  console.log('');

  if (!opts.skipIndex) {
    const store = openGraphDb(repoRoot);
    try {
      const result = await indexRepo(store);
      console.log('Index:');
      console.log(`  ${result.files} files`);
      console.log(`  ${result.symbols} symbols`);
      console.log(`  ${result.edges} relationships`);
      console.log('');
    } finally {
      store.db.close();
    }
  }

  const interactive = process.stdout.isTTY === true && opts.yes !== true;
  let installMcp = opts.mcp ?? opts.yes ?? false;
  let installGuidance = opts.guidance ?? opts.yes ?? false;
  if (interactive && opts.mcp === undefined && opts.guidance === undefined) {
    installMcp = await confirm({
      message: 'Install the SETSU MCP server for detected agents?',
      default: true,
    });
    installGuidance = await confirm({
      message: 'Add graph-first guidance to agent instruction files?',
      default: true,
    });
  }
  if (installMcp || installGuidance) {
    const changed = await installAll(repoRoot, { mcp: installMcp, guidance: installGuidance });
    for (const [agent, files] of Object.entries(changed)) {
      console.log(`  ${agent}: updated ${files.join(', ')}`);
    }
    if (Object.keys(changed).length === 0) console.log('  (already installed)');
    console.log('');
  }

  console.log('Source-code processing: local only. Nothing leaves this machine.');
  console.log('Data locations: .setsu/ (project config), ~/.setsu/ (local graph + usage).');
  console.log('Inspect or purge anytime: setsu privacy inspect | setsu privacy purge');
  return { setsuDir, createdConfig };
}
