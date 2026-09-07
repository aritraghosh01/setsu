// Aggregate partial .jsonl records from interrupted/completed bench runs.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'results');
const records = [];
if (existsSync(dir)) {
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.partial.jsonl')) continue;
    const suite = file.startsWith('setsu-repo') ? 'setsu-repo' : 'ts-sample';
    for (const line of readFileSync(join(dir, file), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      records.push({ suite, ...JSON.parse(line) });
    }
  }
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const lines = [];
for (const suite of ['ts-sample', 'setsu-repo']) {
  for (const variant of ['A', 'B']) {
    const ok = records.filter((r) => r.suite === suite && r.variant === variant && !r.error);
    if (ok.length === 0) continue;
    const ctx = ok.map((r) => r.inputTokens + r.cacheCreationTokens + r.cacheReadTokens);
    lines.push(
      `${suite} ${variant === 'A' ? 'A(native)' : 'B(setsu) '}: n=${ok.length} ` +
        `success=${((100 * ok.filter((r) => r.success).length) / ok.length).toFixed(0)}% ` +
        `medCost=$${median(ok.map((r) => r.costUsd ?? 0)).toFixed(3)} ` +
        `medTurns=${median(ok.map((r) => r.turns ?? 0))} ` +
        `medCtxTok=${Math.round(median(ctx))} ` +
        `medWall=${(median(ok.map((r) => r.durationMs ?? 0)) / 1000).toFixed(0)}s`,
    );
  }
}
console.log(lines.join('\n'));
writeFileSync(join(dir, 'SUMMARY-partial.txt'), lines.join('\n') + '\n');
