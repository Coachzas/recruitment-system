'use strict';

const { query } = require('../config/db');

// ─── Schema bootstrap ─────────────────────────────────────────────────────────

async function ensureSchema() {
  // email_logs
  await query(`
    CREATE TABLE IF NOT EXISTS email_logs (
      id            SERIAL      PRIMARY KEY,
      imap_uid      INTEGER     NOT NULL,
      message_id    TEXT        UNIQUE,
      subject       TEXT,
      sender        TEXT,
      received_at   TIMESTAMPTZ,
      processed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status        TEXT        NOT NULL DEFAULT 'ignored',
      error_message TEXT,
      ai_summary    TEXT,
      mode          TEXT        NOT NULL DEFAULT 'general'
    )
  `);
  await query(`ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS ai_summary TEXT`);
  await query(`ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS mode       TEXT NOT NULL DEFAULT 'general'`);

  // applicants
  await query(`
    CREATE TABLE IF NOT EXISTS applicants (
      id                   SERIAL      PRIMARY KEY,
      email_log_id         INTEGER     REFERENCES email_logs(id) ON DELETE SET NULL,
      full_name            TEXT,
      email                TEXT,
      phone                TEXT,
      position_applied     TEXT,
      skills               TEXT[],
      experience_years     INTEGER,
      education            TEXT,
      summary              TEXT,
      ai_response          JSONB,
      resume_text          TEXT,
      match_score          INTEGER,
      evaluation_rationale TEXT,
      applied_position     TEXT,
      file_path            TEXT,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE applicants ADD COLUMN IF NOT EXISTS match_score          INTEGER`);
  await query(`ALTER TABLE applicants ADD COLUMN IF NOT EXISTS evaluation_rationale TEXT`);
  await query(`ALTER TABLE applicants ADD COLUMN IF NOT EXISTS applied_position     TEXT`);
  await query(`ALTER TABLE applicants ADD COLUMN IF NOT EXISTS file_path            TEXT`);

  // email_connections
  await query(`
    CREATE TABLE IF NOT EXISTS email_connections (
      id         SERIAL      PRIMARY KEY,
      label      TEXT        NOT NULL,
      host       TEXT        NOT NULL,
      port       INTEGER     NOT NULL DEFAULT 993,
      secure     BOOLEAN     NOT NULL DEFAULT true,
      username   TEXT        NOT NULL,
      password   TEXT        NOT NULL,
      mailbox    TEXT        NOT NULL DEFAULT 'INBOX',
      is_active  BOOLEAN     NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // job_criteria
  await query(`
    CREATE TABLE IF NOT EXISTS job_criteria (
      id                   SERIAL      PRIMARY KEY,
      job_title            TEXT        NOT NULL UNIQUE,
      required_skills      JSONB       NOT NULL DEFAULT '[]',
      min_experience_years INTEGER,
      bonus_criteria       JSONB       NOT NULL DEFAULT '[]',
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Legacy singleton scheduler_settings — kept for backwards compat, no longer used by cron
  await query(`
    CREATE TABLE IF NOT EXISTS scheduler_settings (
      id                   INTEGER     PRIMARY KEY DEFAULT 1,
      days_to_run          TEXT[]      NOT NULL DEFAULT '{Mon,Tue,Wed,Thu,Fri}',
      run_interval_hours   INTEGER     NOT NULL DEFAULT 1,
      specific_time        TIME,
      max_emails_per_batch INTEGER     NOT NULL DEFAULT 20,
      scheduler_mode       TEXT        NOT NULL DEFAULT 'recruitment',
      is_active            BOOLEAN     NOT NULL DEFAULT false,
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`INSERT INTO scheduler_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);

  // Multi-profile scheduler — one row per schedule profile
  await query(`
    CREATE TABLE IF NOT EXISTS scheduler_profiles (
      id                   SERIAL      PRIMARY KEY,
      profile_name         TEXT        NOT NULL,
      days_to_run          TEXT[]      NOT NULL DEFAULT '{Mon,Tue,Wed,Thu,Fri}',
      run_times            TEXT[]      NOT NULL DEFAULT '{}',
      max_emails_per_batch INTEGER     NOT NULL DEFAULT 20,
      active_from          DATE,
      active_to            DATE,
      is_active            BOOLEAN     NOT NULL DEFAULT false,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Migrations for existing tables
  await query(`ALTER TABLE scheduler_profiles ADD COLUMN IF NOT EXISTS run_times         TEXT[]      NOT NULL DEFAULT '{}'`);
  await query(`ALTER TABLE scheduler_profiles ADD COLUMN IF NOT EXISTS last_run_at       TIMESTAMPTZ`);
  await query(`ALTER TABLE scheduler_profiles ADD COLUMN IF NOT EXISTS last_run_summary  TEXT`);
  await query(`ALTER TABLE scheduler_profiles DROP COLUMN IF EXISTS include_read`);
  await query(`ALTER TABLE scheduler_profiles DROP COLUMN IF EXISTS scheduler_mode`);

  // Attachment file-path registry — enables disk cleanup on deletion
  await query(`
    CREATE TABLE IF NOT EXISTS email_attachments (
      id            SERIAL      PRIMARY KEY,
      email_log_id  INTEGER     REFERENCES email_logs(id) ON DELETE CASCADE,
      file_path     TEXT        NOT NULL,
      original_name TEXT,
      mime_type     TEXT,
      size_bytes    INTEGER,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Users (authentication) — one row per admin account
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL      PRIMARY KEY,
      email         TEXT        NOT NULL UNIQUE,
      password_hash TEXT        NOT NULL,
      role          TEXT        NOT NULL DEFAULT 'admin',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // AI provider settings — singleton row (id=1)
  await query(`
    CREATE TABLE IF NOT EXISTS ai_settings (
      id           INTEGER      PRIMARY KEY DEFAULT 1,
      provider     TEXT         NOT NULL DEFAULT 'claude',
      api_key_enc  TEXT,
      model_name   TEXT,
      temperature  NUMERIC(3,2) NOT NULL DEFAULT 0.0,
      updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  await query(`INSERT INTO ai_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
}

// ─── Email log helpers ────────────────────────────────────────────────────────

async function saveEmailLog(emailMeta, status, errorMessage = null, opts = {}) {
  const { ai_summary = null, mode = 'general' } = opts;
  const { uid, messageId, subject, from: sender, date } = emailMeta;

  const result = await query(
    `INSERT INTO email_logs
       (imap_uid, message_id, subject, sender, received_at, status, error_message, ai_summary, mode)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (message_id) DO UPDATE SET
       status        = EXCLUDED.status,
       processed_at  = NOW(),
       error_message = EXCLUDED.error_message,
       ai_summary    = EXCLUDED.ai_summary,
       mode          = EXCLUDED.mode
     RETURNING id`,
    [uid, messageId || null, subject, sender, date, status, errorMessage, ai_summary, mode]
  );
  return result.rows[0].id;
}

async function saveApplicant(emailLogId, candidateData, resumeText, filePath = null) {
  const {
    name, full_name,
    email, phone,
    applied_position, position_applied,
    skills, experience_years, education,
    brief_rationale, summary,
    match_score,
  } = candidateData;

  const resolvedName     = name || full_name || null;
  const resolvedPosition = applied_position || position_applied || null;
  const resolvedSummary  = brief_rationale || summary || null;

  const result = await query(
    `INSERT INTO applicants
       (email_log_id, full_name, email, phone, position_applied, skills,
        experience_years, education, summary, ai_response, resume_text,
        match_score, evaluation_rationale, applied_position, file_path)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING id`,
    [
      emailLogId, resolvedName, email || null, phone || null, resolvedPosition,
      Array.isArray(skills) && skills.length ? skills : null,
      Number.isInteger(experience_years) ? experience_years : null,
      education || null, resolvedSummary, candidateData, resumeText,
      typeof match_score === 'number' ? match_score : null,
      resolvedSummary, resolvedPosition,
      filePath || null,
    ]
  );
  return result.rows[0].id;
}

// ─── Job criteria helpers ─────────────────────────────────────────────────────

async function listJobCriteria() {
  const r = await query(
    `SELECT id, job_title, required_skills, min_experience_years, bonus_criteria, created_at
     FROM job_criteria ORDER BY created_at DESC`
  );
  return r.rows;
}

async function findMatchingCriteria(subject = '', resumeHead = '') {
  const { rows } = await query(
    `SELECT id, job_title, required_skills, min_experience_years, bonus_criteria FROM job_criteria`
  );
  if (!rows.length) return null;

  const haystack = `${subject} ${resumeHead}`.toLowerCase();
  let best = null, bestScore = 0;

  for (const row of rows) {
    const words = row.job_title.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
    if (!words.length) continue;
    const hits  = words.filter((w) => haystack.includes(w)).length;
    const score = hits / words.length;
    if (score > bestScore && score >= 0.5) { bestScore = score; best = row; }
  }
  return best;
}

async function createJobCriteria({ job_title, required_skills, min_experience_years, bonus_criteria }) {
  const r = await query(
    `INSERT INTO job_criteria (job_title, required_skills, min_experience_years, bonus_criteria)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (job_title) DO UPDATE SET
       required_skills      = EXCLUDED.required_skills,
       min_experience_years = EXCLUDED.min_experience_years,
       bonus_criteria       = EXCLUDED.bonus_criteria
     RETURNING *`,
    [job_title, JSON.stringify(required_skills || []), min_experience_years || null, JSON.stringify(bonus_criteria || [])]
  );
  return r.rows[0];
}

async function deleteJobCriteria(id) {
  const r = await query(`DELETE FROM job_criteria WHERE id = $1 RETURNING id`, [id]);
  return r.rowCount > 0;
}

// ─── Scheduler profiles CRUD ──────────────────────────────────────────────────

async function listSchedulerProfiles() {
  const r = await query(`SELECT * FROM scheduler_profiles ORDER BY created_at DESC`);
  return r.rows;
}

async function listActiveSchedulerProfiles() {
  const r = await query(`SELECT * FROM scheduler_profiles WHERE is_active = true`);
  return r.rows;
}

async function createSchedulerProfile(data) {
  const {
    profile_name, days_to_run, run_times,
    max_emails_per_batch, active_from, active_to,
  } = data;

  const r = await query(
    `INSERT INTO scheduler_profiles
       (profile_name, days_to_run, run_times,
        max_emails_per_batch, active_from, active_to, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,false)
     RETURNING *`,
    [
      profile_name,
      days_to_run || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      run_times   || [],
      max_emails_per_batch || 20,
      active_from || null,
      active_to   || null,
    ]
  );
  return r.rows[0];
}

async function toggleSchedulerProfile(id, is_active) {
  const r = await query(
    `UPDATE scheduler_profiles
     SET is_active = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [is_active, id]
  );
  return r.rows[0] || null;
}

async function deleteSchedulerProfile(id) {
  const r = await query(`DELETE FROM scheduler_profiles WHERE id = $1 RETURNING id`, [id]);
  return r.rowCount > 0;
}

async function updateSchedulerProfile(id, { profile_name, days_to_run, run_times, max_emails_per_batch, active_from, active_to, is_active }) {
  const r = await query(
    `UPDATE scheduler_profiles
     SET profile_name         = $2,
         days_to_run          = $3,
         run_times            = $4,
         max_emails_per_batch = $5,
         active_from          = $6,
         active_to            = $7,
         is_active            = $8,
         updated_at           = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, profile_name, days_to_run, run_times, max_emails_per_batch,
     active_from || null, active_to || null, Boolean(is_active)]
  );
  return r.rows[0] || null;
}

async function touchSchedulerLastRun(id) {
  await query(
    `UPDATE scheduler_profiles SET last_run_at = NOW() WHERE id = $1`,
    [id]
  );
}

async function saveSchedulerRunSummary(id, summaryText) {
  await query(
    `UPDATE scheduler_profiles SET last_run_at = NOW(), last_run_summary = $2 WHERE id = $1`,
    [id, summaryText]
  );
}

// ─── Legacy scheduler settings (singleton) ────────────────────────────────────

async function getSchedulerSettings() {
  const r = await query(`SELECT * FROM scheduler_settings WHERE id = 1`);
  if (!r.rows.length) {
    return {
      id: 1, days_to_run: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      run_interval_hours: 1, specific_time: null,
      max_emails_per_batch: 20, scheduler_mode: 'recruitment',
      is_active: false,
    };
  }
  return r.rows[0];
}

async function saveSchedulerSettings(data) {
  const r = await query(
    `INSERT INTO scheduler_settings
       (id, days_to_run, run_interval_hours, specific_time,
        max_emails_per_batch, scheduler_mode, is_active, updated_at)
     VALUES (1,$1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT (id) DO UPDATE SET
       days_to_run          = EXCLUDED.days_to_run,
       run_interval_hours   = EXCLUDED.run_interval_hours,
       specific_time        = EXCLUDED.specific_time,
       max_emails_per_batch = EXCLUDED.max_emails_per_batch,
       scheduler_mode       = EXCLUDED.scheduler_mode,
       is_active            = EXCLUDED.is_active,
       updated_at           = NOW()
     RETURNING *`,
    [
      data.days_to_run          || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      data.run_interval_hours   || 1,
      data.specific_time        || null,
      data.max_emails_per_batch || 20,
      data.scheduler_mode       || 'recruitment',
      data.is_active !== false,
    ]
  );
  return r.rows[0];
}

// ─── Email connections CRUD ───────────────────────────────────────────────────

async function getConnections() {
  const r = await query(
    `SELECT id, label, host, port, secure, username, mailbox, is_active, created_at
     FROM email_connections ORDER BY created_at DESC`
  );
  return r.rows;
}

async function createConnection({ label, host, port, secure, username, password, mailbox }) {
  const r = await query(
    `INSERT INTO email_connections (label, host, port, secure, username, password, mailbox)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, label, host, port, secure, username, mailbox, is_active, created_at`,
    [label, host, port ?? 993, secure ?? true, username, password, mailbox || 'INBOX']
  );
  return r.rows[0];
}

async function deleteConnection(id) {
  const r = await query(`DELETE FROM email_connections WHERE id = $1 RETURNING id`, [id]);
  return r.rowCount > 0;
}

// ─── AI settings helpers ──────────────────────────────────────────────────────

async function getAiSettings() {
  const r = await query(
    `SELECT id, provider, api_key_enc, model_name, temperature FROM ai_settings WHERE id = 1`
  );
  return r.rows[0] || null;
}

/**
 * Upsert AI settings.
 * Passing null for api_key_enc keeps the existing encrypted key (via COALESCE).
 */
async function upsertAiSettings({ provider, api_key_enc, model_name, temperature }) {
  const r = await query(
    `INSERT INTO ai_settings (id, provider, api_key_enc, model_name, temperature, updated_at)
     VALUES (1, $1, $2, $3, $4, NOW())
     ON CONFLICT (id) DO UPDATE SET
       provider    = EXCLUDED.provider,
       api_key_enc = COALESCE(EXCLUDED.api_key_enc, ai_settings.api_key_enc),
       model_name  = EXCLUDED.model_name,
       temperature = EXCLUDED.temperature,
       updated_at  = NOW()
     RETURNING *`,
    [provider, api_key_enc ?? null, model_name || null, temperature]
  );
  return r.rows[0];
}

// ─── User / auth helpers ──────────────────────────────────────────────────────

async function countUsers() {
  const r = await query('SELECT COUNT(*) AS n FROM users');
  return Number(r.rows[0].n);
}

async function createUser({ email, password_hash, role = 'admin' }) {
  const r = await query(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, $3)
     RETURNING id, email, role, created_at`,
    [email, password_hash, role]
  );
  return r.rows[0];
}

async function getUserByEmail(email) {
  const r = await query(
    `SELECT id, email, password_hash, role FROM users WHERE email = $1`,
    [email]
  );
  return r.rows[0] || null;
}

async function getUserById(id) {
  const r = await query(
    `SELECT id, email, role FROM users WHERE id = $1`,
    [id]
  );
  return r.rows[0] || null;
}

// ─── Attachment helpers ───────────────────────────────────────────────────────

async function saveEmailAttachments(emailLogId, attachments) {
  if (!attachments?.length) return;
  for (const att of attachments) {
    await query(
      `INSERT INTO email_attachments (email_log_id, file_path, original_name, mime_type, size_bytes)
       VALUES ($1,$2,$3,$4,$5)`,
      [emailLogId, att.filePath, att.originalName || null, att.mimeType || null, att.sizeBytes || null]
    );
  }
}

async function getAttachmentPathsByEmailIds(emailLogIds) {
  if (!emailLogIds?.length) return [];
  const placeholders = emailLogIds.map((_, i) => `$${i + 1}`).join(',');
  const r = await query(
    `SELECT file_path FROM email_attachments WHERE email_log_id IN (${placeholders})`,
    emailLogIds
  );
  return r.rows.map((row) => row.file_path);
}

async function bulkDeleteEmailLogs(ids) {
  if (!ids?.length) return 0;
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  await query(`DELETE FROM applicants WHERE email_log_id IN (${placeholders})`, ids);
  const r = await query(`DELETE FROM email_logs WHERE id IN (${placeholders})`, ids);
  return r.rowCount;
}

module.exports = {
  ensureSchema,
  saveEmailLog, saveApplicant,
  saveEmailAttachments, getAttachmentPathsByEmailIds, bulkDeleteEmailLogs,
  listJobCriteria, findMatchingCriteria, createJobCriteria, deleteJobCriteria,
  listSchedulerProfiles, listActiveSchedulerProfiles,
  createSchedulerProfile, toggleSchedulerProfile, deleteSchedulerProfile,
  updateSchedulerProfile, touchSchedulerLastRun, saveSchedulerRunSummary,
  getSchedulerSettings, saveSchedulerSettings,
  getConnections, createConnection, deleteConnection,
  getAiSettings, upsertAiSettings,
  countUsers, createUser, getUserByEmail, getUserById,
};
