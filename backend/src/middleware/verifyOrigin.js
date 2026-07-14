const httpError = require('../lib/httpError');
const env = require('../config/env');

function verifyOrigin(req, res, next) {
  const origin = req.get('origin') || req.get('referer');
  if (!origin || !origin.startsWith(env.CORS_ORIGIN)) {
    return next(httpError(403, 'Request origin not allowed'));
  }
  next();
}

module.exports = verifyOrigin;
