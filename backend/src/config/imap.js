const env = require('./env');

/**
 * ImapFlow connection configuration.
 * Supports both standard IMAP (port 143 + STARTTLS) and
 * IMAPS (port 993 + TLS) depending on IMAP_SECURE.
 */
const imapConfig = {
  host: env.IMAP_HOST,
  port: env.IMAP_PORT,
  secure: env.IMAP_SECURE,   // true = port 993 TLS, false = port 143 STARTTLS
  auth: {
    user: env.IMAP_USER,
    pass: env.IMAP_PASS,
  },
  logger: false,             // set to true to see raw IMAP protocol logs
  tls: {
    rejectUnauthorized: env.NODE_ENV === 'production', // strict only in prod
  },
};

module.exports = imapConfig;