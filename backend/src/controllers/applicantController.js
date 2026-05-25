'use strict';

const fsp  = require('fs').promises;
const path = require('path');

const { query }          = require('../config/db');
const { scoreApplicant } = require('../services/scoringService');
const { runRescoreJob, isRunning } = require('../jobs/scoringWorker');

// ─── List ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/applicants
 * Query params: page, limit, search, position, minScore, maxScore
 */
async function list(req, res, next) {
  try {
    const page     = Math.max(1, parseInt(req.query.page,     10) || 1);
    const limit    = Math.min(100, parseInt(req.query.limit,  10) || 50);
    const offset   = (page - 1) * limit;
    const search   = req.query.search?.trim()   || null;
    const position = req.query.position?.trim() || null;
    const minScore = req.query.minScore !== undefined ? parseInt(req.query.minScore, 10) : null;
    const maxScore = req.query.maxScore !== undefined ? parseInt(req.query.maxScore, 10) : null;

    const conditions = [];
    const params     = [];

    if (search) {
      params.push(`%${search}%`);
      const i = params.length;
      conditions.push(`(a.full_name ILIKE $${i} OR a.email ILIKE $${i})`);
    }
    if (position) {
      params.push(`%${position}%`);
      conditions.push(`a.position_applied ILIKE $${params.length}`);
    }
    if (minScore !== null && !isNaN(minScore)) {
      params.push(minScore);
      conditions.push(`a.match_score >= $${params.length}`);
    }
    if (maxScore !== null && !isNaN(maxScore)) {
      params.push(maxScore);
      conditions.push(`a.match_score <= $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(`SELECT COUNT(*) FROM applicants a ${where}`, params);
    const total    = parseInt(countRes.rows[0].count, 10);

    params.push(limit, offset);
    const dataRes = await query(
      `SELECT
         a.id, a.full_name, a.email, a.phone,
         a.position_applied, a.skills, a.experience_years,
         a.education, a.summary, a.match_score,
         a.evaluation_rationale, a.created_at,
         el.subject, el.sender, el.received_at
       FROM applicants a
       LEFT JOIN email_logs el ON el.id = a.email_log_id
       ${where}
       ORDER BY a.match_score DESC NULLS LAST, a.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ total, page, limit, applicants: dataRes.rows });
  } catch (err) {
    next(err);
  }
}

// ─── Get one ──────────────────────────────────────────────────────────────────

/**
 * GET /api/applicants/:id
 */
async function getOne(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const { rows } = await query(
      `SELECT
         a.*,
         el.subject, el.sender, el.received_at, el.ai_summary, el.mode,
         COALESCE(
           json_agg(
             json_build_object(
               'id',            ea.id,
               'original_name', ea.original_name,
               'mime_type',     ea.mime_type,
               'size_bytes',    ea.size_bytes
             )
           ) FILTER (WHERE ea.id IS NOT NULL),
           '[]'
         ) AS attachments
       FROM applicants a
       LEFT JOIN email_logs      el ON el.id = a.email_log_id
       LEFT JOIN email_attachments ea ON ea.email_log_id = el.id
       WHERE a.id = $1
       GROUP BY a.id, el.subject, el.sender, el.received_at, el.ai_summary, el.mode`,
      [id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Applicant not found' });
    res.json({ applicant: rows[0] });
  } catch (err) {
    next(err);
  }
}

// ─── Re-score single ──────────────────────────────────────────────────────────

/**
 * POST /api/applicants/:id/rescore
 */
async function rescore(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const result = await scoreApplicant(id);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

// ─── Re-score all ─────────────────────────────────────────────────────────────

/**
 * POST /api/applicants/rescore-all
 * Body: { onlyUnscored?: boolean }   (default: true)
 *
 * Fires the background worker; returns immediately with job status.
 * If already running, returns 409 so the caller can retry later.
 */
async function rescoreAll(req, res, next) {
  try {
    if (isRunning()) {
      return res.status(409).json({ error: 'Re-score job is already running.' });
    }

    const onlyUnscored = req.body?.onlyUnscored !== false; // default true

    // Fire without awaiting — large batches could exceed HTTP timeout
    runRescoreJob({ onlyUnscored }).catch((err) =>
      console.error('[ApplicantController] rescoreAll background error:', err.message)
    );

    res.json({
      success: true,
      message: onlyUnscored
        ? 'Re-scoring unscored applicants in background.'
        : 'Re-scoring all applicants in background.',
    });
  } catch (err) {
    next(err);
  }
}

// ─── Resume download ──────────────────────────────────────────────────────────

/**
 * GET /api/applicants/:id/resume
 * Streams the saved resume file with a Content-Disposition: attachment header.
 * Returns 404 JSON when no file is recorded or the file is missing from disk.
 */
async function downloadResume(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const { rows } = await query(
      'SELECT file_path, full_name FROM applicants WHERE id = $1', [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Applicant not found' });

    const { file_path, full_name } = rows[0];
    if (!file_path) return res.status(404).json({ error: 'No resume file on record' });

    try {
      await fsp.access(file_path);
    } catch {
      return res.status(404).json({ error: 'Resume file not found on disk' });
    }

    const ext      = path.extname(file_path);
    const safeName = `${(full_name || 'resume').replace(/[^\w\s-]/g, '').trim()}${ext}`;
    res.download(file_path, safeName);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getOne, rescore, rescoreAll, downloadResume };
