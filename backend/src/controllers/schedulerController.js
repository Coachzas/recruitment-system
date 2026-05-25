'use strict';

const {
  listSchedulerProfiles,
  createSchedulerProfile,
  toggleSchedulerProfile,
  deleteSchedulerProfile,
  updateSchedulerProfile,
} = require('../services/storageService');

const emailPoller = require('../jobs/emailPoller');

// GET /api/scheduler
async function listProfiles(req, res, next) {
  try {
    const profiles      = await listSchedulerProfiles();
    const status        = emailPoller.getStatus();
    const registeredIds = new Set(status.profiles.map((p) => p.id));
    const firingIds     = new Set(status.firing);

    const enriched = profiles.map((p) => ({
      ...p,
      next_run:   emailPoller.computeNextRun(p),
      is_running: registeredIds.has(p.id),
      is_firing:  firingIds.has(p.id),
    }));

    res.json({ profiles: enriched, scheduler_status: status });
  } catch (err) {
    next(err);
  }
}

// GET /api/scheduler/status  (lightweight — no DB, reads in-memory state only)
function getSchedulerStatus(req, res) {
  res.json(emailPoller.getStatus());
}

// POST /api/scheduler
async function createProfile(req, res, next) {
  try {
    const {
      profile_name, days_to_run, run_times,
      max_emails_per_batch, active_from, active_to,
    } = req.body;

    if (!profile_name?.trim()) {
      return res.status(400).json({ error: 'profile_name is required.' });
    }
    if (!Array.isArray(days_to_run) || days_to_run.length === 0) {
      return res.status(400).json({ error: 'days_to_run must be a non-empty array.' });
    }
    if (!Array.isArray(run_times) || run_times.length === 0) {
      return res.status(400).json({ error: 'run_times must be a non-empty array of HH:MM strings.' });
    }

    const profile = await createSchedulerProfile({
      profile_name:         profile_name.trim(),
      days_to_run,
      run_times,
      max_emails_per_batch: max_emails_per_batch ? Number(max_emails_per_batch) : 20,
      active_from: active_from || null,
      active_to:   active_to   || null,
    });

    res.status(201).json({ profile: { ...profile, next_run: null, is_running: false } });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/scheduler/:id/toggle
async function toggleProfile(req, res, next) {
  try {
    const id       = Number(req.params.id);
    const isActive = req.body.is_active !== false && req.body.is_active !== 'false';

    const profile = await toggleSchedulerProfile(id, isActive);
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });

    if (isActive) {
      emailPoller.startProfileTask(profile);
    } else {
      emailPoller.stopProfileTask(id);
    }

    res.json({
      profile: {
        ...profile,
        next_run:   emailPoller.computeNextRun(profile),
        is_running: isActive,
      },
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/scheduler/:id
async function deleteProfile(req, res, next) {
  try {
    const id = Number(req.params.id);
    emailPoller.stopProfileTask(id);
    const deleted = await deleteSchedulerProfile(id);
    if (!deleted) return res.status(404).json({ error: 'Profile not found.' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/scheduler/:id  — full update; reschedules cron automatically
async function updateProfile(req, res, next) {
  try {
    const id = Number(req.params.id);
    const {
      profile_name, days_to_run, run_times,
      max_emails_per_batch, active_from, active_to, is_active,
    } = req.body;

    if (!profile_name?.trim()) {
      return res.status(400).json({ error: 'profile_name is required.' });
    }
    if (!Array.isArray(days_to_run) || days_to_run.length === 0) {
      return res.status(400).json({ error: 'days_to_run must be a non-empty array.' });
    }
    if (!Array.isArray(run_times) || run_times.length === 0) {
      return res.status(400).json({ error: 'run_times must be a non-empty array of HH:MM strings.' });
    }

    const profile = await updateSchedulerProfile(id, {
      profile_name:         profile_name.trim(),
      days_to_run,
      run_times,
      max_emails_per_batch: Number(max_emails_per_batch) || 20,
      active_from:          active_from || null,
      active_to:            active_to   || null,
      is_active:            is_active !== false && is_active !== 'false',
    });

    if (!profile) return res.status(404).json({ error: 'Profile not found.' });

    // Reschedule with new settings (startProfileTask calls stopProfileTask first)
    if (profile.is_active) {
      emailPoller.startProfileTask(profile);
    } else {
      emailPoller.stopProfileTask(id);
    }

    const status     = emailPoller.getStatus();
    const firingIds  = new Set(status.firing);

    res.json({
      profile: {
        ...profile,
        next_run:   emailPoller.computeNextRun(profile),
        is_running: profile.is_active,
        is_firing:  firingIds.has(id),
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listProfiles, createProfile, toggleProfile, deleteProfile,
  updateProfile, getSchedulerStatus,
};
