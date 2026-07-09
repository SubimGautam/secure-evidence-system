const rateLimit = require('express-rate-limit');

// Baseline, generous limiter applied to every request.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// A factory, not a single shared instance: express-rate-limit tracks
// requests per middleware instance, keyed by IP alone by default. Reusing
// one instance across /login, /register, and /password-reset would pool
// their counts together, so a burst of registrations could lock out a
// legitimate login attempt from the same IP even though they're unrelated
// abuse vectors. Each route calling createAuthLimiter() gets its own
// independent counter — the per-IP half of the combined IP+account lockout
// strategy (LoginAttempt-backed account lockout in auth.service.js covers
// the other axis; architecture doc §4).
function createAuthLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again later.' },
  });
}

module.exports = { apiLimiter, createAuthLimiter };
