const crypto = require('node:crypto');
const speakeasy = require('speakeasy');
const { encrypt, decrypt } = require('./crypto');

function generateTotpSecret(email) {
  const secret = speakeasy.generateSecret({
    length: 20,
    name: `Evidence Custody (${email})`,
    issuer: 'Evidence Custody System',
  });
  return { base32: secret.base32, otpauthUrl: secret.otpauth_url };
}

// window: 1 accepts the previous/next 30s step too, absorbing normal clock
// drift between the server and the user's authenticator app without
// widening the replay window enough to matter in practice.
//
// Returns the absolute step number that matched (not just true/false) so
// the caller can reject a step it has already accepted once — otherwise the
// same code stays valid for its whole ~30-90s window and could be replayed.
function verifyTotpStep(base32Secret, code) {
  const result = speakeasy.totp.verifyDelta({
    secret: base32Secret,
    encoding: 'base32',
    token: code,
    window: 1,
  });
  if (!result) return null;
  const currentStep = Math.floor(Date.now() / 1000 / 30);
  return currentStep + result.delta;
}

function encryptSecret(base32Secret) {
  return encrypt(base32Secret);
}

function decryptSecret(payload) {
  return decrypt(payload);
}

// Recovery codes are shown once, then only their Argon2 hash is kept — the
// same one-way treatment as passwords, since a leaked DB shouldn't hand out
// a working MFA bypass.
function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase(); // 10 hex chars
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

module.exports = {
  generateTotpSecret,
  verifyTotpStep,
  encryptSecret,
  decryptSecret,
  generateRecoveryCodes,
};
