'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

Object.assign(process.env, {
  DB_USER: process.env.DB_USER || 'test',
  DB_PASS: process.env.DB_PASS || 'test',
  DB_NAME: process.env.DB_NAME || 'test',
  IMAP_HOST: process.env.IMAP_HOST || 'imap.gmail.com',
  IMAP_USER: process.env.IMAP_USER || 'test@example.com',
  IMAP_PASS: process.env.IMAP_PASS || 'not-a-real-password',
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || 'http://localhost:5173',
  JWT_SECRET: process.env.JWT_SECRET || 'test-only-secret-that-is-long-enough-for-tests',
});

const {
  buildImapConfig,
  describeImapError,
  normalizeGmailPassword,
  preferDetailedError,
  resolvePublicImapHost,
} = require('../src/services/imapConnectionService');
const {
  decryptImapPassword,
  encryptImapPassword,
  isEncryptedImapPassword,
} = require('../src/services/cryptoService');

test('normalizes Gmail App Password whitespace without altering other hosts', () => {
  assert.equal(
    normalizeGmailPassword('imap.gmail.com', 'abcd efgh ijkl mnop'),
    'abcdefghijklmnop'
  );
  assert.equal(normalizeGmailPassword('imap.example.com', 'a b'), 'a b');
});

test('builds verified TLS config with original hostname for SNI', () => {
  const config = buildImapConfig({
    host: 'imap.gmail.com',
    resolvedHost: '142.250.1.1',
    port: 993,
    secure: true,
    username: 'person@example.com',
    password: 'test-only-password',
  });

  assert.equal(config.host, '142.250.1.1');
  assert.equal(config.servername, 'imap.gmail.com');
  assert.equal(config.secure, true);
  assert.equal(config.doSTARTTLS, false);
  assert.equal(config.tls.rejectUnauthorized, true);
  assert.equal(config.logger, false);

  const startTlsConfig = buildImapConfig({
    host: 'imap.example.com',
    port: 143,
    secure: false,
    username: 'person@example.com',
    password: 'test-only-password',
  });
  assert.equal(startTlsConfig.doSTARTTLS, true);
});

test('encrypts IMAP passwords and detects invalid ciphertext after tampering', () => {
  const ciphertext = encryptImapPassword('test-only-password');
  assert.equal(isEncryptedImapPassword(ciphertext), true);
  assert.equal(decryptImapPassword(ciphertext), 'test-only-password');
  const tampered = ciphertext.split(':');
  tampered[2] = `${tampered[2][0] === '0' ? '1' : '0'}${tampered[2].slice(1)}`;
  assert.throws(() => decryptImapPassword(tampered.join(':')));
});

test('redacts login names and passwords from server diagnostics', () => {
  const diagnostic = describeImapError(
    Object.assign(new Error('Command failed'), {
      responseStatus: 'NO',
      responseText: 'AUTHENTICATIONFAILED person@example.com test-only-password',
    }),
    { username: 'person@example.com', password: 'test-only-password' },
    'connect'
  );

  assert.match(diagnostic.message, /rejected the username or password/i);
  assert.doesNotMatch(diagnostic.message, /person@example\.com|test-only-password/);
  assert.equal(diagnostic.code, 'NO');
});

test('prefers detailed command errors over generic event errors', () => {
  const detailed = Object.assign(new Error('Command failed'), {
    responseText: 'Mailbox does not exist',
    responseStatus: 'NO',
  });
  assert.equal(preferDetailedError(new Error('Command failed'), detailed), detailed);
});

test('rejects literal IP addresses to prevent private-network IMAP targets', async () => {
  await assert.rejects(
    resolvePublicImapHost('127.0.0.1'),
    (error) => error.code === 'EPRIVATEHOST'
  );
  await assert.rejects(
    resolvePublicImapHost('10.0.0.1'),
    (error) => error.code === 'EPRIVATEHOST'
  );
});
