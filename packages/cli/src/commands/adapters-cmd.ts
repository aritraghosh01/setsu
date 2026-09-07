import { discoverAll } from '@setsu-ai/agents';

export async function runAdapters(opts: { repo: string }): Promise<void> {
  const inventories = await discoverAll(opts.repo);
  for (const inv of inventories) {
    const mark = inv.detection.detected ? '✓' : '·';
    const tokens = inv.instructions.reduce((n, i) => n + i.estimatedTokens, 0);
    console.log(
      `${mark} ${inv.detection.agent.padEnd(8)} instructions: ${inv.instructions.length}` +
        ` (~${tokens} tokens) | skills: ${inv.skills.length} | mcp configs: ${inv.mcp.length}`,
    );
    for (const instruction of inv.instructions) {
      console.log(
        `    ${instruction.path}  [${instruction.currentMode}] ~${instruction.estimatedTokens} tokens` +
          (instruction.pathPatterns ? `  (${instruction.pathPatterns.join(', ')})` : ''),
      );
    }
  }
}
