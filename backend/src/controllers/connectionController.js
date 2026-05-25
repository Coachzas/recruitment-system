'use strict';

const {
  getConnections,
  createConnection,
  deleteConnection,
} = require('../services/storageService');

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
    const { label, host, port, secure, username, password, mailbox } = req.body;
    if (!label || !host || !username || !password) {
      return res.status(400).json({ error: 'label, host, username, and password are required' });
    }
    const conn = await createConnection({ label, host, port, secure, username, password, mailbox });
    res.status(201).json({ connection: conn });
  } catch (err) {
    next(err);
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

module.exports = { list, create, remove };
