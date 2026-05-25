'use strict';

const Anthropic              = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const env                    = require('../config/env');

// ── Quota error — signals the batch loop to stop immediately ─────────────────
class QuotaError extends Error {
  constructor(message) {
    super(message);
    this.name         = 'QuotaError';
    this.isQuotaError = true;
  }
}

// ── Retry logic ───────────────────────────────────────────────────────────────
// 429 is NOT retried — quota exhaustion is never worth retrying.
const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);
const MAX_ATTEMPTS     = 3;

async function withRetry(fn) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      const isQuota =
        err.status === 429 ||
        /RESOURCE_EXHAUSTED|quota/i.test(err.message || '');
      if (isQuota) {
        throw new QuotaError(`[AI] Quota exhausted (${err.message ?? err.status})`);
      }

      const isRetryable =
        (typeof err.status === 'number' && RETRYABLE_STATUS.has(err.status)) ||
        err.name === 'APIConnectionError' ||
        err.name === 'APITimeoutError'    ||
        err.code  === 'ECONNRESET'        ||
        err.code  === 'ETIMEDOUT'         ||
        /UNAVAILABLE/i.test(err.message || '');

      if (!isRetryable || attempt === MAX_ATTEMPTS) throw err;

      const delayMs = 1000 * Math.pow(2, attempt - 1);
      console.warn(
        `[AI] Attempt ${attempt}/${MAX_ATTEMPTS} failed (${err.message ?? err.status}); ` +
        `retrying in ${delayMs / 1000}s…`
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

// ── JSON parsing helper ───────────────────────────────────────────────────────
function parseJsonResponse(raw) {
  const text = raw.trim();
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`AI returned non-JSON output: ${text.slice(0, 300)}`);
  }
}

// ── Dynamic settings cache ────────────────────────────────────────────────────
// Settings are loaded from the ai_settings DB table on first use and cached
// for 60 s.  Calling reloadAiSettings() clears the cache immediately so the
// next request picks up freshly saved values.

let _settingsCache   = null;
let _settingsCacheAt = 0;
const SETTINGS_TTL_MS = 60_000;

async function getEffectiveSettings() {
  const now = Date.now();
  if (_settingsCache && now - _settingsCacheAt < SETTINGS_TTL_MS) {
    return _settingsCache;
  }

  // Env defaults — used when DB has no row or the row has no key
  const envProvider = env.AI_PROVIDER || 'claude';
  let provider    = envProvider;
  let apiKey      = envProvider === 'gemini' ? env.GEMINI_API_KEY : env.ANTHROPIC_API_KEY;
  let modelName   = envProvider === 'gemini'
    ? (env.GEMINI_MODEL || 'gemini-1.5-flash')
    : (env.CLAUDE_MODEL || 'claude-sonnet-4-6');
  let temperature = 0.0;

  // Overlay with DB settings when available
  try {
    // Lazy require avoids circular-dependency issues at module-load time
    const { getAiSettings } = require('./storageService');
    const { decrypt }       = require('./cryptoService');
    const row = await getAiSettings();
    if (row) {
      provider    = row.provider   || provider;
      modelName   = row.model_name || modelName;
      temperature = row.temperature != null ? parseFloat(row.temperature) : temperature;
      if (row.api_key_enc) {
        try { apiKey = decrypt(row.api_key_enc); } catch {}
      }
    }
  } catch { /* DB not ready — use env */ }

  _settingsCache   = { provider, apiKey: apiKey || null, modelName, temperature: isNaN(temperature) ? 0 : temperature };
  _settingsCacheAt = now;
  return _settingsCache;
}

/** Clear cache so the next AI call picks up freshly saved DB settings. */
function reloadAiSettings() {
  _settingsCache   = null;
  _settingsCacheAt = 0;
}

// ── Claude implementation ─────────────────────────────────────────────────────
async function extractWithClaude(prompt) {
  const { apiKey, modelName, temperature } = await getEffectiveSettings();
  if (!apiKey) throw new Error('No API key configured for Claude. Add one in AI Settings or set ANTHROPIC_API_KEY.');

  const response = await withRetry(() =>
    new Anthropic({ apiKey }).messages.create({
      model:       modelName || 'claude-sonnet-4-6',
      max_tokens:  512,
      temperature: temperature ?? 0,
      messages:    [{ role: 'user', content: prompt }],
    })
  );
  return parseJsonResponse(response.content[0]?.text || '');
}

// ── Gemini diagnostics ────────────────────────────────────────────────────────
function listGeminiModels(apiKey) {
  const https = require('https');
  return new Promise((resolve) => {
    https
      .get(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try { resolve((JSON.parse(data).models || []).map((m) => m.name)); }
            catch { resolve([]); }
          });
        }
      )
      .on('error', () => resolve([]));
  });
}

// ── Gemini implementation ─────────────────────────────────────────────────────
async function extractWithGemini(prompt) {
  const { apiKey, modelName } = await getEffectiveSettings();
  if (!apiKey) throw new Error('No API key configured for Gemini. Add one in AI Settings or set GEMINI_API_KEY.');

  try {
    const client  = new GoogleGenerativeAI(apiKey);
    const modelId = (modelName || 'gemini-1.5-flash').replace(/^models\//, '');
    const model   = client.getGenerativeModel({ model: modelId });
    const result  = await withRetry(() => model.generateContent(prompt));
    return parseJsonResponse(result.response.text());
  } catch (err) {
    const is404 = err.status === 404 || /404|not.?found/i.test(err.message || '');
    if (is404) {
      const { apiKey: k } = await getEffectiveSettings();
      const models = await listGeminiModels(k);
      if (models.length) {
        console.error('[AI:gemini] 404 — available model names:\n  ' + models.join('\n  '));
      } else {
        console.error('[AI:gemini] 404 — could not retrieve available models (check your API key).');
      }
    }
    throw err;
  }
}

// ── Image OCR — Claude vision ──────────────────────────────────────────────────
async function extractTextFromImageWithClaude(imageBuffer, mimeType) {
  const { apiKey, modelName } = await getEffectiveSettings();
  if (!apiKey) throw new Error('No API key configured for Claude. Add one in AI Settings.');

  const base64   = imageBuffer.toString('base64');
  const safeMime = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType)
    ? (mimeType === 'image/jpg' ? 'image/jpeg' : mimeType)
    : 'image/jpeg';

  const response = await withRetry(() =>
    new Anthropic({ apiKey }).messages.create({
      model:       modelName || 'claude-sonnet-4-6',
      max_tokens:  2048,
      temperature: 0, // deterministic for OCR
      messages: [{
        role: 'user',
        content: [
          {
            type:   'image',
            source: { type: 'base64', media_type: safeMime, data: base64 },
          },
          {
            type: 'text',
            text: 'This image is a resume or CV. Extract all text content exactly as it appears, preserving structure (sections, bullet points, dates). Return only the extracted text — no commentary, no JSON.',
          },
        ],
      }],
    })
  );
  return response.content[0]?.text || '';
}

// ── Image OCR — Gemini vision ──────────────────────────────────────────────────
async function extractTextFromImageWithGemini(imageBuffer, mimeType) {
  const { apiKey, modelName } = await getEffectiveSettings();
  if (!apiKey) throw new Error('No API key configured for Gemini. Add one in AI Settings.');

  const base64   = imageBuffer.toString('base64');
  const safeMime = mimeType === 'image/jpg' ? 'image/jpeg' : (mimeType || 'image/jpeg');
  const client   = new GoogleGenerativeAI(apiKey);
  const modelId  = (modelName || 'gemini-1.5-flash').replace(/^models\//, '');
  const model    = client.getGenerativeModel({ model: modelId });

  const result = await withRetry(() =>
    model.generateContent([
      { inlineData: { data: base64, mimeType: safeMime } },
      'This image is a resume or CV. Extract all text content exactly as it appears, preserving structure (sections, bullet points, dates). Return only the extracted text — no commentary, no JSON.',
    ])
  );
  return result.response.text() || '';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send a prompt to the configured AI provider and parse the JSON candidate
 * record it returns.
 */
async function extractCandidateData(prompt) {
  const { provider } = await getEffectiveSettings();
  return provider === 'gemini' ? extractWithGemini(prompt) : extractWithClaude(prompt);
}

/**
 * Extract plain text from an image buffer using AI vision.
 */
async function extractTextFromImage(imageBuffer, mimeType) {
  const { provider } = await getEffectiveSettings();
  return provider === 'gemini'
    ? extractTextFromImageWithGemini(imageBuffer, mimeType)
    : extractTextFromImageWithClaude(imageBuffer, mimeType);
}

module.exports = { extractCandidateData, extractTextFromImage, reloadAiSettings, QuotaError };
