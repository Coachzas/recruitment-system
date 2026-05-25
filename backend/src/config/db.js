const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
  host:     env.DB_HOST,
  port:     env.DB_PORT,
  user:     env.DB_USER,
  password: env.DB_PASS,
  database: env.DB_NAME,
  max: 10,                 // max connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Smoke-test the connection on startup and log clearly
pool.connect((err, client, release) => {
  if (err) {
    console.error('[DB] Connection failed:', err.message);
    return;
  }
  client.query('SELECT NOW()', (queryErr, result) => {
    release();
    if (queryErr) {
      console.error('[DB] Test query failed:', queryErr.message);
    } else {
      console.log('[DB] PostgreSQL connected at', result.rows[0].now);
    }
  });
});

// Surface pool-level errors instead of crashing silently
pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

/**
 * Thin query helper — use this everywhere instead of pool.query() directly.
 * Keeps imports clean: const { query } = require('./config/db')
 */
const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };