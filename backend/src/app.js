'use strict';

const env = require('./config/env');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');
const morgan = require('morgan');

const app = express();

app.use(helmet());
app.use(cors({ origin: env.ALLOWED_ORIGIN, credentials: true }));
app.use(express.json());

// พ่น log เวลาเทสระบบในโหมด development
if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use('/api', routes);

// Global Error Handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;