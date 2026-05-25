'use strict';

const express = require('express');
const { listEmails, getStats, bulkDelete, retryFailed } = require('../controllers/emailLogController');

const router = express.Router();

router.get('/stats',         getStats);
router.get('/',              listEmails);
router.post('/bulk-delete',  bulkDelete);
router.post('/retry-failed', retryFailed);

module.exports = router;
