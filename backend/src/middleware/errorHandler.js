const crypto = require('node:crypto');
const multer = require('multer');
const env = require('../config/env');

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Not found' });
}

// Centralized so no route can accidentally leak a stack trace, an ORM error
// message, or a file path to the client — those go to the server log only,
// keyed by a correlation id the client can quote back when reporting an issue.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const correlationId = crypto.randomUUID();
  console.error(`[${correlationId}]`, err);

  // Multer's own errors (file too large, too many files, etc.) are a
  // MulterError with a message but no `.status` — without this they'd fall
  // through to a generic 500, which is wrong: an oversized upload is a
  // client mistake (400), not a server failure.
  const status = err.status || (err instanceof multer.MulterError ? 400 : 500);
  const message = status < 500 ? err.message : 'Internal server error';

  res.status(status).json({
    error: message,
    correlationId,
    ...(env.NODE_ENV === 'development' && status >= 500 ? { stack: err.stack } : {}),
  });
}

module.exports = { notFoundHandler, errorHandler };
