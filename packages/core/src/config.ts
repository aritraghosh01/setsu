import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Project config schema, spec section 98. */
export const SetsuConfigSchema = z.object({
  version: z.literal(1),
  index: z
    .object({
      enabled: z.boolean().default(true),
      watch: z.boolean().default(true),
      semantic: z.boolean().default(false),
    })
    .default({}),
  retrieval: z
    .object({
      defaultBudget: z.number().int().positive().default(1500),
      strategy: z.enum(['auto', 'graph', 'lsp', 'lexical', 'semantic', 'repo_map']).default('auto'),
    })
    .default({}),
  learning: z
    .object({
      enabled: z.boolean().default(true),
      storeRawPrompts: z.boolean().default(false),
      retentionDays: z.number().int().positive().default(90),
    })
    .default({}),
  privacy: z
    .object({
      network: z.boolean().default(false),
      memoryProvider: z.string().default('none'),
    })
    .default({}),
  mcp: z
    .object({
      minimalToolSurface: z.boolean().default(true),
    })
    .default({}),
});

export type SetsuConfig = z.infer<typeof SetsuConfigSchema>;

export const DEFAULT_CONFIG: SetsuConfig = SetsuConfigSchema.parse({ version: 1 });

export async function loadConfig(repoRoot: string): Promise<SetsuConfig> {
  try {
    const raw = await readFile(join(repoRoot, '.setsu', 'config.json'), 'utf8');
    return SetsuConfigSchema.parse(JSON.parse(raw));
  } catch {
    return DEFAULT_CONFIG;
  }
}
