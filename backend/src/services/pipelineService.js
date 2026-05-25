'use strict';

const { buildBasicExtractionPrompt, buildExtractionPrompt } = require('../utils/buildPrompt');
const { extractCandidateData }  = require('./aiService');
const { findMatchingCriteria, listJobCriteria } = require('./storageService');

// ─── General mode ─────────────────────────────────────────────────────────────

/**
 * Lightweight AI call for general mode.
 * Extracts contact details only (name / email / phone).
 * Never triggers criteria lookup or scoring.
 *
 * @param {string} resumeText
 * @param {{ subject?: string, sender?: string }} emailCtx
 * @returns {Promise<Object>}  Guaranteed: match_score=null, brief_rationale='Not Scored'
 */
async function extractBasicInfo(resumeText, emailCtx = {}) {
  const prompt = buildBasicExtractionPrompt(resumeText, emailCtx);
  const result = await extractCandidateData(prompt);
  return {
    ...result,
    match_score:     null,
    brief_rationale: 'Not Scored',
  };
}

// ─── Recruitment mode ─────────────────────────────────────────────────────────

/**
 * Full AI extraction + scoring for recruitment mode.
 * `criteria` must be a matching job_criteria row — never pass null here.
 *
 * @param {string} resumeText
 * @param {{ subject?: string, sender?: string }} emailCtx
 * @param {Object} criteria   Row from job_criteria table
 * @returns {Promise<Object>}
 */
async function extractAndScore(resumeText, emailCtx = {}, criteria) {
  const prompt = buildExtractionPrompt(resumeText, emailCtx, criteria);
  return extractCandidateData(prompt);
}

// ─── Criteria helpers ─────────────────────────────────────────────────────────

/**
 * Infers the best-matching job criteria from the email subject and the first
 * 500 chars of the resume text.  Uses word-overlap scoring (≥50 % hit rate).
 *
 * @param {string} subject
 * @param {string} resumeText
 * @returns {Promise<Object|null>}  Matching criteria row, or null if none qualify
 */
async function inferMatchingCriteria(subject, resumeText) {
  return findMatchingCriteria(subject || '', (resumeText || '').slice(0, 500));
}

/**
 * Guard for recruitment mode: throws immediately if the database contains no
 * job criteria at all.  Call this before starting the email loop so the
 * entire batch fails fast with a clear message, rather than flagging every
 * single email as 'criteria_missing'.
 *
 * @throws {Error} if job_criteria table is empty
 */
async function assertCriteriaExist() {
  const rows = await listJobCriteria();
  if (!rows.length) {
    throw new Error(
      'Recruitment mode requires at least one Job Criteria to be defined. ' +
      'Please add a Job Criteria in Settings before running a recruitment fetch.'
    );
  }
}

module.exports = {
  extractBasicInfo,
  extractAndScore,
  inferMatchingCriteria,
};
