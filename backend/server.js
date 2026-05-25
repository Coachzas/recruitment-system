'use strict';

const env = require('./src/config/env');
const app = require('./src/app');

const { query }        = require('./src/config/db');
const {
  ensureSchema, countUsers, createUser,
} = require('./src/services/storageService');
const emailPoller = require('./src/jobs/emailPoller');

const port = env.PORT || 4000;

// ─── Admin seed ───────────────────────────────────────────────────────────────
// Creates the first admin account on a fresh install. Uses ADMIN_EMAIL +
// ADMIN_PASSWORD from env if set, otherwise falls back to safe defaults with a
// very visible warning so the operator knows to change them.

async function seedAdminUser() {
  const existing = await countUsers();
  if (existing > 0) return; // already have users — skip

  const bcrypt   = require('bcryptjs');
  const adminEmail    = process.env.ADMIN_EMAIL    || 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin1234!';
  const usingDefaults = !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD;

  const hash = await bcrypt.hash(adminPassword, 12);
  await createUser({ email: adminEmail, password_hash: hash, role: 'admin' });

  if (usingDefaults) {
    console.warn('');
    console.warn('╔══════════════════════════════════════════════════════════╗');
    console.warn('║  ⚠  DEFAULT ADMIN CREDENTIALS CREATED — CHANGE NOW  ⚠  ║');
    console.warn('╠══════════════════════════════════════════════════════════╣');
    console.warn(`║  Email   : ${adminEmail.padEnd(44)} ║`);
    console.warn(`║  Password: ${adminPassword.padEnd(44)} ║`);
    console.warn('║  Set ADMIN_EMAIL + ADMIN_PASSWORD in .env to customize  ║');
    console.warn('╚══════════════════════════════════════════════════════════╝');
    console.warn('');
  } else {
    console.log(`[Auth] Admin user seeded: ${adminEmail}`);
  }
}

async function bootServer() {
  try {
    console.log('[Server] Starting Recruitment AI System Backend…');

    // 1. Verify DB connection
    await query('SELECT NOW()');
    console.log('[Server] PostgreSQL connection verified.');

    // 2. Bootstrap schema (idempotent)
    await ensureSchema();
    console.log('[Server] DB schema verified.');

    // 2b. Seed default admin user if the users table is empty
    await seedAdminUser();

    // 3. Start HTTP server
    await new Promise((resolve, reject) => {
      app.listen(port, (err) => {
        if (err) return reject(err);
        console.log(`[Server] Listening on http://localhost:${port} [${env.NODE_ENV}]`);
        resolve();
      });
    });

    // 4. Start dynamic cron scheduler (reads settings from DB)
    await emailPoller.reschedule();
    console.log('[Server] Dynamic scheduler initialised.');

  } catch (error) {
    console.error('[Server] Critical startup error:', error.message);
    process.exit(1);
  }
}

bootServer();
