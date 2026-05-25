'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * Express middleware that validates the Bearer JWT on every protected request.
 * Sets req.user = { id, email, role } on success.
 * Returns 401 if the token is missing, malformed, or expired.
 */
module.exports = function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';

  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Session expired.' : 'Invalid token.';
    return res.status(401).json({ error: msg });
  }
};
