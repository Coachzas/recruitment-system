'use strict';

const express     = require('express');
const requireAuth = require('../middleware/auth');
const router      = express.Router();

// ── Public endpoints ──────────────────────────────────────────────────────────
router.get('/health', (_req, res) => res.json({ status: 'ok' }));
router.use('/auth', require('./auth'));

// ── All routes below this line require a valid JWT ────────────────────────────
router.use(requireAuth);

router.use('/emails',      require('./emailLogs'));
router.use('/applicants',  require('./applicants'));
router.use('/attachments', require('./attachments'));
router.use('/connections', require('./connections'));
router.use('/criteria',    require('./criteria'));
router.use('/fetch',       require('./fetch'));
router.use('/scheduler',   require('./scheduler'));
router.use('/settings',    require('./settings'));

module.exports = router;
