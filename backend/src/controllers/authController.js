'use strict';

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const env    = require('../config/env');
const { getUserByEmail } = require('../services/storageService');

// POST /api/auth/login
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await getUserByEmail(String(email).toLowerCase().trim());

    // Use a constant-time comparison even when user is not found (dummy hash prevents timing attacks)
    const DUMMY_HASH = '$2a$12$invalidhashusedtopreventimingtiming0000000000000000000000';
    const hashToCompare = user ? user.password_hash : DUMMY_HASH;
    const match = await bcrypt.compare(String(password), hashToCompare);

    if (!user || !match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/me  (requires auth middleware)
function me(req, res) {
  res.json({ user: req.user });
}

// POST /api/auth/logout  (requires auth middleware)
// JWT is stateless — actual invalidation is handled client-side by deleting the token.
function logout(_req, res) {
  res.json({ success: true });
}

module.exports = { login, me, logout };
