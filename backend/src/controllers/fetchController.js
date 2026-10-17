'use strict';

const { pollUnreadEmails } = require('../services/emailService');

// Prevent overlapping fetches — one run at a time
let _fetching = false;
let _fetchStatus = { running: false, summary: null, error: null };

/**
 * POST /api/fetch/manual
 * Body: { startDate, endDate, maxBatch? }
 *
 * Starts a background fetch for the given date window and responds immediately.
 * Each email is auto-triaged; only 'application' emails trigger AI.
 * A 1 500 ms inter-email delay prevents API rate-limit errors on large batches.
 *
 * Returns 409 if a fetch is already running.
 */
async function manualFetch(req, res, next) {
  try {
    if (_fetching) {
      return res.status(409).json({ error: 'A fetch is already in progress. Please wait.' });
    }

    const { startDate, endDate, maxBatch } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const since  = new Date(startDate);
    const before = new Date(endDate);
    before.setHours(23, 59, 59, 999);

    if (isNaN(since.getTime()) || isNaN(before.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
    }
    if (since > before) {
      return res.status(400).json({ error: 'startDate must not be after endDate' });
    }

    // Optional hard cap supplied by the caller; 0 = no cap (process everything)
    const batchCap = maxBatch ? Math.min(Math.max(1, Number(maxBatch)), 10_000) : 0;

    console.log(
      `[ManualFetch] Starting background fetch — ` +
      `from: ${since.toDateString()}, to: ${before.toDateString()}, ` +
      `batch: ${batchCap || 'unlimited'}`
    );

    _fetching = true;
    _fetchStatus = { running: true, summary: null, error: null };

    // Fire and forget — prevents HTTP timeout on large inboxes.
    // Results appear in the email table as they're processed.
    pollUnreadEmails({
      since,
      before,
      includeRead:       true,
      maxBatch:          batchCap,
      interEmailDelayMs: 1500,
    })
      .then(({ results, summary }) => {
        const apps    = results.filter((r) => r.applicantId).length;
        const general = results.filter((r) => !r.applicantId && !r.candidateData).length;
        const failedConnections = summary.connection_errors || [];
        _fetchStatus = {
          running: true,
          summary,
          error: failedConnections.length
            ? failedConnections.map((item) => `${item.label} (${item.phase}, ${item.code}): ${item.message}`).join(' ')
            : null,
        };
        console.log(
          `[ManualFetch] Complete — ${results.length} processed | ` +
          `${apps} applications saved | ${general} general` +
          (summary.skipped_dedup > 0 ? ` | ${summary.skipped_dedup} dedup-skipped` : '') +
          (failedConnections.length ? ` | ${failedConnections.length} IMAP account(s) failed` : '') +
          (summary.quota_stopped ? ' | stopped by quota' : '')
        );
      })
      .catch((err) => {
        const failures = err.connectionErrors || [];
        const error = failures.length
          ? failures.map((item) => `${item.label} (${item.phase}, ${item.code}): ${item.message}`).join(' ')
          : err.message;
        console.error('[ManualFetch] Background error:', error);
        _fetchStatus = { running: true, summary: null, error };
      })
      .finally(() => {
        _fetching = false;
        _fetchStatus = { ..._fetchStatus, running: false };
      });

    res.json({
      started:  true,
      since:    since.toISOString(),
      before:   before.toISOString(),
      batchCap: batchCap || 'unlimited',
    });
  } catch (err) {
    _fetching = false;
    next(err);
  }
}

/** GET /api/fetch/status — lets the UI check whether a fetch is running */
function fetchStatus(req, res) {
  res.json(_fetchStatus);
}

module.exports = { manualFetch, fetchStatus };
