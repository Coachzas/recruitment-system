'use strict';

const fsp       = require('fs').promises;
const { query } = require('../config/db');
const { getAttachmentPathsByEmailIds, bulkDeleteEmailLogs } = require('../services/storageService');
const { retryFailedEmails } = require('../services/emailService');

/**
 * GET /api/emails
 * Query params: mode, page, limit, startDate, endDate, subject, sender
 */
async function listEmails(req, res, next) {
  try {
    const mode      = req.query.mode      || 'all';
    const page      = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit     = Math.min(100, parseInt(req.query.limit, 10) || 50);
    const offset    = (page - 1) * limit;
    const startDate = req.query.startDate?.trim() || null;
    const endDate   = req.query.endDate?.trim()   || null;
    const subject   = req.query.subject?.trim()   || null;
    const sender    = req.query.sender?.trim()    || null;

    const conditions = [];
    const params     = [];

    if (mode !== 'all') {
      if (mode === 'application') {
        // Match new 'application' tag and legacy 'recruitment' rows
        params.push('application');
        params.push('recruitment');
        conditions.push(`el.mode IN ($${params.length - 1}, $${params.length})`);
      } else {
        params.push(mode);
        conditions.push(`el.mode = $${params.length}`);
      }
    }
    if (startDate) {
      params.push(startDate);
      conditions.push(`el.received_at >= $${params.length}::date`);
    }
    if (endDate) {
      params.push(endDate);
      // inclusive end: < (endDate + 1 day)
      conditions.push(`el.received_at < ($${params.length}::date + INTERVAL '1 day')`);
    }
    if (subject) {
      params.push(`%${subject}%`);
      conditions.push(`el.subject ILIKE $${params.length}`);
    }
    if (sender) {
      params.push(`%${sender}%`);
      conditions.push(`el.sender ILIKE $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*) FROM email_logs el ${where}`, params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const dataResult = await query(
      `SELECT
         el.id, el.imap_uid, el.subject, el.sender, el.received_at,
         el.processed_at, el.status, el.error_message, el.ai_summary, el.mode,
         a.full_name, a.position_applied,
         a.match_score,
         (SELECT COUNT(*) FROM applicants       WHERE email_log_id = el.id) AS applicant_count,
         (SELECT COUNT(*) FROM email_attachments WHERE email_log_id = el.id) AS attachment_count
       FROM email_logs el
       LEFT JOIN applicants a ON a.email_log_id = el.id
       ${where}
       ORDER BY el.processed_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ total, page, limit, emails: dataResult.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/emails/stats
 * Returns daily totals broken down by status.
 */
async function getStats(req, res, next) {
  try {
    const result = await query(`
      SELECT
        COUNT(*)                                           AS total,
        COUNT(*) FILTER (WHERE status = 'success')         AS success,
        COUNT(*) FILTER (WHERE status = 'failed')          AS failed,
        COUNT(*) FILTER (WHERE status = 'ignored')         AS ignored,
        COUNT(*) FILTER (WHERE status = 'irrelevant')      AS irrelevant,
        COUNT(*) FILTER (WHERE mode IN ('application', 'recruitment')) AS application,
        COUNT(*) FILTER (WHERE mode   = 'general')         AS general
      FROM email_logs
      WHERE processed_at >= NOW() - INTERVAL '24 hours'
    `);
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/emails/bulk-delete
 * Body: { ids: number[] }
 * Deletes email_logs rows + associated applicants + attachment files from disk.
 */
async function bulkDelete(req, res, next) {
  try {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array.' });
    }
    const numericIds = ids.map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (numericIds.length === 0) {
      return res.status(400).json({ error: 'ids must be valid positive integers.' });
    }

    // Collect file paths before deletion
    const filePaths = await getAttachmentPathsByEmailIds(numericIds);

    // Delete DB rows (cascades to email_attachments; applicants deleted explicitly)
    const deleted = await bulkDeleteEmailLogs(numericIds);

    // Delete files from disk (best-effort)
    for (const fp of filePaths) {
      try { await fsp.unlink(fp); } catch {}
    }

    res.json({ deleted, files_removed: filePaths.length });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/emails/retry-failed
 * Fires a background job that re-processes all 'failed' email_logs.
 * Returns 409 if a retry job is already running.
 * Body: { limit?: number }  (default 50, max 100)
 */
let _retrying = false;

async function retryFailed(req, res, next) {
  try {
    if (_retrying) {
      return res.status(409).json({ error: 'A retry job is already running.' });
    }

    const { rows } = await query(
      "SELECT COUNT(*) FROM email_logs WHERE status = 'failed'"
    );
    const total = parseInt(rows[0].count, 10);

    if (total === 0) {
      return res.json({ started: false, message: 'No failed emails to retry.' });
    }

    const limit = Math.min(100, parseInt(req.body?.limit, 10) || 50);

    _retrying = true;
    retryFailedEmails({ limit })
      .catch((err) =>
        console.error('[EmailLogController] retryFailed background error:', err.message)
      )
      .finally(() => { _retrying = false; });

    res.json({ started: true, queued: Math.min(total, limit), total });
  } catch (err) {
    next(err);
  }
}

module.exports = { listEmails, getStats, bulkDelete, retryFailed };
