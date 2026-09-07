import { join } from 'node:path';
import { readText } from './shared.js';
import { upsertManagedBlock } from './managed-block.js';
import type { FileChange } from './safe-apply.js';
import type { Recommendation } from './optimizer.js';

const CURSOR_RULE = `---
description: Use SETSU code intelligence for repository-wide questions
alwaysApply: true
---

For repository-wide questions, use SETSU code intelligence before broad raw-file search.
Call the \`setsu_context\` MCP tool with the task or question; it returns a token-budgeted
evidence pack (symbols, snippets, graph paths). Read full files only when the returned
evidence is insufficient.
`;

function mcpChange(before: string | undefined): string {
  let config: { mcpServers?: Record<string, unknown> } = {};
  if (before) {
    try {
      config = JSON.parse(before) as typeof config;
    } catch {
      config = {};
    }
  }
  config.mcpServers ??= {};
  config.mcpServers['setsu'] = { command: 'setsu', args: ['mcp', 'serve', '--repo', '.'] };
  return JSON.stringify(config, null, 2) + '\n';
}

/** Turn applicable recommendations into concrete file changes (spec s97 input). */
export async function changesFor(
  repoRoot: string,
  recommendations: readonly Recommendation[],
): Promise<FileChange[]> {
  const changes: FileChange[] = [];
  for (const rec of recommendations) {
    if (!rec.applicable) continue;
    const before = await readText(join(repoRoot, rec.target));
    if (rec.type === 'install_guidance') {
      const after = rec.agent === 'cursor' ? CURSOR_RULE : upsertManagedBlock(before ?? '');
      if (after !== before) changes.push({ path: rec.target, before, after });
    } else if (rec.type === 'register_mcp') {
      const after = mcpChange(before);
      if (after !== before) {
        changes.push({
          path: rec.target,
          before,
          after,
          validate: (content) => {
            JSON.parse(content);
          },
        });
      }
    }
  }
  return changes;
}
