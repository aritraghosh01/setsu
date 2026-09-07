import { defineConfig } from 'tsup';
import { readFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  entry: { setsu: 'src/setsu.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  dts: false,
  sourcemap: true,
  noExternal: [/^@setsu-ai\//],
  // tsup strips node: prefixes by default, which breaks node:sqlite
  // (only importable with the prefix).
  removeNodeProtocol: false,
  define: {
    __SETSU_VERSION__: JSON.stringify(pkg.version),
  },
  async onSuccess() {
    // Ship grammar wasm next to dist so the bundle's ../wasm lookup works
    // both in the workspace and in the published package.
    const src = join(here, '..', 'parsers', 'wasm');
    const dest = join(here, 'wasm');
    mkdirSync(dest, { recursive: true });
    for (const file of readdirSync(src)) {
      if (file.endsWith('.wasm')) copyFileSync(join(src, file), join(dest, file));
    }
  },
});
