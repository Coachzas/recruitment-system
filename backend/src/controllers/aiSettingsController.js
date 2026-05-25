'use strict';

const Anthropic              = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const { getAiSettings, upsertAiSettings } = require('../services/storageService');
const { encrypt, decrypt, maskApiKey, isMaskedSentinel } = require('../services/cryptoService');
const { reloadAiSettings }                = require('../services/aiService');

// ─── GET /api/settings/ai ─────────────────────────────────────────────────────

async function getSettings(req, res, next) {
  try {
    const row = await getAiSettings();

    if (!row) {
      return res.json({
        provider:    'claude',
        api_key:     '',
        model_name:  '',
        temperature: 0.0,
      });
    }

    let plainKey = null;
    if (row.api_key_enc) {
      try { plainKey = decrypt(row.api_key_enc); } catch {}
    }

    res.json({
      provider:    row.provider,
      api_key:     maskApiKey(plainKey),       // never send the real key
      model_name:  row.model_name || '',
      temperature: parseFloat(row.temperature) || 0.0,
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/settings/ai ────────────────────────────────────────────────────

async function saveSettings(req, res, next) {
  try {
    const { provider, api_key, model_name, temperature } = req.body;

    if (!provider || !['claude', 'gemini'].includes(provider)) {
      return res.status(400).json({ error: 'provider must be "claude" or "gemini"' });
    }

    const temp = parseFloat(temperature);
    if (isNaN(temp) || temp < 0 || temp > 1) {
      return res.status(400).json({ error: 'temperature must be between 0.0 and 1.0' });
    }

    // Only encrypt + store when a real (non-masked) key is provided.
    // Passing null triggers the COALESCE in the upsert, preserving the existing key.
    const encryptedKey = (!api_key || isMaskedSentinel(api_key))
      ? null
      : encrypt(api_key);

    const row = await upsertAiSettings({
      provider,
      api_key_enc: encryptedKey,
      model_name:  model_name || null,
      temperature: temp,
    });

    // Invalidate the AI service cache so the next pipeline call uses the new settings
    reloadAiSettings();

    let plainKey = null;
    if (row.api_key_enc) {
      try { plainKey = decrypt(row.api_key_enc); } catch {}
    }

    res.json({
      ok:          true,
      provider:    row.provider,
      api_key:     maskApiKey(plainKey),
      model_name:  row.model_name || '',
      temperature: parseFloat(row.temperature) || 0.0,
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/settings/ai/test ───────────────────────────────────────────────

async function testConnection(req, res, next) {
  try {
    const { provider, api_key, model_name } = req.body;

    if (!provider || !['claude', 'gemini'].includes(provider)) {
      return res.status(400).json({ ok: false, error: 'provider must be "claude" or "gemini"' });
    }

    // Resolve the key: use form value if real, otherwise load from DB
    let resolvedKey = (!api_key || isMaskedSentinel(api_key)) ? null : api_key;

    if (!resolvedKey) {
      const row = await getAiSettings();
      if (row?.api_key_enc) {
        try { resolvedKey = decrypt(row.api_key_enc); } catch {}
      }
    }

    if (!resolvedKey) {
      return res.status(400).json({ ok: false, error: 'No API key available. Save a key first.' });
    }

    const modelId = (model_name || '').trim() || null;
    const result  = await runTestRequest(provider, resolvedKey, modelId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function runTestRequest(provider, apiKey, modelName) {
  try {
    if (provider === 'claude') {
      const response = await new Anthropic({ apiKey }).messages.create({
        model:      modelName || 'claude-sonnet-4-6',
        max_tokens: 16,
        messages:   [{ role: 'user', content: 'Reply with only the word: OK' }],
      });
      const text = response.content[0]?.text?.trim() || 'connected';
      return { ok: true, message: `Claude responded: "${text}"` };
    }

    if (provider === 'gemini') {
      const client  = new GoogleGenerativeAI(apiKey);
      const model   = client.getGenerativeModel({
        model: (modelName || 'gemini-1.5-flash').replace(/^models\//, ''),
      });
      const result  = await model.generateContent('Reply with only the word: OK');
      const text    = result.response.text()?.trim() || 'connected';
      return { ok: true, message: `Gemini responded: "${text}"` };
    }

    return { ok: false, error: 'Unknown provider' };
  } catch (err) {
    return { ok: false, error: err.message || 'Connection failed' };
  }
}

module.exports = { getSettings, saveSettings, testConnection };
