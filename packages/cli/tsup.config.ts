import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  entry: { setsu: 'src/setsu.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  dts: false,
  sourcemap: true,
  noExternal: [/^@setsu-ai\//],
  define: {
    __SETSU_VERSION__: JSON.stringify(pkg.version),
  },
});
