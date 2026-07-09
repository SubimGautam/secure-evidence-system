const httpError = require('../lib/httpError');
const env = require('../config/env');

// Defense in depth for the two endpoints that authenticate via the refresh
// cookie alone rather than a Bearer header (/auth/refresh, /auth/logout):
// SameSite=Strict already stops a browser attaching that cookie to a
// cross-site request in every modern browser, but this doesn't lean on that
// alone — it also checks the browser-supplied Origin (falling back to
// Referer) actually matches our own frontend, and fails closed if neither
// header is present rather than assuming same-origin.
function verifyOrigin(req, res, next) {
  const origin = req.get('origin') || req.get('referer');
  if (!origin || !origin.startsWith(env.CORS_ORIGIN)) {
    return next(httpError(403, 'Request origin not allowed'));
  }
  next();
}

module.exports = verifyOrigin;
