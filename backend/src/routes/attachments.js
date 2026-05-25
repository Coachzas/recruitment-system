'use strict';

const express = require('express');
const { downloadAttachment, inlineAttachment } = require('../controllers/attachmentController');

const router = express.Router();

router.get('/:id/download', downloadAttachment);
router.get('/:id/inline',   inlineAttachment);

module.exports = router;
