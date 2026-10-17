'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { list, create, test, remove } = require('../controllers/connectionController');

const router = express.Router();
const imapTestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many IMAP validation attempts. Please wait before trying again.' },
});

router.get('/',       list);
router.post('/test',  imapTestLimiter, test);
router.post('/',      imapTestLimiter, create);
router.delete('/:id', remove);

module.exports = router;
