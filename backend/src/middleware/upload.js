const multer = require('multer');
const httpError = require('../lib/httpError');

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

// Evidence photos, scans, and reports — not an open-ended file type. An
// allowlist (not a denylist) means an unanticipated type fails closed.
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

// Memory storage, not disk: the file never touches disk unencrypted — it's
// encrypted in the controller before the first write (evidence.service.js).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(httpError(400, `Unsupported file type: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

module.exports = { upload, MAX_FILE_SIZE_BYTES, ALLOWED_MIME_TYPES };
