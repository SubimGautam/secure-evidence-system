// multer's `file.mimetype` is only the client-supplied Content-Type header
// for that multipart form field — never inspected server-side — so
// upload.js's MIME allowlist alone can be defeated by simply lying about
// the header while uploading arbitrary content. This checks the file's
// actual leading bytes against what its declared type should look like.
const SIGNATURES = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
  // Legacy OLE-compound-document header — covers .doc.
  'application/msword': [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]],
  // .docx is a zip container — this confirms "real zip," not "real docx"
  // specifically (a full OOXML parse is more than this check needs to do),
  // but that already rules out plain text/script content wearing the
  // extension.
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    [0x50, 0x4b, 0x03, 0x04],
  ],
};

function matchesSignature(buffer, bytes) {
  return buffer.length >= bytes.length && bytes.every((b, i) => buffer[i] === b);
}

// text/plain has no reliable magic-byte signature and is intentionally not
// checked here — it's already the lowest-risk allowed type (served with
// Content-Disposition: attachment and X-Content-Type-Options: nosniff
// regardless of what the bytes actually are).
function verifyFileSignature(buffer, declaredMimeType) {
  if (declaredMimeType === 'text/plain') return true;

  if (declaredMimeType === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    );
  }

  const signatures = SIGNATURES[declaredMimeType];
  if (!signatures) return false; // Unrecognized type: fail closed, not open.
  return signatures.some((bytes) => matchesSignature(buffer, bytes));
}

module.exports = { verifyFileSignature };
