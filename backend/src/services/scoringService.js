'use strict';

const { query }                 = require('../config/db');
const { buildExtractionPrompt } = require('../utils/buildPrompt');
const { extractCandidateData }  = require('./aiService');
const { findMatchingCriteria }  = require('./storageService');

/**
 * Re-score a single applicant using current job_criteria.
 * Uses the resume_text already stored in the DB — no file I/O needed.
 *
 * @param {number} applicantId
 * @returns {Promise<{ applicantId, match_score, rationale }>}
 */
async function scoreApplicant(applicantId) {
  const { rows } = await query(
    `SELECT id, full_name, position_applied, email, resume_text
     FROM applicants WHERE id = $1`,
    [applicantId]
  );
  if (!rows.length) throw new Error(`Applicant ${applicantId} not found`);

  const applicant = rows[0];
  if (!applicant.resume_text) throw new Error(`Applicant ${applicantId} has no stored resume text`);

  const criteria = await findMatchingCriteria(
    applicant.position_applied || '',
    applicant.resume_text.slice(0, 500)
  );

  const prompt = buildExtractionPrompt(
    applicant.resume_text,
    { subject: applicant.position_applied || '', sender: applicant.email || '' },
    criteria
  );

  const result = await extractCandidateData(prompt);

  const newScore    = typeof result.match_score === 'number' ? result.match_score : null;
  const newRationale = result.brief_rationale || null;

  await query(
    `UPDATE applicants SET match_score = $1, evaluation_rationale = $2 WHERE id = $3`,
    [newScore, newRationale, applicantId]
  );

  console.log(
    `[ScoringService] Applicant #${applicantId} "${applicant.full_name}": ` +
    `score=${newScore ?? 'n/a'}, criteria="${criteria?.job_title ?? 'none'}"`
  );

  return { applicantId, match_score: newScore, rationale: newRationale };
}

/**
 * Re-score every applicant that either has no score or whose score predates
 * the most-recently-updated job criteria.  Runs sequentially to avoid
 * hammering the Claude API.
 *
 * @param {{ onlyUnscored?: boolean }} opts
 * @returns {Promise<Array<{ id, ok, match_score?, error? }>>}
 */
async function rescoreAll({ onlyUnscored = false } = {}) {
  const where = onlyUnscored
    ? 'WHERE resume_text IS NOT NULL AND match_score IS NULL'
    : 'WHERE resume_text IS NOT NULL';

  const { rows } = await query(`SELECT id FROM applicants ${where} ORDER BY id`);
  console.log(`[ScoringService] rescoreAll — ${rows.length} applicant(s) queued (onlyUnscored=${onlyUnscored})`);

  const results = [];
  for (const { id } of rows) {
    try {
      const r = await scoreApplicant(id);
      results.push({ id, ok: true, match_score: r.match_score });
    } catch (err) {
      console.error(`[ScoringService] Applicant #${id} failed: ${err.message}`);
      results.push({ id, ok: false, error: err.message });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  console.log(`[ScoringService] rescoreAll complete — ${succeeded}/${results.length} succeeded.`);
  return results;
}

module.exports = { scoreApplicant, rescoreAll };
