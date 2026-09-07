import { openUsageDb, repoIdFor } from '@setsu-ai/storage';
import { loadConfig } from '@setsu-ai/core';
import {
  strategyScores,
  recommendationStates,
  shouldSurface,
  pruneEvents,
  recordEvent,
  inspectStorage,
  purge,
  consentStatus,
  setConsent,
  NOT_STORED,
} from '@setsu-ai/learning';

const TASK_CLASSES = [
  'architecture',
  'symbol_lookup',
  'debugging',
  'refactor',
  'repository_orientation',
  'unknown',
];

export async function runLearn(opts: { repo: string }): Promise<void> {
  const config = await loadConfig(opts.repo);
  const db = openUsageDb();
  try {
    const pruned = pruneEvents(db, config.learning.retentionDays);
    if (pruned > 0) console.log(`(pruned ${pruned} events past ${config.learning.retentionDays}-day retention)`);

    console.log('Learned retrieval strategies by task class:');
    let any = false;
    for (const taskClass of TASK_CLASSES) {
      const scores = strategyScores(db, taskClass);
      if (scores.length === 0) continue;
      any = true;
      const parts = scores.map((s) => `${s.strategy} ${s.score.toFixed(2)} (${s.samples})`).join(' | ');
      console.log(`  ${taskClass.padEnd(24)} ${parts}`);
    }
    if (!any) console.log('  (no retrieval outcomes recorded yet — use setsu context and setsu feedback)');

    const recs = recommendationStates(db);
    if (recs.length > 0) {
      console.log('');
      console.log('Recommendation acceptance:');
      for (const rec of recs.slice(0, 10)) {
        const quiet = shouldSurface(rec) ? '' : ' (quieted)';
        console.log(
          `  ${rec.type}${rec.target ? ` -> ${rec.target}` : ''}: ` +
            `${(rec.expectedAcceptance * 100).toFixed(0)}% expected acceptance${quiet}`,
        );
      }
    }
  } finally {
    db.close();
  }
}

export async function runFeedback(
  value: string,
  opts: { repo: string; note?: string },
): Promise<void> {
  const normalized = value.toLowerCase();
  if (normalized !== 'good' && normalized !== 'bad') {
    console.error('Usage: setsu feedback <good|bad> [--note "..."]');
    process.exitCode = 1;
    return;
  }
  const db = openUsageDb();
  try {
    // Attach the feedback to the most recent retrieval outcome so strategy
    // scores learn from it.
    const last = db.get<{ id: string; payload: string }>(
      `SELECT id, payload FROM events WHERE type = 'retrieval_outcome' ORDER BY ts DESC LIMIT 1`,
    );
    if (last) {
      const payload = JSON.parse(last.payload) as Record<string, unknown>;
      payload['success'] = normalized === 'good';
      db.run(`UPDATE events SET payload = ? WHERE id = ?`, JSON.stringify(payload), last.id);
    }
    recordEvent(db, {
      type: 'user_feedback',
      repoId: repoIdFor(opts.repo),
      payload: { value: normalized, ...(opts.note ? { note: opts.note } : {}) },
    });
    console.log(`Recorded ${normalized} feedback${last ? ' (applied to the latest retrieval)' : ''}.`);
  } finally {
    db.close();
  }
}

export async function runPrivacy(
  action: string,
  opts: { yes?: boolean; scope?: string },
): Promise<void> {
  switch (action) {
    case 'status':
    case 'inspect': {
      console.log('SETSU stores, locally only:');
      for (const category of inspectStorage()) {
        const size = category.present ? `${(category.bytes / 1024).toFixed(1)} KB` : 'absent';
        console.log(`  ${category.category.padEnd(26)} ${category.location}  [${size}]`);
        if (action === 'inspect') console.log(`      ${category.note}`);
      }
      console.log('');
      console.log('Never stored:');
      for (const item of NOT_STORED) console.log(`  - ${item}`);
      const consents = consentStatus();
      console.log('');
      console.log('Memory consent scopes (spec s71): all off by default');
      if (Object.keys(consents).length === 0) console.log('  (none granted)');
      for (const [scope, granted] of Object.entries(consents)) {
        console.log(`  ${scope}: ${granted ? 'GRANTED' : 'revoked'}`);
      }
      return;
    }
    case 'export': {
      console.log(JSON.stringify({ storage: inspectStorage(), consent: consentStatus() }, null, 2));
      return;
    }
    case 'purge': {
      if (!opts.yes) {
        console.log('This deletes the local graph, usage history, backups and salt.');
        console.log('Re-run with --yes to confirm: setsu privacy purge --yes');
        return;
      }
      const removed = await purge({ graphs: true, usage: true, backups: true, salt: true });
      console.log(removed.length > 0 ? `Removed:\n  ${removed.join('\n  ')}` : 'Nothing to remove.');
      return;
    }
    case 'consent': {
      if (!opts.scope) {
        console.error('Usage: setsu privacy consent --scope <memory:scope-name>');
        process.exitCode = 1;
        return;
      }
      setConsent(opts.scope, true);
      console.log(`Granted consent scope: ${opts.scope}`);
      return;
    }
    case 'revoke': {
      if (!opts.scope) {
        console.error('Usage: setsu privacy revoke --scope <memory:scope-name>');
        process.exitCode = 1;
        return;
      }
      setConsent(opts.scope, false);
      console.log(`Revoked consent scope: ${opts.scope}`);
      return;
    }
    default:
      console.error(`Unknown privacy action: ${action}. Use status|inspect|export|purge|consent|revoke.`);
      process.exitCode = 1;
  }
}
