'use strict';

const express = require('express');
const {
  listProfiles,
  createProfile,
  toggleProfile,
  deleteProfile,
  updateProfile,
  getSchedulerStatus,
} = require('../controllers/schedulerController');

const router = express.Router();

router.get('/status',       getSchedulerStatus); // lightweight live status (no DB)
router.get('/',             listProfiles);        // list all profiles
router.post('/',            createProfile);       // create new profile
router.patch('/:id',        updateProfile);       // edit profile + reschedule
router.patch('/:id/toggle', toggleProfile);       // toggle is_active on/off
router.delete('/:id',       deleteProfile);       // delete profile + stop cron

module.exports = router;
