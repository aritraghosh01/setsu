import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';

// Default project config per spec section 98. Written on first init; owned by
// the user afterwards (init never overwrites an existing config).
const DEFAULT_CONFIG = {
  version: 1,
  index: {
    enabled: true,
    watch: true,
    semantic: false,
  },
  retrieval: {
    defaultBudget: 1500,
    strategy: 'auto',
  },
  learning: {
    enabled: true,
    storeRawPrompts: false,
    retentionDays: 90,
  },
  privacy: {
    network: false,
    memoryProvider: 'none',
  },
  mcp: {
    minimalToolSurface: true,
  },
} as const;

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export interface InitResult {
  setsuDir: string;
  createdConfig: boolean;
}

export async function runInit(repoRoot: string): Promise<InitResult> {
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

  console.log(`SETSU initialized: ${setsuDir}`);
  console.log(createdConfig ? 'Created .setsu/config.json' : '.setsu/config.json already exists');
  console.log('Source-code processing: local only. Nothing leaves this machine.');
  return { setsuDir, createdConfig };
}
