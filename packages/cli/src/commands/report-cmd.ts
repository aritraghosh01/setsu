import { openUsageDb } from '@setsu-ai/storage';
import { recommendationStates, strategyScores } from '@setsu-ai/learning';
import { collectDoctorReport } from './doctor-cmd.js';

interface RetrievalStats {
  packs: number;
  averageBudgetUse: number | null;
  feedbackGood: number;
  feedbackBad: number;
  /** usefulEvidenceTokens / totalRetrieved is approximated by feedback until
   *  agent-side read tracking exists (spec section 80: label honestly). */
  retrievalEfficiencyApprox: number | null;
}

function gatherRetrievalStats(db: ReturnType<typeof openUsageDb>): { stats: RetrievalStats; taskClasses: string[] } {
  const rows = db.all<{ payload: string }>(
    `SELECT payload FROM events WHERE type = 'retrieval_outcome' ORDER BY ts DESC LIMIT 500`,
  );
  let budgetUseSum = 0;
  let budgetUseCount = 0;
  let good = 0;
  let bad = 0;
  const classes = new Set<string>();
  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload) as {
        taskClass?: string;
        usedTokens?: number;
        budget?: number;
        success?: boolean;
      };
      if (payload.taskClass) classes.add(payload.taskClass);
      if (payload.usedTokens && payload.budget) {
        budgetUseSum += payload.usedTokens / payload.budget;
        budgetUseCount += 1;
      }
      if (payload.success === true) good += 1;
      if (payload.success === false) bad += 1;
    } catch {
      // skip malformed rows
    }
  }
  return {
    stats: {
      packs: rows.length,
      averageBudgetUse: budgetUseCount > 0 ? budgetUseSum / budgetUseCount : null,
      feedbackGood: good,
      feedbackBad: bad,
      retrievalEfficiencyApprox: good + bad > 0 ? good / (good + bad) : null,
    },
    taskClasses: [...classes].sort(),
  };
}

export async function runReport(opts: { repo: string; json?: boolean }): Promise<void> {
  const doctor = await collectDoctorReport(opts.repo);
  const db = openUsageDb();
  try {
    const { stats, taskClasses } = gatherRetrievalStats(db);
    const strategies = Object.fromEntries(
      taskClasses.map((taskClass) => [taskClass, strategyScores(db, taskClass)]),
    );
    const recommendations = recommendationStates(db);

    if (opts.json) {
      console.log(
        JSON.stringify(
          { schemaVersion: 1, contextEfficiency: doctor.score, retrieval: stats, strategies, recommendations },
          null,
          2,
        ),
      );
      return;
    }

    console.log(`Context Efficiency Score: ${doctor.score.total}/100`);
    console.log('');
    console.log('Retrieval:');
    console.log(`  packs built: ${stats.packs}`);
    if (stats.averageBudgetUse !== null) {
      console.log(`  average budget utilization: ${(stats.averageBudgetUse * 100).toFixed(0)}%`);
    }
    if (stats.retrievalEfficiencyApprox !== null) {
      console.log(
        `  retrieval efficiency (approx from feedback, ${stats.feedbackGood + stats.feedbackBad} labels): ` +
          `${(stats.retrievalEfficiencyApprox * 100).toFixed(0)}%`,
      );
    } else {
      console.log('  retrieval efficiency: no measurement yet (rate packs with setsu feedback)');
    }
    console.log('');
    console.log('Learning profile:');
    if (taskClasses.length === 0) console.log('  (no retrieval history yet)');
    for (const taskClass of taskClasses) {
      const scores = strategies[taskClass]!;
      console.log(
        `  ${taskClass.padEnd(24)} ${scores.map((s) => `${s.strategy} ${s.score.toFixed(2)}`).join(' | ')}`,
      );
    }
    if (recommendations.length > 0) {
      console.log('');
      console.log(`Open recommendations: ${recommendations.filter((r) => r.status === 'open').length}`);
    }
  } finally {
    db.close();
  }
}
