import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, cp, rm, readdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..', '..', '..');
const TS_SAMPLE = join(ROOT, 'fixtures', 'ts-sample');

let stage: string;
let home: string;

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function npm(args: string[], cwd: string): string {
  return execFileSync(npmCmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
}

beforeAll(async () => {
  stage = await mkdtemp(join(tmpdir(), 'setsu-pack-'));
  home = await mkdtemp(join(tmpdir(), 'setsu-pack-home-'));
}, 60_000);

afterAll(async () => {
  await rm(stage, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

describe('npm pack e2e — the published tarball works', () => {
  it('packs, installs into a clean dir, and runs init/index/context', async () => {
    npm(['run', 'build'], ROOT);
    npm(['pack', '-w', 'packages/cli', '--pack-destination', stage], ROOT);
    const tarball = (await readdir(stage)).find((f) => f.endsWith('.tgz'));
    expect(tarball).toBeDefined();

    npm(['init', '-y'], stage);
    npm(['install', join(stage, tarball!)], stage);

    // Grammar wasm must survive packaging.
    const wasmDir = join(stage, 'node_modules', '@setsu-ai', 'cli', 'wasm');
    await access(join(wasmDir, 'tree-sitter-typescript.wasm'));
    await access(join(wasmDir, 'tree-sitter-python.wasm'));

    const workspace = join(stage, 'repo');
    await cp(TS_SAMPLE, workspace, { recursive: true });

    const setsuJs = join(stage, 'node_modules', '@setsu-ai', 'cli', 'dist', 'setsu.js');
    const env = { ...process.env, SETSU_HOME: home };

    const initOut = execFileSync(process.execPath, [setsuJs, 'init', '--repo', workspace], {
      encoding: 'utf8',
      env,
    });
    expect(initOut).toContain('SETSU');
    expect(initOut).toContain('symbols');

    const contextOut = execFileSync(
      process.execPath,
      [setsuJs, 'context', 'How does checkout reach the payment gateway?', '--repo', workspace],
      { encoding: 'utf8', env },
    );
    expect(contextOut).toContain('StripeAdapter');
    expect(contextOut).toContain('estimated tokens');
  }, 300_000);
});
