'use strict';

const { ImapFlow }     = require('imapflow');
const { simpleParser } = require('mailparser');
const { randomUUID }   = require('crypto');
const fsp  = require('fs').promises;
const path = require('path');

const imapConfig = require('../config/imap');
const env        = require('../config/env');

const { query }        = require('../config/db');
const { extractText }  = require('../utils/parseResume');
const { QuotaError }   = require('./aiService');
const {
  extractBasicInfo,
  extractAndScore,
  inferMatchingCriteria,
} = require('./pipelineService');
const {
  ensureSchema,
  saveEmailLog,
  saveApplicant,
  saveEmailAttachments,
} = require('./storageService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Constants ────────────────────────────────────────────────────────────────

const RESUME_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'image/jpeg',
  'image/jpg',
  'image/png',
]);

const RESUME_DIR = path.resolve(__dirname, '../../uploads/resumes');

// ─── Triage patterns ──────────────────────────────────────────────────────────
//
// Three-tier classification system:
//
//   NEGATIVE_PATTERNS  — checked FIRST against subject + body combined.
//     Any single match → immediately 'general', even if positive patterns also
//     match.  Catches newsletters, job-board digests, automated mail, and
//     marketing regardless of incidental recruitment keywords they contain.
//
//   SUBJECT_PATTERNS   — unambiguous personal-submission signals on the
//     subject line alone.  Must never appear in newsletter headlines.
//
//   BODY_PATTERNS      — applicant-voice phrases in the body.  Deliberately
//     omits job-posting language (vacancy, opening, candidate, qualification)
//     that appears in job-board digests and corporate HR announcements.
//
// To tune: add/remove entries in the appropriate list — no logic changes needed.

/**
 * Negative (veto) patterns.
 * Any match against subject+body → email is classified as 'general'.
 */
const NEGATIVE_PATTERNS = [
  // ── Newsletter / marketing ────────────────────────────────────────────────
  /\bnewsletter\b/i,
  /\bunsubscribe\b/i,
  /\bsubscri(?:ption|bed)\b/i,           // subscription / subscribed
  /\bpromotional\b/i,
  /\bspecial\s+offer\b/i,
  /\bexclusive\s+(?:offer|deal|discount)\b/i,
  /\bopt.?out\b/i,

  // ── Job-board digest / bulk alerts ───────────────────────────────────────
  /\bjob\s+alert\b/i,
  /\b\d+\s+new\s+jobs?\b/i,             // "5 new jobs for you"
  /\bjobs?\s+(?:matching|recommended|you\s+might\s+like|near\s+you)\b/i,
  /\brecommended\s+jobs?\b/i,
  /\bnew\s+jobs?\s+for\s+you\b/i,
  /\bcareer\s+(?:digest|newsletter|alert)\b/i,

  // ── Automated / system mail ───────────────────────────────────────────────
  /\bdo\s+not\s+(?:reply|respond)\b/i,
  /\bautomat(?:ed?|ic)\s+(?:email|message|notification|response)\b/i,

  // ── Digest / broadcast formats ────────────────────────────────────────────
  /\b(?:daily|weekly|monthly)\s+(?:digest|roundup|recap|report)\b/i,
  /\byour\s+(?:\w+\s+)?(?:digest|newsletter)\b/i,   // "Your Weekly Digest"
  /\bbreaking\s+news\b/i,

  // ── Thai marketing / news ─────────────────────────────────────────────────
  /จดหมายข่าว/,                          // newsletter
  /ยกเลิกการสมัครรับ/,                   // unsubscribe
  /สมัครรับข่าวสาร/,                     // subscribe to news/updates
  /ข่าวสาร(?:ประจำ)?(?:วัน|สัปดาห์|เดือน)/,  // daily / weekly / monthly news digest
];

/**
 * Subject patterns — unambiguous recruitment signals on the subject line.
 * None of these phrases should appear in a newsletter or job-board alert.
 */
const SUBJECT_PATTERNS = [
  // ── Thai ─────────────────────────────────────────────────────────────────
  /สมัครงาน/,
  /สมัครตำแหน่ง/,
  /ขอสมัครงาน/,
  /ใบสมัครงาน?/,
  /ส่ง(?:ประวัติ|เรซูเม่|resume)/i,
  /ประวัติ(?:ส่วนตัว|ย่อ|การทำงาน)/,
  // ── English ──────────────────────────────────────────────────────────────
  /\bresume\b/i,
  /\bcv\b/i,
  /\bcurriculum\s+vitae\b/i,
  /\bjob\s+application\b/i,
  /\bapplication\s+for\s+(?:the\s+)?(?:position|role|job|post)\b/i,
  /\bapply(?:ing)?\s+for\b/i,
  /\bcover\s+letter\b/i,
  /\bcandidature\b/i,
  /\bjob\s+inquiry\b/i,
  /\bjob\s+seeker\b/i,
  /\bopen\s+to\s+work\b/i,
];

/**
 * Body patterns — first-person, applicant-voice phrases.
 * Excludes job-posting language (vacancy, candidate, opening, qualification)
 * which commonly appears in automated job-board digests and company news.
 */
const BODY_PATTERNS = [
  // ── Thai ─────────────────────────────────────────────────────────────────
  /สมัครงาน/,
  /สมัครตำแหน่ง/,
  /ขอสมัครงาน/,
  /ใบสมัครงาน?/,
  /ส่ง(?:ประวัติ|เรซูเม่|resume)/i,
  /ประวัติ(?:ส่วนตัว|ย่อ|การทำงาน)/,
  /เรซูเม่/,
  /ประวัติย่อ/,
  // ── English — first-person application voice ──────────────────────────────
  /\bresume\b/i,
  /\bcv\b/i,
  /\bcurriculum\s+vitae\b/i,
  /\bI\s+(?:am\s+)?(?:writing|applying)\b/i,           // "I am writing to apply…"
  /\bI\s+would\s+like\s+to\s+apply\b/i,
  /\bplease\s+(?:find|consider)\s+(?:my|attached)\b/i, // "Please find my resume…"
  /\battach(?:ed|ing)\b.{0,30}\b(?:resume|cv|portfolio)\b/i,
  /\benclos(?:ed|ing)\b.{0,30}\b(?:resume|cv|portfolio)\b/i,
  /\bmy\s+(?:resume|cv|portfolio|application)\b/i,     // "my resume", "my application"
  /\bI\s+am\s+(?:a\s+)?(?:recent\s+)?(?:graduate|professional)\b/i,
  /\bjob\s+application\b/i,
  /\bapply(?:ing)?\s+for\b/i,
  /\bcover\s+letter\b/i,
  /\bwork\s+experience\b/i,
  /\byears?\s+of\s+experience\b/i,
  /\bjob\s+seeker\b/i,
];

// ─── Classification helpers ───────────────────────────────────────────────────

function testPatterns(patterns, text) {
  if (!text) return false;
  return patterns.some((p) => p.test(text));
}

/**
 * Returns true if the subject alone is enough to classify as 'application'.
 * Negative patterns are checked first — any veto match returns false.
 */
function passesSubjectScreen(subject) {
  const s = subject || '';
  if (testPatterns(NEGATIVE_PATTERNS, s)) return false;
  return testPatterns(SUBJECT_PATTERNS, s);
}

/**
 * Returns true if the email looks like a job application after full parse.
 * Negative patterns are checked against subject + body combined so a
 * newsletter keyword anywhere in the email vetoes positive matches.
 */
function passesBodyScreen(subject, textBody, htmlBody) {
  const bodyText = textBody
    || (htmlBody ? htmlBody.replace(/<[^>]+>/g, ' ') : '');
  const sample   = bodyText.slice(0, 3000);
  const combined = `${subject || ''} ${sample}`;

  // Veto check — negative signal anywhere overrides all positive patterns
  if (testPatterns(NEGATIVE_PATTERNS, combined)) return false;

  // Positive check — subject-level signal is sufficient on its own
  if (testPatterns(SUBJECT_PATTERNS, subject || '')) return true;
  return testPatterns(BODY_PATTERNS, sample);
}

/**
 * True when the email is a Re:/Fwd: thread reply (subject prefix + In-Reply-To)
 * AND contains no resume-type attachment.
 * These are conversational follow-ups, not new applications.
 */
function isThreadReplyWithoutResume(inReplyTo, subject, rawAttachments) {
  if (!inReplyTo) return false;
  if (!/^(?:re|fw|fwd)\s*:/i.test((subject || '').trim())) return false;
  return !rawAttachments.some(
    (att) => att.contentDisposition !== 'inline' && RESUME_MIME_TYPES.has(att.contentType)
  );
}

// ─── File helpers ─────────────────────────────────────────────────────────────

async function ensureResumeDir() {
  await fsp.mkdir(RESUME_DIR, { recursive: true });
}

function sanitiseFilename(raw) {
  return raw.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_').trim() || 'unnamed_attachment';
}

function buildFilename(originalName) {
  const sanitised = sanitiseFilename(originalName);
  const ext  = path.extname(sanitised);
  const base = path.basename(sanitised, ext) || 'resume';
  return `${randomUUID()}_${base}${ext}`;
}

// ─── Parse stage (no disk I/O) ────────────────────────────────────────────────

async function parseRawMessage(rawMessage, uid) {
  const parsed = await simpleParser(rawMessage);
  return {
    uid,
    messageId:      parsed.messageId  || null,
    subject:        parsed.subject    || '(no subject)',
    from:           parsed.from?.text || null,
    to:             parsed.to?.text   || null,
    cc:             parsed.cc?.text   || null,
    date:           parsed.date       || new Date(),
    textBody:       parsed.text       || null,
    htmlBody:       parsed.html       || null,
    inReplyTo:      parsed.inReplyTo  || null,
    references:     Array.isArray(parsed.references) ? parsed.references : [],
    rawAttachments: parsed.attachments || [],
    attachments:    [],                  // populated by saveResumeAttachments()
  };
}

// ─── Attachment save stage (after screening) ──────────────────────────────────

async function saveResumeAttachments(metadata) {
  const candidates = metadata.rawAttachments.filter(
    (att) => att.contentDisposition !== 'inline' && RESUME_MIME_TYPES.has(att.contentType)
  );
  if (!candidates.length) return;

  await ensureResumeDir();
  for (const att of candidates) {
    const filename    = buildFilename(att.filename || 'resume');
    const destination = path.join(RESUME_DIR, filename);
    await fsp.writeFile(destination, att.content);
    metadata.attachments.push({
      originalName: att.filename    || 'unnamed',
      savedAs:      filename,
      filePath:     destination,
      mimeType:     att.contentType || 'application/octet-stream',
      sizeBytes:    att.size        || att.content.length,
      contentId:    att.cid         || null,
    });
    console.log(`[EmailService] Saved resume: ${filename}`);
  }
}

// ─── Full pipeline (triage → text extract → AI → DB) ─────────────────────────

/**
 * Auto-triages the email then persists the result.
 *
 * Triage ('application' | 'general') is determined here using the same
 * subject/body patterns as the old Stage A/B screens:
 *   • 'general'     — not a resume (save log only, no AI)
 *   • 'application' — looks like a resume → full AI extraction + DB save
 *
 * When criteria exist the applicant is fully scored; when none match, basic
 * contact extraction is used instead (no 'criteria_missing' dead-end).
 *
 * Possible email_log statuses written here:
 *   'success' — persisted (both general and application paths)
 *   'ignored' — application path but no parseable resume text found
 *   'failed'  — AI call or DB write threw
 */
async function runPipelineForEmail(metadata, { forceReprocess = false } = {}) {
  // Safety-net dedup — primary check has already run in the poll loop.
  if (!forceReprocess && metadata.messageId) {
    const { rows } = await query(
      'SELECT id FROM email_logs WHERE message_id = $1', [metadata.messageId]
    );
    if (rows.length > 0) {
      console.log(`[Pipeline] UID ${metadata.uid}: safety-net dedup hit — log #${rows[0].id}`);
      return { ...metadata, emailLogId: rows[0].id, applicantId: null, candidateData: null };
    }
  }

  // Force-reprocess: delete existing applicant(s) so the re-save doesn't create duplicates.
  if (forceReprocess && metadata.messageId) {
    const { rows: existing } = await query(
      'SELECT id FROM email_logs WHERE message_id = $1', [metadata.messageId]
    );
    if (existing.length > 0) {
      await query('DELETE FROM applicants WHERE email_log_id = $1', [existing[0].id]);
      console.log(`[Pipeline] UID ${metadata.uid}: force-reprocess — cleared applicant for log #${existing[0].id}`);
    }
  }

  // ── Auto-triage ───────────────────────────────────────────────────────────
  const looksLikeResume = (
    passesBodyScreen(metadata.subject, metadata.textBody, metadata.htmlBody) ||
    passesSubjectScreen(metadata.subject)
  ) && !isThreadReplyWithoutResume(metadata.inReplyTo, metadata.subject, metadata.rawAttachments);

  const triage = looksLikeResume ? 'application' : 'general';

  if (triage === 'general') {
    const emailLogId = await saveEmailLog(metadata, 'success', null, { mode: 'general' });
    console.log(`[Pipeline] UID ${metadata.uid}: triaged general — log #${emailLogId}`);
    return { ...metadata, emailLogId, applicantId: null, candidateData: null };
  }

  // ── Application path: save attachments → extract text → AI → persist ──────
  await saveResumeAttachments(metadata);

  // Step 1: extract resume text
  let resumeText     = null;
  let resumeFilePath = null;

  for (const att of metadata.attachments) {
    try {
      const text = await extractText(att.filePath, att.mimeType);
      if (text && text.length > 50) {
        resumeText     = text;
        resumeFilePath = att.filePath;
        console.log(`[Pipeline] UID ${metadata.uid}: ${text.length} chars from "${att.originalName}"`);
        break;
      }
    } catch (parseErr) {
      console.warn(`[Pipeline] UID ${metadata.uid}: parse failed on "${att.originalName}": ${parseErr.message}`);
    }
  }

  // Fallback: plain-text body when no attachment is parseable
  if (!resumeText && metadata.textBody && metadata.textBody.length > 50) {
    resumeText = metadata.textBody;
    console.log(`[Pipeline] UID ${metadata.uid}: using email body text`);
  }

  if (!resumeText) {
    const emailLogId = await saveEmailLog(
      metadata, 'ignored', 'No parseable resume content found', { mode: triage }
    );
    await saveEmailAttachments(emailLogId, metadata.attachments);
    return { ...metadata, emailLogId, applicantId: null, candidateData: null };
  }

  const emailCtx = { subject: metadata.subject, sender: metadata.from };

  // Step 2: AI extraction — score if criteria found, fall back to basic info
  let candidateData;
  const criteria = await inferMatchingCriteria(metadata.subject || '', resumeText);

  try {
    if (criteria) {
      candidateData = await extractAndScore(resumeText, emailCtx, criteria);
      console.log(
        `[Pipeline] UID ${metadata.uid}: scored — name="${candidateData.name}", ` +
        `score=${candidateData.match_score ?? 'n/a'}`
      );
    } else {
      candidateData = await extractBasicInfo(resumeText, emailCtx);
      console.log(`[Pipeline] UID ${metadata.uid}: no criteria match — basic extract, name="${candidateData.name}"`);
    }
  } catch (aiErr) {
    const emailLogId = await saveEmailLog(
      metadata, 'failed', `AI error: ${aiErr.message}`, { mode: triage }
    );
    await saveEmailAttachments(emailLogId, metadata.attachments);
    console.error(`[Pipeline] UID ${metadata.uid}: AI error — ${aiErr.message}`);
    if (aiErr.isQuotaError) throw aiErr;
    return { ...metadata, emailLogId, applicantId: null, candidateData: null };
  }

  // Step 3: persist
  try {
    const emailLogId = await saveEmailLog(metadata, 'success', null, {
      ai_summary: candidateData.brief_rationale || null,
      mode:       triage,
    });
    await saveEmailAttachments(emailLogId, metadata.attachments);
    const applicantId = await saveApplicant(emailLogId, candidateData, resumeText, resumeFilePath);
    console.log(`[Pipeline] UID ${metadata.uid}: saved — log #${emailLogId}, applicant #${applicantId}`);
    return { ...metadata, emailLogId, applicantId, candidateData };
  } catch (dbErr) {
    try {
      const emailLogId = await saveEmailLog(
        metadata, 'failed', `DB error: ${dbErr.message}`, { mode: triage }
      );
      await saveEmailAttachments(emailLogId, metadata.attachments);
      return { ...metadata, emailLogId, applicantId: null, candidateData };
    } catch { /* ignore secondary DB failure */ }
    throw dbErr;
  }
}

// ─── Core IMAP poll ───────────────────────────────────────────────────────────

/**
 * Fetches all emails in the time window and auto-triages each one.
 *
 * Every email reaches the DB — triage ('application' | 'general') is decided
 * inside runPipelineForEmail using the subject/body patterns, so no messages
 * are silently dropped at the envelope stage.
 *
 * Stage B  Full parse      — always downloaded; triage happens inside pipeline.
 * Stage C  Dedup           — message_id already in email_logs → skip.
 * Stage D  Pipeline        — auto-triage → AI (application only) → DB.
 *
 * @param {Object}  opts
 * @param {Date}    opts.since              Window start (default: 24 h ago)
 * @param {Date}    [opts.before]           Window end   (default: now)
 * @param {number}  [opts.maxBatch]         Max UIDs to process; 0 = unlimited (default: 0)
 * @param {boolean} [opts.includeRead]      Include already-\Seen emails (default: false)
 * @param {boolean} [opts.forceReprocess]   Bypass dedup + \Seen filter — re-processes already-seen/logged emails (default: false)
 * @param {number}  [opts.interEmailDelayMs] Pause between emails in ms (default: 0)
 * @returns {Promise<{ results: Array, summary: Object }>}
 */
async function pollUnreadEmails(opts = {}) {
  const {
    since             = new Date(Date.now() - 24 * 60 * 60 * 1000),
    before            = null,
    maxBatch          = 0,    // 0 = no cap — process everything in the window
    includeRead       = false,
    forceReprocess    = false,
    interEmailDelayMs = 0,
  } = opts;

  const client  = new ImapFlow(imapConfig);
  const results = [];
  let totalFound   = 0;
  let skippedDedup = 0;
  let quotaStopped = false;
  let reasonZero   = null;

  try {
    await client.connect();
    console.log('[EmailService] IMAP connected');

    const mailbox = env.IMAP_MAILBOX || 'INBOX';
    const lock    = await client.getMailboxLock(mailbox);

    try {
      const searchQuery = { since };
      if (!includeRead && !forceReprocess) searchQuery.seen = false;
      if (before) searchQuery.before = before;

      const allUids = await client.search(searchQuery, { uid: true });
      totalFound = allUids?.length ?? 0;

      if (!allUids || allUids.length === 0) {
        // Diagnostic: distinguish "inbox empty" from "all messages already read"
        if (!includeRead && !forceReprocess) {
          try {
            const diagQuery = { since, seen: true };
            if (before) diagQuery.before = before;
            const seenUids = await client.search(diagQuery, { uid: true });
            reasonZero = seenUids.length > 0 ? 'all_seen' : 'empty_window';
          } catch { reasonZero = 'empty_window'; }
        }
        console.log(`[EmailService] No messages found.${reasonZero ? ` Reason: ${reasonZero}` : ''}`);
      } else {

      const uids = maxBatch > 0 ? allUids.slice(0, maxBatch) : allUids;
      console.log(
        `[EmailService] ${allUids.length} message(s) found, processing ${uids.length}` +
        (maxBatch > 0 ? ` (cap: ${maxBatch})` : ' (unlimited)')
      );

      for (let i = 0; i < uids.length; i++) {
        const uid = uids[i];
        try {

          // ── Stage B: fetch full source — triage happens inside pipeline ────
          const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!message?.source) {
            console.warn(`[EmailService] UID ${uid}: empty source — skipping`);
            await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
            continue;
          }

          const metadata = await parseRawMessage(message.source, uid);

          // ── Stage C: dedup — skip if message_id already processed ──────────
          if (!forceReprocess && metadata.messageId) {
            const { rows } = await query(
              'SELECT id FROM email_logs WHERE message_id = $1', [metadata.messageId]
            );
            if (rows.length > 0) {
              console.log(`[C/dedup] UID ${uid}: already in log #${rows[0].id} — skipped`);
              skippedDedup++;
              await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
              continue;
            }
          }

          // ── Stage D: auto-triage + pipeline ───────────────────────────────
          const result = await runPipelineForEmail(metadata, { forceReprocess });
          results.push(result);

          await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
          console.log(`[EmailService] UID ${uid} marked \\Seen`);

          // Inter-email rate-limit delay — applied after every processed email
          // except the last one so we don't needlessly pause after finishing.
          if (interEmailDelayMs > 0 && i < uids.length - 1) {
            console.log(`[EmailService] Rate-limit pause: ${interEmailDelayMs}ms`);
            await sleep(interEmailDelayMs);
          }

        } catch (msgErr) {
          // Quota exhausted — stop the entire batch immediately.
          // Remaining UIDs are left unseen for the next fetch window.
          if (msgErr.isQuotaError) {
            console.error(`[EmailService] ${msgErr.message} — stopping batch, ${uids.length - i - 1} email(s) skipped.`);
            quotaStopped = true;
            break;
          }
          console.error(`[EmailService] UID ${uid} error:`, msgErr.message);
          try { await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }); } catch {}
        }
      }
      } // end else (allUids.length > 0)
    } finally {
      lock.release();
    }
  } catch (err) {
    console.error('[EmailService] IMAP session error:', err.message);
    throw err;
  } finally {
    await client.logout();
    console.log('[EmailService] IMAP disconnected');
  }

  return {
    results,
    summary: {
      found:         totalFound,
      processed:     results.length,
      skipped_dedup: skippedDedup,
      quota_stopped: quotaStopped,
      reason_zero:   reasonZero,
    },
  };
}

// ─── Retry failed email logs ──────────────────────────────────────────────────

/**
 * Re-processes every email_log row whose status is 'failed'.
 * Uses the attachment files already saved to disk — no IMAP connection needed.
 *
 * For each failed log it:
 *   1. Reads its saved attachment file(s) from email_attachments
 *   2. Extracts resume text
 *   3. Runs AI (with automatic retry via withRetry in aiService)
 *   4. Saves the applicant record
 *   5. Flips email_log.status → 'success'
 *
 * Logs that still fail after this run remain 'failed' and can be retried again later.
 *
 * @param {{ limit?: number }} opts
 * @returns {Promise<{ queued, succeeded, stillFailed, results }>}
 */
async function retryFailedEmails({ limit = 50 } = {}) {
  const { rows: failedLogs } = await query(
    `SELECT
       el.id, el.subject, el.sender, el.received_at, el.mode,
       COALESCE(
         json_agg(
           json_build_object(
             'file_path',     ea.file_path,
             'mime_type',     ea.mime_type,
             'original_name', ea.original_name
           ) ORDER BY ea.id
         ) FILTER (WHERE ea.id IS NOT NULL),
         '[]'
       ) AS attachments
     FROM email_logs el
     LEFT JOIN email_attachments ea ON ea.email_log_id = el.id
     WHERE el.status = 'failed'
     GROUP BY el.id
     ORDER BY el.received_at DESC
     LIMIT $1`,
    [limit]
  );

  if (!failedLogs.length) {
    console.log('[RetryFailed] No failed email logs to retry.');
    return { queued: 0, succeeded: 0, stillFailed: 0, results: [] };
  }

  console.log(`[RetryFailed] Retrying ${failedLogs.length} failed email log(s)…`);
  const results = [];

  for (const log of failedLogs) {
    const attachments = (log.attachments || []).filter((a) => a.file_path);

    // ── 1. Extract text from saved attachment files ────────────────────────
    let resumeText     = null;
    let resumeFilePath = null;

    for (const att of attachments) {
      try {
        await fsp.access(att.file_path);
        const text = await extractText(att.file_path, att.mime_type);
        if (text && text.length > 50) {
          resumeText     = text;
          resumeFilePath = att.file_path;
          break;
        }
      } catch (e) {
        console.warn(`[RetryFailed] log #${log.id}: cannot read "${att.file_path}" — ${e.message}`);
      }
    }

    if (!resumeText) {
      console.log(`[RetryFailed] log #${log.id}: no readable attachment — skipping`);
      results.push({ id: log.id, ok: false, reason: 'no_content' });
      continue;
    }

    // ── 2. AI extraction — score if criteria found, else basic info ──────────
    const emailCtx = { subject: log.subject, sender: log.sender };

    try {
      let candidateData;
      const criteria = await inferMatchingCriteria(log.subject || '', resumeText);

      if (criteria) {
        candidateData = await extractAndScore(resumeText, emailCtx, criteria);
        console.log(
          `[RetryFailed] log #${log.id}: scored — name="${candidateData.name}", ` +
          `score=${candidateData.match_score ?? 'n/a'}`
        );
      } else {
        candidateData = await extractBasicInfo(resumeText, emailCtx);
        console.log(`[RetryFailed] log #${log.id}: no criteria — basic extract, name="${candidateData.name}"`);
      }

      // ── 3. Save applicant + flip log to success ────────────────────────
      const applicantId = await saveApplicant(log.id, candidateData, resumeText, resumeFilePath);

      await query(
        `UPDATE email_logs
         SET status = 'success', error_message = NULL,
             ai_summary = $2, processed_at = NOW()
         WHERE id = $1`,
        [log.id, candidateData.brief_rationale || null]
      );

      console.log(`[RetryFailed] log #${log.id}: succeeded → applicant #${applicantId}`);
      results.push({ id: log.id, ok: true, applicantId });

    } catch (err) {
      if (err.isQuotaError) {
        console.error(`[RetryFailed] ${err.message} — stopping retry batch.`);
        results.push({ id: log.id, ok: false, reason: 'quota_exhausted' });
        break;
      }
      console.error(`[RetryFailed] log #${log.id}: still failing — ${err.message}`);
      results.push({ id: log.id, ok: false, reason: err.message });
    }
  }

  const succeeded  = results.filter((r) => r.ok).length;
  const stillFailed = results.filter((r) => !r.ok).length;
  console.log(`[RetryFailed] Done — ${succeeded} succeeded, ${stillFailed} still failed.`);

  return { queued: failedLogs.length, succeeded, stillFailed, results };
}

// ─── Legacy interval-based scheduler (kept for backward compat) ───────────────

let _pollTimer = null;

async function startPolling(onEmails) {
  await ensureSchema();
  console.log('[EmailService] DB schema verified.');

  const intervalMs = env.IMAP_POLL_INTERVAL_MS || 60_000;

  async function runPoll() {
    try {
      const { results } = await pollUnreadEmails();
      if (results.length > 0 && typeof onEmails === 'function') await onEmails(results);
    } catch (err) {
      console.error('[EmailService] Poll cycle failed:', err.message);
    }
  }

  runPoll();
  _pollTimer = setInterval(runPoll, intervalMs);
  console.log(`[EmailService] Polling started — interval: ${intervalMs}ms`);
}

function stopPolling() {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
    console.log('[EmailService] Polling stopped.');
  }
}

module.exports = { pollUnreadEmails, startPolling, stopPolling, retryFailedEmails };
