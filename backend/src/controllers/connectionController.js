'use strict';

const {
  getConnections,
  createConnection,
  deleteConnection,
} = require('../services/storageService');
const Joi = require('joi');
const {
  normalizeGmailPassword,
  testImapConnection,
} = require('../services/imapConnectionService');

const connectionSchema = Joi.object({
  label: Joi.string().trim().min(1).max(120).required(),
  host: Joi.string().trim().hostname().max(253).required(),
  port: Joi.number().integer().min(1).max(65535).required(),
  secure: Joi.boolean().required(),
  username: Joi.string().trim().email().max(254).required(),
  password: Joi.string().min(1).max(512).required(),
  mailbox: Joi.string().trim().min(1).max(255).pattern(/^[^\u0000-\u001f\u007f]+$/).default('INBOX'),
});

function validateConnection(body) {
  const { error, value } = connectionSchema.validate(body, { abortEarly: false });
  if (error) {
    return {
      error: error.details.map((detail) => detail.message).join(' '),
    };
  }
  value.host = value.host.toLowerCase();
  value.password = normalizeGmailPassword(value.host, value.password);
  if (!value.password) {
    return { error: 'Password must contain characters.' };
  }
  return { value };
}

async function list(req, res, next) {
  try {
    const connections = await getConnections();
    res.json({ connections });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const validation = validateConnection(req.body);
    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }

    const connection = validation.value;
    await testImapConnection(connection);
    const conn = await createConnection(connection);
    res.status(201).json({ connection: conn });
  } catch (err) {
    if (err.status === 422) {
      return res.status(422).json({
        error: err.message,
        code: err.code,
        phase: err.phase,
      });
    }
    next(err);
  }
}

async function test(req, res, next) {
  const validation = validateConnection(req.body);
  if (validation.error) {
    return res.status(400).json({ ok: false, error: validation.error });
  }

  try {
    const result = await testImapConnection(validation.value);
    return res.json(result);
  } catch (err) {
    if (err.status === 422) {
      return res.status(422).json({
        ok: false,
        error: err.message,
        code: err.code,
        phase: err.phase,
      });
    }
    return next(err);
  }
}

async function remove(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = await deleteConnection(id);
    if (!deleted) return res.status(404).json({ error: 'Connection not found' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, test, remove };
