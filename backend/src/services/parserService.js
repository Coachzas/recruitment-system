'use strict';

// Thin re-export — keeps import paths consistent for callers that use parserService.
const { extractText } = require('../utils/parseResume');

module.exports = { extractText };
