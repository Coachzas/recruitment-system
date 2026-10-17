'use strict';

const dns = require('dns').promises;
const net = require('net');
const { ImapFlow } = require('imapflow');

const CONNECTION_TIMEOUT_MS = 15_000;
const GREETING_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 60_000;

function normalizeGmailPassword(host, password) {
  return host.toLowerCase() === 'imap.gmail.com'
    ? password.replace(/\s+/g, '')
    : password;
}

function buildImapConfig(connection) {
  return {
    host: connection.resolvedHost || connection.host,
    port: Number(connection.port),
    secure: Boolean(connection.secure),
    doSTARTTLS: !connection.secure,
    servername: connection.host,
    auth: {
      user: connection.username,
      pass: connection.password,
    },
    logger: false,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: GREETING_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
    tls: { rejectUnauthorized: true },
  };
}

function ipv4Number(address) {
  return address.split('.').reduce((value, octet) => (value << 8) | Number(octet), 0) >>> 0;
}

function isPublicIpv4(address) {
  if (net.isIP(address) !== 4) return false;
  const value = ipv4Number(address);
  const ranges = [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
    ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
    ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
    ['224.0.0.0', 4], ['240.0.0.0', 4],
  ];
  return !ranges.some(([network, bits]) => {
    const mask = (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (ipv4Number(network) & mask);
  });
}

async function resolvePublicImapHost(host) {
  if (net.isIP(host)) {
    const error = new Error('Use an IMAP hostname, not an IP address.');
    error.code = 'EPRIVATEHOST';
    throw error;
  }

  const { address } = await dns.lookup(host, { family: 4 });
  if (!isPublicIpv4(address)) {
    const error = new Error('The IMAP hostname must resolve to a public IPv4 address.');
    error.code = 'EPRIVATEHOST';
    throw error;
  }
  return address;
}

function redact(value, connection) {
  let text = String(value || '').replace(/[\r\n\t]+/g, ' ').trim();
  for (const secret of [connection.password, connection.username]) {
    if (secret) text = text.split(secret).join('[redacted]');
  }
  return text.slice(0, 300);
}

function preferDetailedError(primary, eventError) {
  if (!eventError) return primary;
  const score = (error) => (
    Number(Boolean(error.responseText)) * 4 +
    Number(Boolean(error.responseStatus)) * 3 +
    Number(Boolean(error.code))
  );
  return score(eventError) > score(primary) ? eventError : primary;
}

function describeImapError(error, connection, phase = 'connection') {
  const code = error.code || error.responseStatus || 'IMAP_ERROR';
  const serverMessage = error.responseText || error.message;
  const detail = redact(serverMessage, connection);
  const codeAndDetail = `${code} ${detail}`;
  let message;

  if (/AUTHENTICATIONFAILED|AUTHENTICATION FAILED|LOGIN failed|Invalid credentials|Username and password not accepted/i.test(detail)) {
    message = 'The IMAP server rejected the username or password. For Gmail, use a Google App Password.';
  } else if (/ETIMEDOUT|CONNECT_TIMEOUT|Greeting timeout/i.test(codeAndDetail)) {
    message = 'Timed out connecting to the IMAP server. Check the host, port, firewall, and TLS setting.';
  } else if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EAI_AGAIN/i.test(codeAndDetail)) {
    message = 'Could not reach the IMAP server. Check the host, port, and network/DNS access.';
  } else if (code === 'EPRIVATEHOST') {
    message = detail;
  } else if (/certificate|CERT_|ERR_TLS_CERT|ERR_SSL_WRONG_VERSION_NUMBER|EPROTO/i.test(codeAndDetail)) {
    message = 'TLS negotiation or certificate verification failed. Check the TLS setting, host, port, and certificate.';
  } else if (error.responseStatus) {
    const nextStep = phase === 'mailbox'
      ? 'Check the mailbox name and account permissions.'
      : phase === 'connect'
        ? 'Check the username, password, and account permissions.'
        : 'Check mailbox permissions and the IMAP server response.';
    message = `The IMAP server rejected a command (${error.responseStatus}). ${nextStep}`;
  } else if (/mailbox|folder|does not exist|not found/i.test(detail)) {
    message = 'The IMAP login succeeded, but the requested mailbox could not be opened.';
  } else if (error.responseText) {
    message = `The IMAP server rejected a command: ${detail}`;
  } else {
    message = `IMAP ${phase} failed: ${detail || 'No further server details were provided.'}`;
  }

  return { code, phase, message };
}

async function testImapConnection(connection) {
  let client;
  let phase = 'DNS lookup';
  let lock;
  let eventError;

  try {
    const resolvedHost = await resolvePublicImapHost(connection.host);
    client = new ImapFlow(buildImapConfig({ ...connection, resolvedHost }));
    client.on('error', (error) => {
      eventError = error;
    });
    phase = 'connect';
    await client.connect();
    phase = 'mailbox';
    lock = await client.getMailboxLock(connection.mailbox || 'INBOX');
    return { ok: true, message: 'IMAP login and mailbox access verified.' };
  } catch (error) {
    const diagnostic = describeImapError(preferDetailedError(error, eventError), connection, phase);
    const validationError = new Error(diagnostic.message);
    validationError.code = diagnostic.code;
    validationError.phase = diagnostic.phase;
    validationError.status = 422;
    throw validationError;
  } finally {
    if (lock) lock.release();
    if (client?.usable) {
      try {
        await client.logout();
      } catch (error) {
        console.warn('[IMAP] Logout after validation failed:', describeImapError(error, connection, 'logout').message);
        client.close();
      }
    } else {
      client?.close();
    }
  }
}

module.exports = {
  buildImapConfig,
  describeImapError,
  normalizeGmailPassword,
  preferDetailedError,
  testImapConnection,
  resolvePublicImapHost,
};
