const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const env = require('../config/env');

const STORAGE_ROOT = path.resolve(__dirname, '../..', env.EVIDENCE_STORAGE_PATH);

function ensureStorageRoot() {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true });
}

// A random filename, never derived from the client-supplied original name —
// the DB's `storagePath` column stores this name only (root-relative, not
// absolute), so moving the storage root between environments needs no data
// migration. The original filename is untrusted input and is only ever used
// for the Content-Disposition header on download, never as a path segment —
// that's what keeps a name like "../../etc/passwd" from doing anything.
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
