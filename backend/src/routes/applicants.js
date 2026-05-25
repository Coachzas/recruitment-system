'use strict';

const express = require('express');
const { list, getOne, rescore, rescoreAll, downloadResume } = require('../controllers/applicantController');

const router = express.Router();

// POST /rescore-all must come before /:id to avoid route shadowing
router.post('/rescore-all', rescoreAll);

router.get('/',             list);
router.get('/:id/resume',   downloadResume);
router.get('/:id',          getOne);
router.post('/:id/rescore', rescore);

module.exports = router;
