'use strict';

const express    = require('express');
const rateLimit  = require('express-rate-limit');
const requireAuth = require('../middleware/auth');
const { login, me, logout } = require('../controllers/authController');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again after 15 minutes.' },
});

router.post('/login',  loginLimiter, login);           // public
router.get('/me',      requireAuth, me); // protected
router.post('/logout', requireAuth, logout); // protected

module.exports = router;
