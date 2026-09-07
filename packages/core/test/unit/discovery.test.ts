import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverFiles } from '@setsu-ai/core';

let repo: string;

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), 'setsu-disc-'));
  await mkdir(join(repo, 'src'), { recursive: true });
  await mkdir(join(repo, 'node_modules', 'pkg'), { recursive: true });
  await mkdir(join(repo, 'dist'), { recursive: true });
  await writeFile(join(repo, 'src', 'index.ts'), 'export const x = 1;\n');
  await writeFile(join(repo, 'src', 'app.py'), 'x = 1\n');
  await writeFile(join(repo, 'README.md'), '# hi\n');
  await writeFile(join(repo, 'node_modules', 'pkg', 'index.js'), 'module.exports = 1;\n');
  await writeFile(join(repo, 'dist', 'out.js'), 'var x = 1;\n');
  await writeFile(join(repo, '.env'), 'SECRET=1\n');
  await writeFile(join(repo, 'server.key'), 'PRIVATE\n');
  await writeFile(join(repo, 'ignored.txt'), 'x\n');
  await writeFile(join(repo, '.gitignore'), 'ignored.txt\n');
});

afterAll(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe('discoverFiles', () => {
  it('excludes defaults, secrets, and gitignored files', async () => {
    const files = await discoverFiles(repo);
    const paths = files.map((f) => f.path);
    expect(paths).toContain('src/index.ts');
    expect(paths).toContain('src/app.py');
    expect(paths).toContain('README.md');
    expect(paths).toContain('.gitignore');
    expect(paths).not.toContain('node_modules/pkg/index.js');
    expect(paths).not.toContain('dist/out.js');
    expect(paths).not.toContain('.env');
    expect(paths).not.toContain('server.key');
    expect(paths).not.toContain('ignored.txt');
  });

  it('labels languages and returns sorted posix paths', async () => {
    const files = await discoverFiles(repo);
    const ts = files.find((f) => f.path === 'src/index.ts');
    expect(ts?.language).toBe('typescript');
    const sorted = [...files.map((f) => f.path)].sort();
    expect(files.map((f) => f.path)).toEqual(sorted);
    expect(files.every((f) => !f.path.includes('\\'))).toBe(true);
  });
});
