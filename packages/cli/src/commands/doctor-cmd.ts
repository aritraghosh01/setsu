import { join } from 'node:path';
import { discoverAll, contextTax, findDuplicates, computeEfficiencyScore, readText, type ScoreInput } from '@setsu-ai/agents';
import { discoverFiles } from '@setsu-ai/core';
import { openGraphDb, classifyFiles, getGraphRevision } from '@setsu-ai/storage';
import { graphStats } from '@setsu-ai/graph';

interface DoctorReport {
  schemaVersion: 1;
  score: ReturnType<typeof computeEfficiencyScore>;
  alwaysTokens: number;
  totalInstructionTokens: number;
  scopedTokens: number;
  duplicateTokens: number;
  duplicates: ReturnType<typeof findDuplicates>;
  tax: Array<{ path: string; agent: string; mode: string; effectiveTokens: number }>;
  graph: { ready: boolean; revision: number; files: number; symbols: number; edges: number; freshness: number };
  mcpServerCount: number;
}

export async function collectDoctorReport(repoRoot: string): Promise<DoctorReport> {
  const inventories = await discoverAll(repoRoot);
  const instructions = inventories.flatMap((inv) => inv.instructions);
  const contents = new Map<string, string>();
  for (const instruction of instructions) {
    const content = await readText(join(repoRoot, instruction.path));
    if (content !== undefined) contents.set(instruction.path, content);
  }

  const tax = contextTax(instructions);
  const duplicates = findDuplicates(instructions, contents);
  const duplicateTokens = duplicates.reduce((n, d) => n + d.estimatedTokens, 0);
  const alwaysTokens = instructions
    .filter((i) => i.currentMode === 'always')
    .reduce((n, i) => n + i.estimatedTokens, 0);
  const totalInstructionTokens = instructions.reduce((n, i) => n + i.estimatedTokens, 0);
  const scopedTokens = totalInstructionTokens - alwaysTokens;
  const mcpServerCount = inventories.reduce(
    (n, inv) => n + inv.mcp.reduce((m, c) => m + c.serverNames.length, 0),
    0,
  );

  const store = openGraphDb(repoRoot);
  let graph: DoctorReport['graph'];
  try {
    const revision = getGraphRevision(store.db);
    const stats = graphStats(store);
    let freshness = 1;
    if (revision > 0) {
      const discovered = await discoverFiles(store.repoRoot);
      const plan = await classifyFiles(store.db, store.repoId, store.repoRoot, discovered);
      const changed = plan.counts.NEW + plan.counts.MODIFIED + plan.counts.DELETED;
      freshness = discovered.length > 0 ? 1 - changed / discovered.length : 1;
    }
    graph = {
      ready: revision > 0,
      revision,
      files: stats.files,
      symbols: stats.symbols,
      edges: stats.edges,
      freshness,
    };
  } finally {
    store.db.close();
  }

  const input: ScoreInput = {
    alwaysTokens,
    totalInstructionTokens,
    scopedTokens,
    duplicateTokens,
    graphFreshness: graph.freshness,
    graphReady: graph.ready,
    mcpServerCount,
  };

  return {
    schemaVersion: 1,
    score: computeEfficiencyScore(input),
    alwaysTokens,
    totalInstructionTokens,
    scopedTokens,
    duplicateTokens,
    duplicates,
    tax: tax.map((t) => ({
      path: t.instruction.path,
      agent: t.instruction.agent,
      mode: t.instruction.currentMode,
      effectiveTokens: t.effectiveTokens,
    })),
    graph,
    mcpServerCount,
  };
}

export async function runDoctor(opts: { repo: string; json?: boolean }): Promise<void> {
  const report = await collectDoctorReport(opts.repo);
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`Context Efficiency Score: ${report.score.total}/100`);
  for (const component of report.score.components) {
    const value = component.score === undefined ? 'n/a (reweighted)' : `${component.score}`;
    console.log(`  ${component.name.padEnd(26)} ${value}`);
  }
  console.log('');
  console.log(
    `Graph: ${report.graph.ready ? 'ready' : 'NOT BUILT — run setsu index'} ` +
      `(${report.graph.symbols} symbols, ${report.graph.edges} edges, revision ${report.graph.revision}, ` +
      `freshness ${(report.graph.freshness * 100).toFixed(0)}%)`,
  );
  console.log('');
  console.log(`Persistent instruction cost: ~${report.alwaysTokens} tokens every session`);
  for (const tax of report.tax.slice(0, 10)) {
    console.log(`  ${tax.path.padEnd(40)} [${tax.agent}/${tax.mode}] ~${tax.effectiveTokens} tokens/session`);
  }
  if (report.duplicates.length > 0) {
    console.log('');
    console.log(`Duplicate instruction cost: ~${report.duplicateTokens} tokens`);
    for (const dup of report.duplicates.slice(0, 5)) {
      console.log(`  "${dup.sample}" in ${dup.files.join(', ')}`);
    }
  }
  console.log('');
  console.log(`MCP servers registered: ${report.mcpServerCount}`);
}

export interface ScanOptions {
  repo: string;
  json?: boolean;
  minScore?: string;
  maxPersistentTokens?: string;
  maxDuplicateRatio?: string;
}

/** CI mode: no prompts, no writes, threshold-gated exit code (spec s100). */
export async function runScan(opts: ScanOptions): Promise<void> {
  const report = await collectDoctorReport(opts.repo);
  const failures: string[] = [];
  if (opts.minScore !== undefined && report.score.total < Number(opts.minScore)) {
    failures.push(`score ${report.score.total} < min ${opts.minScore}`);
  }
  if (
    opts.maxPersistentTokens !== undefined &&
    report.alwaysTokens > Number(opts.maxPersistentTokens)
  ) {
    failures.push(`persistent tokens ${report.alwaysTokens} > max ${opts.maxPersistentTokens}`);
  }
  if (opts.maxDuplicateRatio !== undefined && report.totalInstructionTokens > 0) {
    const ratio = report.duplicateTokens / report.totalInstructionTokens;
    if (ratio > Number(opts.maxDuplicateRatio)) {
      failures.push(`duplicate ratio ${ratio.toFixed(2)} > max ${opts.maxDuplicateRatio}`);
    }
  }
  if (opts.json) {
    console.log(JSON.stringify({ ...report, failures }, null, 2));
  } else {
    console.log(`score ${report.score.total}/100 | persistent ~${report.alwaysTokens} | duplicates ~${report.duplicateTokens}`);
    for (const failure of failures) console.log(`FAIL: ${failure}`);
  }
  if (failures.length > 0) process.exitCode = 1;
}
