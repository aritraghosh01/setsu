import { existsSync, readdirSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { setsuHome, openUsageDb } from '@setsu-ai/storage';

/** Privacy surface, spec sections 68-69. Everything is local; this proves it. */

export interface StoredCategory {
  category: string;
  location: string;
  present: boolean;
  bytes: number;
  note: string;
}

function sizeOf(path: string): number {
  try {
    const stat = statSync(path);
    if (stat.isFile()) return stat.size;
    let total = 0;
    for (const entry of readdirSync(path)) total += sizeOf(join(path, entry));
    return total;
  } catch {
    return 0;
  }
}

export function inspectStorage(): StoredCategory[] {
  const home = setsuHome();
  const categories: Array<[string, string, string]> = [
    ['code graph (rebuildable)', join(home, 'repos'), 'symbols, relative paths, relationships, hashes, FTS text of your source'],
    ['usage + learning', join(home, 'setsu.db'), 'derived task classes, strategy outcomes, recommendation history, token estimates'],
    ['per-device salt', join(home, 'salt'), 'random salt for hashing task terms; never leaves this machine'],
    ['optimize backups', join(home, 'backups'), 'pre-change copies of agent config files'],
    ['logs', join(home, 'logs'), 'local diagnostics (if any)'],
  ];
  return categories.map(([category, location, note]) => ({
    category,
    location,
    present: existsSync(location),
    bytes: sizeOf(location),
    note,
  }));
}

export const NOT_STORED = [
  'raw prompts',
  'raw model responses',
  'secrets or environment values',
  'credentials',
  'anything transmitted off this machine',
];

export interface PurgeOptions {
  graphs?: boolean;
  usage?: boolean;
  backups?: boolean;
  salt?: boolean;
}

export async function purge(opts: PurgeOptions): Promise<string[]> {
  const home = setsuHome();
  const removed: string[] = [];
  const targets: Array<[keyof PurgeOptions, string]> = [
    ['graphs', join(home, 'repos')],
    ['usage', join(home, 'setsu.db')],
    ['backups', join(home, 'backups')],
    ['salt', join(home, 'salt')],
  ];
  for (const [key, path] of targets) {
    if (opts[key] && existsSync(path)) {
      await rm(path, { recursive: true, force: true });
      removed.push(path);
    }
  }
  return removed;
}

/** Consent flags for future memory scopes (spec section 71). All off by default. */
export function consentStatus(): Record<string, boolean> {
  const db = openUsageDb();
  try {
    const rows = db.all<{ key: string; value: string }>(
      `SELECT key, value FROM meta WHERE key LIKE 'consent:%'`,
    );
    const status: Record<string, boolean> = {};
    for (const row of rows) status[row.key.slice('consent:'.length)] = row.value === 'true';
    return status;
  } finally {
    db.close();
  }
}

export function setConsent(scope: string, granted: boolean): void {
  const db = openUsageDb();
  try {
    db.run(
      `INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      `consent:${scope}`,
      granted ? 'true' : 'false',
    );
  } finally {
    db.close();
  }
}
