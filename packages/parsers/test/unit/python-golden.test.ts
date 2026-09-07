import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fg from 'fast-glob';
import { parseSource, type ParseArtifact } from '@setsu-ai/parsers';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, '..', '..', '..', '..', 'fixtures', 'py-sample');
const GOLDEN = join(here, '..', 'golden', 'py-sample.expected.json');

describe('python extractor golden (py-sample)', async () => {
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<string, ParseArtifact>;
  const files = (await fg('**/*.py', { cwd: FIXTURE })).sort();

  it('covers exactly the fixture files', () => {
    expect(files).toEqual(Object.keys(golden).sort());
  });

  for (const file of Object.keys(golden)) {
    it(`extracts ${file} exactly as recorded`, async () => {
      const source = readFileSync(join(FIXTURE, file), 'utf8');
      const artifact = await parseSource(source, 'python');
      expect(artifact).toEqual(golden[file]);
    });
  }
});

describe('python extractor invariants', () => {
  it('captures classes, methods, docstrings and self-call names', async () => {
    const source = readFileSync(join(FIXTURE, 'app/services/payment.py'), 'utf8');
    const art = await parseSource(source, 'python');
    const byName = new Map(art.symbols.map((s) => [s.qualifiedName, s]));
    expect(byName.get('PaymentService')?.kind).toBe('class');
    expect(byName.get('PaymentService')?.doc).toContain('Validates then charges');
    expect(byName.get('PaymentService.pay_invoice')?.kind).toBe('method');
    const calls = art.relations.filter((r) => r.type === 'calls').map((r) => r.toName);
    expect(calls).toContain('_idempotency_key'); // self. stripped
    expect(calls).toContain('validate_invoice');
  });

  it('does not emit function locals as symbols', async () => {
    const source = readFileSync(join(FIXTURE, 'app/routes.py'), 'utf8');
    const art = await parseSource(source, 'python');
    expect(art.symbols.map((s) => s.qualifiedName)).toEqual([
      'build_services',
      'handle_pay',
      'handle_login',
    ]);
  });

  it('records extends for enum subclassing', async () => {
    const source = readFileSync(join(FIXTURE, 'app/models.py'), 'utf8');
    const art = await parseSource(source, 'python');
    const ext = art.relations.find((r) => r.type === 'extends');
    expect(ext).toMatchObject({ fromSymbol: 'CustomerStatus', toName: 'Enum' });
  });
});
