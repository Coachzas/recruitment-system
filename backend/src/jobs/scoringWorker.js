'use strict';

const { rescoreAll } = require('../services/scoringService');

let _running = false;

/**
 * Background re-score job.
 * Safe to call multiple times — re-entrant calls are dropped.
 *
 * @param {{ onlyUnscored?: boolean }} opts
 */
async function runRescoreJob(opts = {}) {
  if (_running) {
    console.log('[ScoringWorker] Already running — skipping duplicate trigger.');
    return null;
  }
  _running = true;
  console.log('[ScoringWorker] Starting re-score job…');
  try {
    const results = await rescoreAll(opts);
    const ok = results.filter((r) => r.ok).length;
    console.log(`[ScoringWorker] Done — ${ok}/${results.length} applicant(s) scored.`);
    return results;
  } finally {
    _running = false;
  }
}

function isRunning() {
  return _running;
}

module.exports = { runRescoreJob, isRunning };
