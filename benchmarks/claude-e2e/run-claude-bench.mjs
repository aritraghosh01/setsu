// Claude Code token-savings validation harness (spec s81-83, s112).
// Runs each task in two variants:
//   A (native):  plain repo copy, standard file tools only
//   B (setsu):   repo copy + SETSU MCP registered + graph-first guidance,
//                graph pre-built
// and records real usage from `claude -p --output-format json`.
//
// Usage:
//   node benchmarks/claude-e2e/run-claude-bench.mjs \
//     --tasks benchmarks/claude-e2e/tasks-ts-sample.json [--runs 3] [--only id]
//
// Results land in benchmarks/claude-e2e/results/<suite>-<timestamp>.json
// plus a markdown summary next to it. GO/NO-GO stays a human decision.
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, appendFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const SETSU_BIN = join(ROOT, 'packages', 'cli', 'dist', 'setsu.js');

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const tasksFile = argValue('--tasks', join(HERE, 'tasks-ts-sample.json'));
const runsPerVariant = Number(argValue('--runs', '3'));
const onlyTask = argValue('--only', undefined);
const maxTurns = Number(argValue('--max-turns', '25'));
const model = argValue('--model', undefined);

const suite = JSON.parse(readFileSync(tasksFile, 'utf8'));
const repoSource = resolve(ROOT, suite.repo);
const onlyIds = onlyTask ? new Set(onlyTask.split(',')) : undefined;
const tasks = onlyIds ? suite.tasks.filter((t) => onlyIds.has(t.id)) : suite.tasks;
const label = argValue('--label', onlyTask ? onlyTask.replace(/[^a-z0-9-]/gi, '_') : 'all');

const GUIDANCE = `\n<!-- SETSU:BEGIN scout -->\nFor repository-wide questions, use SETSU code intelligence before broad raw-file search.\nCall the \`setsu_context\` MCP tool with the task or question; it returns a token-budgeted\nevidence pack (symbols, snippets, graph paths). Use \`setsu_symbol\`, \`setsu_path\` and\n\`setsu_impact\` for symbol lookups, architecture chains and blast-radius checks.\nRead full files only when the returned evidence is insufficient.\n<!-- SETSU:END scout -->\n`;

const COPY_EXCLUDE = /[\\/](node_modules|\.git|dist|\.setsu|\.setsu-home|results|coverage)([\\/]|$)/;

function makeWorkspace(variant) {
  const dir = join(tmpdir(), `setsu-bench-${suite.name}-${variant}-${Date.now()}`);
  cpSync(repoSource, dir, {
    recursive: true,
    filter: (src) => !COPY_EXCLUDE.test(src),
  });
  mkdirSync(join(dir, '.setsu-home'), { recursive: true });
  return dir;
}

function run(cmd, cmdArgs, options) {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, cmdArgs, { ...options, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, options.timeoutMs ?? 360_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({ code, stdout, stderr });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolvePromise({ code: -1, stdout, stderr: String(err) });
    });
  });
}

async function prepareVariantB(ws) {
  writeFileSync(
    join(ws, '.mcp.json'),
    JSON.stringify(
      {
        mcpServers: {
          setsu: {
            command: process.execPath,
            args: [SETSU_BIN, 'mcp', 'serve', '--repo', '.'],
            env: { SETSU_HOME: join(ws, '.setsu-home') },
          },
        },
      },
      null,
      2,
    ),
  );
  const claudeMd = join(ws, 'CLAUDE.md');
  const existing = existsSync(claudeMd) ? readFileSync(claudeMd, 'utf8') : '';
  if (!existing.includes('SETSU:BEGIN')) appendFileSync(claudeMd, GUIDANCE);
  const idx = await run(process.execPath, [SETSU_BIN, 'index', '--repo', ws], {
    env: { ...process.env, SETSU_HOME: join(ws, '.setsu-home') },
    timeoutMs: 180_000,
  });
  if (idx.code !== 0) throw new Error(`setsu index failed: ${idx.stderr.slice(0, 500)}`);
}

const BASE_TOOLS = 'Read,Grep,Glob,LS';
const SETSU_TOOLS =
  'mcp__setsu__setsu_context,mcp__setsu__setsu_symbol,mcp__setsu__setsu_path,mcp__setsu__setsu_impact,mcp__setsu__setsu_status';

async function claudeRun(ws, variant, query) {
  const cliArgs = [
    '-p',
    query,
    '--output-format',
    'json',
    '--max-turns',
    String(maxTurns),
    '--allowedTools',
    variant === 'B' ? `${BASE_TOOLS},${SETSU_TOOLS}` : BASE_TOOLS,
  ];
  if (variant === 'B') cliArgs.push('--mcp-config', '.mcp.json', '--strict-mcp-config');
  if (model) cliArgs.push('--model', model);

  const started = Date.now();
  // Spawn without a shell so multi-word prompts survive as single argv
  // entries; PATH resolution finds claude.exe (npm .cmd shims would need a
  // shell — point --claude-bin at the underlying exe/js in that case).
  const result = await run(argValue('--claude-bin', 'claude'), cliArgs, {
    cwd: ws,
    env: { ...process.env, SETSU_HOME: join(ws, '.setsu-home') },
    timeoutMs: 420_000,
  });
  const wall = Date.now() - started;
  let parsed;
  try {
    parsed = JSON.parse(result.stdout.trim());
  } catch {
    return { error: `unparseable output (code ${result.code}): ${result.stdout.slice(0, 300)} ${result.stderr.slice(0, 300)}`, wallMs: wall };
  }
  const usage = parsed.usage ?? {};
  return {
    costUsd: parsed.total_cost_usd,
    turns: parsed.num_turns,
    durationMs: parsed.duration_ms ?? wall,
    inputTokens: usage.input_tokens ?? 0,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    resultText: typeof parsed.result === 'string' ? parsed.result : '',
    isError: parsed.is_error === true,
    wallMs: wall,
  };
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function summarize(records, variant) {
  const ok = records.filter((r) => r.variant === variant && !r.error);
  const contextTokens = ok.map((r) => r.inputTokens + r.cacheCreationTokens + r.cacheReadTokens);
  return {
    runs: ok.length,
    errors: records.filter((r) => r.variant === variant && r.error).length,
    successRate: ok.length > 0 ? ok.filter((r) => r.success).length / ok.length : null,
    medianCostUsd: median(ok.map((r) => r.costUsd ?? 0)),
    medianTurns: median(ok.map((r) => r.turns ?? 0)),
    medianContextTokens: median(contextTokens),
    medianCacheCreationTokens: median(ok.map((r) => r.cacheCreationTokens)),
    medianOutputTokens: median(ok.map((r) => r.outputTokens)),
    medianDurationMs: median(ok.map((r) => r.durationMs ?? 0)),
  };
}

const records = [];
const resultsDirEarly = join(HERE, 'results');
mkdirSync(resultsDirEarly, { recursive: true });
const partialPath = join(resultsDirEarly, `${suite.name}-${label}.partial.jsonl`);
console.log(`Suite: ${suite.name} | repo: ${repoSource}`);
console.log(`Tasks: ${tasks.length} | runs/variant: ${runsPerVariant} | max turns: ${maxTurns}`);

for (const variant of ['A', 'B']) {
  const ws = makeWorkspace(variant);
  try {
    if (variant === 'B') await prepareVariantB(ws);
    for (const task of tasks) {
      for (let runIdx = 0; runIdx < runsPerVariant; runIdx += 1) {
        process.stdout.write(`[${variant}] ${task.id} run ${runIdx + 1}/${runsPerVariant} ... `);
        let outcome = await claudeRun(ws, variant, task.query);
        // Transient failures (rate limits, empty results) get one retry.
        if (outcome.error || outcome.isError || !outcome.resultText) {
          await new Promise((r) => setTimeout(r, 20_000));
          process.stdout.write('retry ... ');
          outcome = await claudeRun(ws, variant, task.query);
        }
        const success =
          !outcome.error &&
          !outcome.isError &&
          task.successKeys.every((key) => outcome.resultText.toLowerCase().includes(key.toLowerCase()));
        records.push({ variant, task: task.id, run: runIdx + 1, success, ...outcome });
        appendFileSync(partialPath, JSON.stringify(records[records.length - 1]) + '\n');
        if (outcome.error) console.log(`ERROR: ${outcome.error.slice(0, 120)}`);
        else
          console.log(
            `${success ? 'ok' : 'MISS'} | $${(outcome.costUsd ?? 0).toFixed(4)} | ${outcome.turns} turns | ` +
              `ctx ${(outcome.inputTokens + outcome.cacheCreationTokens + outcome.cacheReadTokens).toLocaleString('en-US')} tok | ${(outcome.durationMs / 1000).toFixed(0)}s`,
          );
      }
    }
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
}

const summaryA = summarize(records, 'A');
const summaryB = summarize(records, 'B');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const resultsDir = join(HERE, 'results');
mkdirSync(resultsDir, { recursive: true });

const report = {
  schemaVersion: 1,
  suite: suite.name,
  repo: suite.repo,
  runAt: new Date().toISOString(),
  runsPerVariant,
  maxTurns,
  model: model ?? 'session default',
  variantA: summaryA,
  variantB: summaryB,
  records,
};
const jsonPath = join(resultsDir, `${suite.name}-${stamp}.json`);
writeFileSync(jsonPath, JSON.stringify(report, null, 2));

function pct(from, to) {
  if (from === null || to === null || from === 0) return 'n/a';
  return `${(((from - to) / from) * 100).toFixed(1)}%`;
}

const md = `# Claude token-savings validation — ${suite.name}

Run at ${report.runAt} | ${tasks.length} tasks x ${runsPerVariant} runs/variant | model: ${report.model}

| metric | A native | B setsu | delta |
|---|---|---|---|
| success rate | ${summaryA.successRate === null ? 'n/a' : (summaryA.successRate * 100).toFixed(0) + '%'} | ${summaryB.successRate === null ? 'n/a' : (summaryB.successRate * 100).toFixed(0) + '%'} | — |
| median cost/run | $${summaryA.medianCostUsd?.toFixed(4)} | $${summaryB.medianCostUsd?.toFixed(4)} | ${pct(summaryA.medianCostUsd, summaryB.medianCostUsd)} saved |
| median context tokens | ${summaryA.medianContextTokens?.toLocaleString('en-US')} | ${summaryB.medianContextTokens?.toLocaleString('en-US')} | ${pct(summaryA.medianContextTokens, summaryB.medianContextTokens)} saved |
| median cache-creation tokens | ${summaryA.medianCacheCreationTokens?.toLocaleString('en-US')} | ${summaryB.medianCacheCreationTokens?.toLocaleString('en-US')} | ${pct(summaryA.medianCacheCreationTokens, summaryB.medianCacheCreationTokens)} saved |
| median turns | ${summaryA.medianTurns} | ${summaryB.medianTurns} | — |
| median wall time | ${(summaryA.medianDurationMs / 1000).toFixed(0)}s | ${(summaryB.medianDurationMs / 1000).toFixed(0)}s | — |
| errors | ${summaryA.errors} | ${summaryB.errors} | — |

Raw records: ${jsonPath}
`;
const mdPath = join(resultsDir, `${suite.name}-${stamp}.md`);
writeFileSync(mdPath, md);
console.log('');
console.log(md);
console.log(`Saved: ${jsonPath}`);
