import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fg from 'fast-glob';
import { parseSource, type ParseArtifact } from '@setsu-ai/parsers';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, '..', '..', '..', '..', 'fixtures', 'ts-sample');
const GOLDEN = join(here, '..', 'golden', 'ts-sample.expected.json');

describe('typescript extractor golden (ts-sample)', async () => {
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<string, ParseArtifact>;
  const files = (await fg('**/*.ts', { cwd: FIXTURE })).sort();

  it('covers exactly the fixture files', () => {
    expect(files).toEqual(Object.keys(golden).sort());
  });

  for (const file of Object.keys(golden)) {
    it(`extracts ${file} exactly as recorded`, async () => {
      const source = readFileSync(join(FIXTURE, file), 'utf8');
      const artifact = await parseSource(source, 'typescript');
      expect(artifact).toEqual(golden[file]);
    });
  }
});

describe('typescript extractor invariants', () => {
  it('captures the checkout call chain symbols', async () => {
    const source = readFileSync(join(FIXTURE, 'src/checkout/service.ts'), 'utf8');
    const art = await parseSource(source, 'typescript');
    const names = art.symbols.map((s) => s.qualifiedName);
    expect(names).toContain('CheckoutService');
    expect(names).toContain('CheckoutService.checkout');
    const calls = art.relations.filter((r) => r.type === 'calls').map((r) => r.toName);
    expect(calls).toContain('validateOrder');
    expect(calls).toContain('charge');
  });

  it('records implements relations with provenance-ready names', async () => {
    const source = readFileSync(join(FIXTURE, 'src/payments/stripe-adapter.ts'), 'utf8');
    const art = await parseSource(source, 'typescript');
    const impl = art.relations.find((r) => r.type === 'implements');
    expect(impl).toMatchObject({ fromSymbol: 'StripeAdapter', toName: 'PaymentGateway' });
  });

  it('never throws on malformed input and flags errors', async () => {
    const art = await parseSource('clazz Broken {{{ def function (', 'typescript');
    expect(art.hadErrors).toBe(true);
    expect(Array.isArray(art.symbols)).toBe(true);
  });

  it('parses javascript and tsx with the same pipeline', async () => {
    const js = await parseSource('export function hello(name) { return greet(name); }', 'javascript');
    expect(js.symbols[0]).toMatchObject({ name: 'hello', kind: 'function', exported: true });
    expect(js.relations.some((r) => r.type === 'calls' && r.toName === 'greet')).toBe(true);

    const tsx = await parseSource(
      'export const App = () => { return render(); };',
      'tsx',
    );
    expect(tsx.symbols[0]).toMatchObject({ name: 'App', kind: 'function', exported: true });
  });
});
