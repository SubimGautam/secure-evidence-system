const argon2 = require('argon2');

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
