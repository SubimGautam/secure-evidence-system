const argon2 = require('argon2');

// OWASP Password Storage Cheat Sheet minimums for argon2id (memory in KiB).
// Explicit rather than relying on the library's defaults, which can change
// between versions without notice.
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

function hashPassword(plaintext) {
  return argon2.hash(plaintext, HASH_OPTIONS);
}

function verifyPassword(hash, plaintext) {
  return argon2.verify(hash, plaintext);
}

module.exports = { hashPassword, verifyPassword };
