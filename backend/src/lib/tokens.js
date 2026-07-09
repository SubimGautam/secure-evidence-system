const jwt = require('jsonwebtoken');
const env = require('../config/env');

const ISSUER = 'evidence-custody-api';

// `type` is checked on every verify below specifically so an MFA-pending
// token — deliberately scoped to do nothing but complete a login — can never
// be replayed against a route that expects a full access token, even though
// both are signed with the same secret.
function signAccessToken({ id, role, sessionId }) {
  return jwt.sign({ sub: id, role, sessionId, type: 'access' }, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
    issuer: ISSUER,
  });
}

function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.JWT_SECRET, { issuer: ISSUER });
  if (payload.type !== 'access') throw new Error('Not an access token');
  return payload;
}

// Short-lived and single-purpose: proves "this client just supplied the
// correct password for this account," nothing more. It cannot reach any
// resource route — only POST /auth/login/mfa accepts it.
function signMfaPendingToken({ id }) {
  return jwt.sign({ sub: id, type: 'mfa_pending' }, env.JWT_SECRET, {
    expiresIn: '5m',
    issuer: ISSUER,
  });
}

function verifyMfaPendingToken(token) {
  const payload = jwt.verify(token, env.JWT_SECRET, { issuer: ISSUER });
  if (payload.type !== 'mfa_pending') throw new Error('Not an MFA-pending token');
  return payload;
}

module.exports = { signAccessToken, verifyAccessToken, signMfaPendingToken, verifyMfaPendingToken };
