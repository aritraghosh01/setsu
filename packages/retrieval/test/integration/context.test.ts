import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGraphDb, type GraphStore } from '@setsu-ai/storage';
import { indexRepo } from '@setsu-ai/graph';
import { buildContext } from '@setsu-ai/retrieval';

const here = dirname(fileURLToPath(import.meta.url));
const TS_SAMPLE = join(here, '..', '..', '..', '..', 'fixtures', 'ts-sample');

let repo: string;
let store: GraphStore;

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), 'setsu-ctx-'));
  await cp(TS_SAMPLE, repo, { recursive: true });
  store = openGraphDb(repo, ':memory:');
  await indexRepo(store);
});

afterAll(async () => {
  store.db.close();
  await rm(repo, { recursive: true, force: true });
});

function evidenceFiles(pack: { evidence: Array<{ file?: string }> }): string[] {
  return [...new Set(pack.evidence.map((e) => e.file).filter((f): f is string => !!f))];
}

describe('setsu context routes (one per spec section 7 class)', () => {
  it('known symbol: finds callers context for UserService.findUser', async () => {
    const { pack, explain } = await buildContext(store, 'Where is UserService.findUser called?');
    expect(explain.taskClass).toBe('symbol_lookup');
    expect(pack.budget.usedEstimatedTokens).toBeLessThanOrEqual(pack.budget.maxEstimatedTokens);
    const text = pack.evidence.map((e) => e.text).join('\n');
    expect(text).toContain('UserService.findUser');
    // Callers appear in the neighborhood evidence.
    expect(text).toMatch(/CheckoutService\.checkout|AuthService\.authenticate/);
  });

  it('architecture flow: path from checkout to the Stripe adapter', async () => {
    const { pack } = await buildContext(
      store,
      'How does CheckoutController reach the StripeAdapter?',
      { budget: 1500 },
    );
    expect(pack.budget.usedEstimatedTokens).toBeLessThanOrEqual(1500);
    const pathEv = pack.evidence.find((e) => e.kind === 'graph_path');
    expect(pathEv).toBeDefined();
    expect(pathEv!.text).toContain('CheckoutController');
    expect(pathEv!.text).toContain('StripeAdapter');
    expect(pack.graph!.paths.length).toBeGreaterThan(0);
  });

  it('unknown concept: lexical route finds idempotency handling', async () => {
    const { pack, explain } = await buildContext(store, 'Where is idempotency handled?', {
      budget: 1200,
    });
    expect(pack.budget.usedEstimatedTokens).toBeLessThanOrEqual(1200);
    const files = evidenceFiles(pack);
    expect(files).toContain('src/payments/stripe-adapter.ts');
    expect(['lexical', 'hybrid', 'graph']).toContain(explain.strategy);
  });

  it('refactor: blast radius of CustomerStatus reaches validation', async () => {
    const { pack, explain } = await buildContext(store, 'What breaks if I change CustomerStatus?');
    expect(explain.taskClass).toBe('refactor');
    const text = pack.evidence.map((e) => e.text).join('\n');
    expect(text).toContain('validation');
  });

  it('orientation: repo map within budget', async () => {
    const { pack, explain } = await buildContext(store, 'Explain this repository', { budget: 800 });
    expect(explain.strategy).toBe('repo_map');
    expect(pack.budget.usedEstimatedTokens).toBeLessThanOrEqual(800);
    const map = pack.evidence.find((e) => e.kind === 'file_summary');
    expect(map).toBeDefined();
    expect(map!.text).toContain('Repository map');
  });

  it('every pack carries schemaVersion, graphRevision and quality', async () => {
    const { pack } = await buildContext(store, 'How does auth work?');
    expect(pack.schemaVersion).toBe(1);
    expect(pack.graphRevision).toBeGreaterThan(0);
    expect(pack.quality.confidence).toBeGreaterThan(0);
    expect(['low', 'medium', 'high']).toContain(pack.quality.completeness);
  });

  it('persists packs for learning', () => {
    const rows = store.db.all(`SELECT id FROM context_packs`);
    expect(rows.length).toBeGreaterThanOrEqual(6);
  });
});
