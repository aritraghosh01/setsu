import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { discoverFiles, estimateTokens } from '@setsu-ai/core';
import { openGraphDb } from '@setsu-ai/storage';
import { indexRepo } from '@setsu-ai/graph';
import { buildContext, extractSeedTerms } from '@setsu-ai/retrieval';

interface BenchTask {
  id: string;
  query: string;
  relevant: string[];
}

interface BenchDefinition {
  repository: string;
  tasks: BenchTask[];
}

interface TaskResult {
  id: string;
  baselineTokens: number;
  setsuTokens: number;
  reduction: string;
  evidenceFiles: number;
  precision: number | null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Deterministic retrieval-cost benchmark (spec sections 81-83). Compares a
 * grep-first baseline (read every file matching a query term — what an agent
 * without a graph does) against SETSU's budgeted pack, on estimated tokens.
 * This measures retrieval cost only; end-task success is measured separately
 * by the Claude E2E harness. No made-up numbers (s83).
 */
export async function runBenchmark(opts: { repo: string; tasks?: string; json?: boolean }): Promise<void> {
  const definitionPath = opts.tasks ?? join(opts.repo, '..', '..', 'benchmarks', 'ts-sample-queries.json');
  const definition = JSON.parse(await readFile(definitionPath, 'utf8')) as BenchDefinition;

  const store = openGraphDb(opts.repo);
  try {
    await indexRepo(store);
    const files = await discoverFiles(store.repoRoot);
    const contents = new Map<string, string>();
    for (const file of files) {
      if (!file.language) continue;
      try {
        contents.set(file.path, await readFile(join(store.repoRoot, file.path), 'utf8'));
      } catch {
        // unreadable files are invisible to both sides
      }
    }

    const results: TaskResult[] = [];
    for (const task of definition.tasks) {
      const terms = extractSeedTerms(task.query);
      const needles = [...terms.identifiers, ...terms.words].map((t) => t.toLowerCase());

      // Baseline: grep for any term, read every matching file in full.
      let baselineTokens = 0;
      for (const [, content] of contents) {
        const haystack = content.toLowerCase();
        if (needles.some((needle) => haystack.includes(needle))) {
          baselineTokens += estimateTokens(content);
        }
      }

      const { pack } = await buildContext(store, task.query, {});
      const evidenceFiles = [
        ...new Set(pack.evidence.map((e) => e.file).filter((f): f is string => !!f)),
      ];
      const precision =
        task.relevant.length > 0 && evidenceFiles.length > 0
          ? evidenceFiles.filter((f) => task.relevant.includes(f)).length / evidenceFiles.length
          : null;

      results.push({
        id: task.id,
        baselineTokens,
        setsuTokens: pack.budget.usedEstimatedTokens,
        reduction:
          baselineTokens > 0
            ? `${(((baselineTokens - pack.budget.usedEstimatedTokens) / baselineTokens) * 100).toFixed(0)}%`
            : 'n/a',
        evidenceFiles: evidenceFiles.length,
        precision,
      });
    }

    const report = {
      schemaVersion: 1,
      repository: definition.repository,
      indexedFiles: files.length,
      setsuVersion: process.env['npm_package_version'] ?? 'dev',
      runAt: new Date().toISOString(),
      note: 'Estimated-token retrieval cost only; task success is measured by the Claude E2E harness.',
      results,
      medianBaselineTokens: median(results.map((r) => r.baselineTokens)),
      medianSetsuTokens: median(results.map((r) => r.setsuTokens)),
    };

    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(`Benchmark: ${definition.repository} (${files.length} files)`);
    console.log('');
    console.log('task                 baseline   setsu   reduction  precision');
    for (const result of results) {
      console.log(
        `${result.id.padEnd(20)} ${String(result.baselineTokens).padStart(8)} ${String(result.setsuTokens).padStart(7)}   ` +
          `${result.reduction.padStart(8)}  ${result.precision === null ? '   n/a' : result.precision.toFixed(2).padStart(6)}`,
      );
    }
    console.log('');
    console.log(
      `median: baseline ~${report.medianBaselineTokens} tokens vs SETSU ~${report.medianSetsuTokens} tokens (estimated)`,
    );
    console.log(report.note);
  } finally {
    store.db.close();
  }
}
