import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWatcher, type RepoChange } from '@setsu-ai/core';

let repo: string;

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), 'setsu-watch-'));
  await mkdir(join(repo, 'src'), { recursive: true });
  await mkdir(join(repo, 'node_modules', 'x'), { recursive: true });
  await writeFile(join(repo, 'src', 'a.ts'), 'export const a = 1;\n');
});

afterAll(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe('createWatcher', () => {
  it('batches related edits into one debounced event and ignores node_modules', async () => {
    const watcher = createWatcher({ debounceMs: 150 });
    const batches: RepoChange[] = [];
    watcher.onChange((change) => batches.push(change));
    await watcher.start(repo);
    try {
      await writeFile(join(repo, 'src', 'a.ts'), 'export const a = 2;\n');
      await writeFile(join(repo, 'src', 'b.ts'), 'export const b = 1;\n');
      await writeFile(join(repo, 'node_modules', 'x', 'ignored.js'), 'x\n');
      await new Promise((resolve) => setTimeout(resolve, 900));

      expect(batches.length).toBe(1);
      const paths = batches[0]!.paths;
      expect(paths).toContain('src/a.ts');
      expect(paths).toContain('src/b.ts');
      expect(paths.some((p) => p.includes('node_modules'))).toBe(false);
    } finally {
      await watcher.stop();
    }
  });
});
