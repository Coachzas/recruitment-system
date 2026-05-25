const dotenv = require('dotenv');
const Joi = require('joi');
const path = require('path');

// ดึงไฟล์ .env จากโฟลเดอร์ root ของ backend
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const schema = Joi.object({
  // ── Server ──
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().integer().positive().default(4000),

  // ── Database ──
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().integer().positive().default(5432),
  DB_USER: Joi.string().required(),
  DB_PASS: Joi.string().required(),
  DB_NAME: Joi.string().required(),

  // ── IMAP Email Ingestion (อัปเดตตามที่ Claude สั่งล่าสุด) ──
  IMAP_HOST: Joi.string().required(),
  IMAP_PORT: Joi.number().integer().positive().default(993),
  IMAP_SECURE: Joi.boolean().default(true),
  IMAP_USER: Joi.string().email().required(),
  IMAP_PASS: Joi.string().required(),
  IMAP_MAILBOX: Joi.string().default('INBOX'),
  IMAP_POLL_INTERVAL_MS: Joi.number().integer().positive().default(60000),

  // ── AI Provider — set AI_PROVIDER='gemini' to switch to Google Gemini ──
  AI_PROVIDER: Joi.string().valid('claude', 'gemini').default('claude'),

  // ── Anthropic Claude AI ──
  ANTHROPIC_API_KEY: Joi.string().optional(),
  CLAUDE_MODEL: Joi.string().default('claude-sonnet-4-6'),

  // ── Google Gemini AI ──
  GEMINI_API_KEY: Joi.string().optional(),
  GEMINI_MODEL: Joi.string().default('gemini-1.5-flash'),

  // ── CORS ──
  ALLOWED_ORIGIN: Joi.string().required(),

  // ── Auth ──
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),

  // ── Encryption (optional) — if not set, JWT_SECRET is used as derivation base ──
  ENCRYPTION_KEY: Joi.string().optional(),
}).unknown(true); // ยอมให้มีตัวแปรระบบอื่นๆ ปนเข้ามาได้ เช่น PATH, HOME

const { error, value: env } = schema.validate(process.env);

if (error) {
  throw new Error(`Environment validation failed: ${error.message}`);
}

module.exports = env;