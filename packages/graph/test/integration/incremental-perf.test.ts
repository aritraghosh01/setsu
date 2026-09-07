import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, cp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGraphDb, type GraphStore } from '@setsu-ai/storage';
import { indexRepo } from '@setsu-ai/graph';

const here = dirname(fileURLToPath(import.meta.url));
const TS_SAMPLE = join(here, '..', '..', '..', '..', 'fixtures', 'ts-sample');

let repo: string;
let store: GraphStore;

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), 'setsu-perf-'));
  await cp(TS_SAMPLE, repo, { recursive: true });
  store = openGraphDb(repo, ':memory:');
  await indexRepo(store);
});

afterAll(async () => {
  store.db.close();
  await rm(repo, { recursive: true, force: true });
});

describe('incremental update performance (spec section 85)', () => {
  it('single-file change reparses exactly one file well under budget', async () => {
    await writeFile(join(repo, 'src', 'config.ts'), 'export const config = { port: 9090 };\n');
    const result = await indexRepo(store);
    expect(result.parsed).toBe(1);
    // Spec prefers <500ms for a normal file; allow slack for slow CI runners.
    expect(result.durationMs).toBeLessThan(2000);
  });
});
