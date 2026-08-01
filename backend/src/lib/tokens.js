const jwt = require('jsonwebtoken');
const env = require('../config/env');

const ISSUER = 'evidence-custody-api';

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
