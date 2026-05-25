'use strict';

// Maximum resume chars sent to the model.
const MAX_CHARS_WITH_CRITERIA    = 6000;
const MAX_CHARS_WITHOUT_CRITERIA = 8000;
const MAX_CHARS_BASIC            = 4000; // general mode — contact details only

// Shared output schema description — keeps both prompts consistent.
const OUTPUT_SCHEMA = `{
  "name":             "string | null",
  "email":            "string | null",
  "phone":            "string | null",
  "applied_position": "string | null",
  "skills":           ["string"],
  "experience_years": number | null,
  "education":        "string | null",
  "match_score":      number | null,
  "brief_rationale":  "string (≤2 sentences)"
}`;

/**
 * Build a token-optimised Claude prompt.
 *
 * When `criteria` is provided the model is asked to score the candidate
 * strictly against that role's requirements — this keeps the output
 * focused and reduces max_tokens needed.
 *
 * Without criteria the model still extracts all fields but sets
 * match_score to null and brief_rationale to a generic note.
 *
 * @param {string}      resumeText   Plain-text resume content
 * @param {{ subject?: string, sender?: string }} context
 * @param {Object|null} criteria     Row from job_criteria (or null)
 */
function buildExtractionPrompt(resumeText, context = {}, criteria = null) {
  const { subject = '', sender = '' } = context;

  if (criteria) {
    const skills  = Array.isArray(criteria.required_skills) ? criteria.required_skills : [];
    const bonuses = Array.isArray(criteria.bonus_criteria)  ? criteria.bonus_criteria  : [];
    const minExp  = criteria.min_experience_years ?? 0;

    return `You are a recruitment evaluator. Extract candidate data and score against the role below.

ROLE: ${criteria.job_title}
REQUIRED SKILLS (${skills.length}): ${skills.join(', ') || 'none listed'}
MIN EXPERIENCE: ${minExp} year(s)
BONUS CRITERIA: ${bonuses.join(', ') || 'none'}

EMAIL CONTEXT — Subject: "${subject}" | From: ${sender}

RESUME:
---
${resumeText.slice(0, MAX_CHARS_WITH_CRITERIA)}
---

SCORING (total 100 pts):
• Required skills match  50 pts  (proportional to skills found)
• Experience ≥ minimum   30 pts  (partial if close; 0 if far below)
• Bonus criteria met     20 pts  (proportional)

Return ONLY raw JSON — no markdown, no prose:
${OUTPUT_SCHEMA}

"brief_rationale" must be ≤2 sentences citing specific evidence.`;
  }

  // ── Fallback: no criteria found ────────────────────────────────────────────
  return `You are a recruitment AI. Extract candidate information from the resume below.

EMAIL CONTEXT — Subject: "${subject}" | From: ${sender}

RESUME:
---
${resumeText.slice(0, MAX_CHARS_WITHOUT_CRITERIA)}
---

Return ONLY raw JSON — no markdown, no prose:
${OUTPUT_SCHEMA}

Set "match_score" to null and "brief_rationale" to "No role criteria configured for this position."`;
}

// ── General mode — contact details only ──────────────────────────────────────
const BASIC_OUTPUT_SCHEMA = `{
  "name":  "string | null",
  "email": "string | null",
  "phone": "string | null"
}`;

/**
 * Lightweight prompt for general mode.
 * Asks only for contact details — no scoring, no criteria needed.
 * Results in a much smaller max_tokens budget.
 */
function buildBasicExtractionPrompt(resumeText, context = {}) {
  const { subject = '', sender = '' } = context;
  return `You are a resume parser. Extract only the candidate's contact details from the text below.

EMAIL CONTEXT — Subject: "${subject}" | From: ${sender}

RESUME:
---
${resumeText.slice(0, MAX_CHARS_BASIC)}
---

Return ONLY raw JSON — no markdown, no prose:
${BASIC_OUTPUT_SCHEMA}`;
}

module.exports = { buildExtractionPrompt, buildBasicExtractionPrompt };
