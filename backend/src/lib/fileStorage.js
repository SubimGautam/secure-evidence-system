const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const env = require('../config/env');

const STORAGE_ROOT = path.resolve(__dirname, '../..', env.EVIDENCE_STORAGE_PATH);

function ensureStorageRoot() {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true });
}

function generateFilename() {
  return `${crypto.randomUUID()}.enc`;
}

function writeFile(filename, buffer) {
  ensureStorageRoot();
  fs.writeFileSync(path.join(STORAGE_ROOT, filename), buffer);
}

function readFile(filename) {
  return fs.readFileSync(path.join(STORAGE_ROOT, filename));
}

module.exports = { generateFilename, writeFile, readFile };
