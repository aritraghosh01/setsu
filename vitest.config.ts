import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const alias = {
  '@setsu-ai/core': r('./packages/core/src/index.ts'),
  '@setsu-ai/storage': r('./packages/storage/src/index.ts'),
  '@setsu-ai/parsers': r('./packages/parsers/src/index.ts'),
  '@setsu-ai/graph': r('./packages/graph/src/index.ts'),
  '@setsu-ai/retrieval': r('./packages/retrieval/src/index.ts'),
  '@setsu-ai/agents': r('./packages/agents/src/index.ts'),
  '@setsu-ai/learning': r('./packages/learning/src/index.ts'),
  '@setsu-ai/mcp': r('./packages/mcp/src/index.ts'),
};

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/test/unit/**/*.test.ts'],
          alias,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['packages/*/test/integration/**/*.test.ts'],
          alias,
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['packages/*/test/e2e/**/*.test.ts', 'benchmarks/**/*.e2e.test.ts'],
          alias,
          testTimeout: 300_000,
        },
      },
    ],
  },
});
