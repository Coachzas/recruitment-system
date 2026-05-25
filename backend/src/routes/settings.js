'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/aiSettingsController');

router.get( '/ai',      ctrl.getSettings);
router.post('/ai',      ctrl.saveSettings);
router.post('/ai/test', ctrl.testConnection);

module.exports = router;
