import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGraphDb, type GraphStore } from '@setsu-ai/storage';
import {
  indexRepo,
  GraphView,
  findNodes,
  shortestPath,
  callers,
  impact,
  communityOf,
  topRanked,
} from '@setsu-ai/graph';

const here = dirname(fileURLToPath(import.meta.url));
const TS_SAMPLE = join(here, '..', '..', '..', '..', 'fixtures', 'ts-sample');

let repo: string;
let store: GraphStore;
let view: GraphView;

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), 'setsu-q-'));
  await cp(TS_SAMPLE, repo, { recursive: true });
  store = openGraphDb(repo, ':memory:');
  await indexRepo(store);
  view = GraphView.load(store);
});

afterAll(async () => {
  store.db.close();
  await rm(repo, { recursive: true, force: true });
});

describe('findNodes', () => {
  it('exact qualified name wins', () => {
    const hits = findNodes(store, 'CheckoutService.checkout');
    expect(hits[0]).toMatchObject({ qualifiedName: 'CheckoutService.checkout', kind: 'method' });
  });

  it('name lookup finds classes', () => {
    const hits = findNodes(store, 'StripeAdapter');
    expect(hits[0]).toMatchObject({ kind: 'class', path: 'src/payments/stripe-adapter.ts' });
  });
});

describe('shortestPath', () => {
  it('connects CheckoutController to StripeAdapter through the call chain', () => {
    const from = findNodes(store, 'CheckoutController')[0]!;
    const to = findNodes(store, 'StripeAdapter')[0]!;
    const path = shortestPath(view, from.id, to.id);
    expect(path).toBeDefined();
    const names = path!.map((s) => s.node.qualifiedName);
    expect(names[0]).toBe('CheckoutController');
    expect(names[names.length - 1]).toBe('StripeAdapter');
    expect(path!.length).toBeLessThanOrEqual(7);
  });

  it('returns undefined when nodes are unreachable within depth', () => {
    const from = findNodes(store, 'CheckoutController')[0]!;
    const to = findNodes(store, 'StripeAdapter')[0]!;
    const path = shortestPath(view, from.id, to.id, { maxDepth: 1 });
    expect(path).toBeUndefined();
  });
});

describe('callers and impact', () => {
  it('finds callers of validateOrder', () => {
    const target = findNodes(store, 'validateOrder')[0]!;
    const hits = callers(view, target.id);
    expect(hits.map((h) => h.node.qualifiedName)).toContain('CheckoutService.checkout');
  });

  it('impact of CustomerStatus reaches validation and tests', () => {
    const target = findNodes(store, 'CustomerStatus')[0]!;
    const result = impact(view, target.id);
    expect(result.filesAffected.length).toBeGreaterThan(0);
    expect(result.filesAffected).toContain('src/orders/validation.ts');
    expect(result.tests.length).toBeGreaterThan(0);
  });
});

describe('communities and centrality', () => {
  it('assigns every symbol a community', () => {
    const node = findNodes(store, 'CheckoutService')[0]!;
    const info = communityOf(store, view, node.id);
    expect(info).toBeDefined();
    expect(info!.members.length).toBeGreaterThan(1);
  });

  it('topRanked returns central nodes', () => {
    const top = topRanked(store, view, 10);
    expect(top.length).toBe(10);
    expect(top[0]!.rank).toBeGreaterThan(0);
    // Heavily-imported model/module files should rank near the top.
    const paths = top.map((t) => t.node.path);
    expect(paths.some((p) => p.includes('model') || p.includes('gateway') || p.includes('repository'))).toBe(true);
  });
});
