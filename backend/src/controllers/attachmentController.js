'use strict';

const fs   = require('fs');
const fsp  = require('fs').promises;
const path = require('path');

const { query } = require('../config/db');

// ─── Shared lookup ────────────────────────────────────────────────────────────

async function findAttachment(id) {
  const { rows } = await query(
    `SELECT id, file_path, original_name, mime_type, size_bytes
     FROM email_attachments WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

function safeName(original) {
  return (original || 'resume').replace(/[^\w.\-\s]/g, '').trim() || 'resume';
}

// ─── Download (forces browser save-dialog) ────────────────────────────────────

/**
 * GET /api/attachments/:id/download
 * Streams the file with Content-Disposition: attachment.
 */
async function downloadAttachment(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const att = await findAttachment(id);
    if (!att) return res.status(404).json({ error: 'Attachment not found' });

    try {
      await fsp.access(att.file_path);
    } catch {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Type', att.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName(att.original_name)}"`);
    fs.createReadStream(att.file_path).pipe(res);
  } catch (err) {
    next(err);
  }
}

// ─── Inline (browser renders PDF in-tab / in iframe) ─────────────────────────

/**
 * GET /api/attachments/:id/inline
 * Streams the file with Content-Disposition: inline so browsers render PDFs
 * directly instead of triggering a download.
 */
async function inlineAttachment(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const att = await findAttachment(id);
    if (!att) return res.status(404).json({ error: 'Attachment not found' });

    try {
      await fsp.access(att.file_path);
    } catch {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    const ext = path.extname(att.file_path).toLowerCase();

    // Allow PDF, plain-text, and images to render inline in the browser.
    const allowInline = ['.pdf', '.txt', '.jpg', '.jpeg', '.png'].includes(ext);
    const disposition = allowInline ? 'inline' : 'attachment';

    res.setHeader('Content-Type', att.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${disposition}; filename="${safeName(att.original_name)}"`);
    fs.createReadStream(att.file_path).pipe(res);
  } catch (err) {
    next(err);
  }
}

module.exports = { downloadAttachment, inlineAttachment };
