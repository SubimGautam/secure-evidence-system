const crypto = require('node:crypto');
const env = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit nonce, the size GCM is designed for
const AUTH_TAG_LENGTH = 16;
const KEY = Buffer.from(env.ENCRYPTION_KEY, 'hex');

// Encrypted at rest, distinct from password hashing: this needs to be
// decryptable again (to generate a TOTP code server-side), so it's
// encryption, not a one-way hash — that's why MFA secrets don't go through
// argon2 like passwords/tokens do.
function encrypt(plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((buf) => buf.toString('hex')).join(':');
}

function decrypt(payload) {
  const [ivHex, authTagHex, ciphertextHex] = payload.split(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

// Binary counterpart to encrypt/decrypt above, for evidence files rather
// than short text secrets: operates on Buffers directly instead of
// utf8-decoding, and packs iv/authTag/ciphertext into one buffer
// ([12][16][...]) instead of a colon-delimited hex string, since hex-encoding
// a multi-megabyte file would double its size on disk for no benefit.
function encryptBuffer(buffer) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

function decryptBuffer(payload) {
  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// For refresh tokens and password-reset tokens: the raw value is a
// high-entropy random secret handed to the client, and only its SHA-256 is
// stored — a DB leak doesn't hand out usable tokens, mirroring why
// passwords are hashed rather than stored in plaintext.
function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

module.exports = { encrypt, decrypt, encryptBuffer, decryptBuffer, randomToken, sha256 };
