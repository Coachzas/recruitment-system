'use strict';

const express = require('express');
const { manualFetch, fetchStatus } = require('../controllers/fetchController');

const router = express.Router();

router.post('/manual', manualFetch);
router.get('/status',  fetchStatus);

module.exports = router;
