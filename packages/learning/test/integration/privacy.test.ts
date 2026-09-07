import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectStorage, purge, setConsent, consentStatus, resetSaltCache, getSalt } from '@setsu-ai/learning';

let home: string;

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), 'setsu-priv-'));
  process.env['SETSU_HOME'] = home;
  resetSaltCache();
});

afterAll(async () => {
  delete process.env['SETSU_HOME'];
  resetSaltCache();
  await rm(home, { recursive: true, force: true });
});

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe('privacy surface (spec s68-69)', () => {
  it('inspect lists every stored category with location', () => {
    getSalt(); // materialize the salt file
    const categories = inspectStorage();
    const names = categories.map((c) => c.category);
    expect(names.some((n) => n.includes('code graph'))).toBe(true);
    expect(names.some((n) => n.includes('usage'))).toBe(true);
    expect(names.some((n) => n.includes('salt'))).toBe(true);
    const salt = categories.find((c) => c.category.includes('salt'))!;
    expect(salt.present).toBe(true);
    expect(salt.location).toContain(home);
  });

  it('consent scopes default off and can be granted/revoked', () => {
    expect(consentStatus()).toEqual({});
    setConsent('memory:read-derived-patterns', true);
    expect(consentStatus()['memory:read-derived-patterns']).toBe(true);
    setConsent('memory:read-derived-patterns', false);
    expect(consentStatus()['memory:read-derived-patterns']).toBe(false);
  });

  it('purge actually deletes the data', async () => {
    await mkdir(join(home, 'repos', 'r1'), { recursive: true });
    await writeFile(join(home, 'repos', 'r1', 'graph.db'), 'x');
    await mkdir(join(home, 'backups'), { recursive: true });

    const removed = await purge({ graphs: true, usage: true, backups: true, salt: true });
    expect(removed.length).toBeGreaterThanOrEqual(3);
    expect(await exists(join(home, 'repos'))).toBe(false);
    expect(await exists(join(home, 'salt'))).toBe(false);
    resetSaltCache();
  });
});
