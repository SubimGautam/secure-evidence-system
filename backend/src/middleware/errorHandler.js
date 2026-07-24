const crypto = require('node:crypto');
const multer = require('multer');
const env = require('../config/env');

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Not found' });
}
function errorHandler(err, req, res, next) {
  const correlationId = crypto.randomUUID();
  console.error(`[${correlationId}]`, err);

  const status = err.status || (err instanceof multer.MulterError ? 400 : 500);
  const message = status < 500 ? err.message : 'Internal server error';

  res.status(status).json({
    error: message,
    correlationId,
    ...(env.NODE_ENV === 'development' && status >= 500 ? { stack: err.stack } : {}),
  });
}

module.exports = { notFoundHandler, errorHandler };

