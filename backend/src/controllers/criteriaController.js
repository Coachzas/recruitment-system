'use strict';

const {
  listJobCriteria,
  createJobCriteria,
  deleteJobCriteria,
} = require('../services/storageService');

async function list(req, res, next) {
  try {
    const criteria = await listJobCriteria();
    res.json({ criteria });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { job_title, required_skills, min_experience_years, bonus_criteria } = req.body;
    if (!job_title || !job_title.trim()) {
      return res.status(400).json({ error: 'job_title is required' });
    }
    if (!Array.isArray(required_skills) || required_skills.length === 0) {
      return res.status(400).json({ error: 'required_skills must be a non-empty array' });
    }
    const row = await createJobCriteria({
      job_title:            job_title.trim(),
      required_skills,
      min_experience_years: min_experience_years ? Number(min_experience_years) : null,
      bonus_criteria:       Array.isArray(bonus_criteria) ? bonus_criteria : [],
    });
    res.status(201).json({ criteria: row });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const id      = parseInt(req.params.id, 10);
    const deleted = await deleteJobCriteria(id);
    if (!deleted) return res.status(404).json({ error: 'Criteria not found' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, remove };
