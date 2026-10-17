'use strict';

const crypto = require('crypto');
const env    = require('../config/env');

// ─── Key derivation ───────────────────────────────────────────────────────────
// Uses ENCRYPTION_KEY env var if set; otherwise derives a 32-byte key from
// JWT_SECRET via SHA-256 with a domain prefix so it's distinct from any JWT
// key material.  Either way the key is stable across restarts.

function getDerivedKey() {
  const source = env.ENCRYPTION_KEY || env.JWT_SECRET;
  return crypto.createHash('sha256').update('ai-settings:' + source).digest(); // 32 bytes
}

// ─── AES-256-GCM helpers ─────────────────────────────────────────────────────
// Stored format:  <iv_hex>:<authTag_hex>:<ciphertext_hex>

const SEP = ':';

function encrypt(plaintext) {
  if (!plaintext) return null;
  const key     = getDerivedKey();
  const iv      = crypto.randomBytes(16);
  const cipher  = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc     = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), enc.toString('hex')].join(SEP);
}

function decrypt(stored) {
  if (!stored) return null;
  const parts = stored.split(SEP);
  if (parts.length !== 3) throw new Error('Invalid encrypted value format');
  const [ivHex, tagHex, encHex] = parts;
  const key      = getDerivedKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

function getImapEncryptionKey() {
  const source = env.ENCRYPTION_KEY || env.JWT_SECRET;
  return crypto.createHash('sha256').update('imap-connections:' + source).digest();
}

function encryptImapPassword(plaintext) {
  if (!plaintext) throw new Error('IMAP password is required');
  const key = getImapEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptImapPassword(stored) {
  if (!stored) throw new Error('IMAP password is missing');
  const [version, ivHex, tagHex, encryptedHex, ...extra] = stored.split(':');
  if (version !== 'v1' || !ivHex || !tagHex || encryptedHex === undefined || extra.length) {
    throw new Error('Invalid encrypted IMAP password format');
  }

  const key = getImapEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

function isEncryptedImapPassword(stored) {
  return typeof stored === 'string' && stored.startsWith('v1:');
}

// Returns "****" + last 4 chars so the user can recognise which key is set
// without ever exposing the full value.
function maskApiKey(plaintext) {
  if (!plaintext) return '';
  if (plaintext.length <= 4) return '****';
  return `****${plaintext.slice(-4)}`;
}

// True when the frontend echoes back a masked sentinel ("****…")
function isMaskedSentinel(val) {
  return !val || /^\*{4}/.test(val);
}

module.exports = {
  encrypt,
  decrypt,
  encryptImapPassword,
  decryptImapPassword,
  isEncryptedImapPassword,
  maskApiKey,
  isMaskedSentinel,
};
