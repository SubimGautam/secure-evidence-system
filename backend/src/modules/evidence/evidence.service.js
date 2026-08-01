const crypto = require('node:crypto');
const prisma = require('../../lib/prisma');
const httpError = require('../../lib/httpError');
const { encryptBuffer, decryptBuffer, sha256 } = require('../../lib/crypto');
const fileStorage = require('../../lib/fileStorage');
const { recordAuditEvent, AUDIT_EVENTS } = require('../../lib/auditLog');

// Bumped only if ENCRYPTION_KEY is ever rotated — lets old files stay
// decryptable under a previous key while new ones use the current one.
// There's one key today, so this is always "v1", but the column exists so
// rotation doesn't require a schema change later.
const ENCRYPTION_KEY_VERSION = 'v1';

// A real numbering scheme (per-year sequence, case linkage, etc.) is
// Milestone 7's job — this is only enough to satisfy the unique constraint
// while Milestone 4 exercises the authorization layer against real rows.
function generateReferenceCode() {
  return `EVD-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

// loggedById and currentCustodianId are set from the authenticated user, never
// from the request body — the validation schema doesn't even accept those
// keys, but this is the second, independent guard against mass assignment.
async function createEvidence(user, data) {
  return prisma.$transaction(async (tx) => {
    const evidence = await tx.evidence.create({
      data: {
        referenceCode: generateReferenceCode(),
        description: data.description,
        type: data.type,
        collectedAt: data.collectedAt,
        collectedLocation: data.collectedLocation,
        loggedById: user.id,
        currentCustodianId: user.id,
      },
    });
    await recordAuditEvent(tx, {
      actorUserId: user.id,
      eventType: AUDIT_EVENTS.EVIDENCE_CREATED,
      entityType: 'Evidence',
      entityId: evidence.id,
      payload: { referenceCode: evidence.referenceCode, type: evidence.type },
    });
    return evidence;
  });
}

function listEvidence() {
  return prisma.evidence.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      loggedBy: { select: { id: true, fullName: true } },
      currentCustodian: { select: { id: true, fullName: true } },
    },
  });
}

// Includes custody history and file metadata so the frontend's detail view
// doesn't need three separate round trips. `storagePath` is deliberately
// excluded from the file selection — it's an internal detail (see
// fileStorage.js), not something a client needs or should see.
function getEvidenceById(id) {
  return prisma.evidence.findUnique({
    where: { id },
    include: {
      loggedBy: { select: { id: true, fullName: true } },
      currentCustodian: { select: { id: true, fullName: true } },
      custodyTransfers: {
        orderBy: { createdAt: 'desc' },
        include: {
          fromUser: { select: { id: true, fullName: true } },
          toUser: { select: { id: true, fullName: true } },
        },
      },
      files: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          originalFilename: true,
          mimeType: true,
          sizeBytes: true,
          sha256Hash: true,
          createdAt: true,
          uploadedBy: { select: { id: true, fullName: true } },
        },
      },
    },
  });
}

function updateEvidence(id, data, actorUserId) {
  return prisma.$transaction(async (tx) => {
    const evidence = await tx.evidence.update({ where: { id }, data });
    await recordAuditEvent(tx, {
      actorUserId,
      eventType: AUDIT_EVENTS.EVIDENCE_UPDATED,
      entityType: 'Evidence',
      entityId: id,
      payload: { changedFields: Object.keys(data) },
    });
    return evidence;
  });
}

// Shared by every status-transition action below: reject anything that
// isn't a legal move from the item's CURRENT status (409, not 403 — this is
// business state, not authorization; the route's ABAC check already
// confirmed the actor is allowed to act on this item at all) and,
// atomically with the write, record which transition happened.
async function transitionStatus(evidence, actorUserId, { allowedFrom, to, eventType }) {
  if (!allowedFrom.includes(evidence.status)) {
    throw httpError(
      409,
      `Evidence is ${evidence.status} — this action requires it to be ${allowedFrom.join(' or ')}`,
    );
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.evidence.update({ where: { id: evidence.id }, data: { status: to } });
    await recordAuditEvent(tx, {
      actorUserId,
      eventType,
      entityType: 'Evidence',
      entityId: evidence.id,
      payload: { from: evidence.status, to },
    });
    return updated;
  });
}

// PENDING -> COLLECTED. The logging Officer's confirmation that intake is
// correct and the item is ready to be handed off.
function confirmCollection(evidence, actorUserId) {
  return transitionStatus(evidence, actorUserId, {
    allowedFrom: ['PENDING'],
    to: 'COLLECTED',
    eventType: AUDIT_EVENTS.EVIDENCE_COLLECTION_CONFIRMED,
  });
}

// COLLECTED -> PENDING. Undoes a confirmation made in error — deliberately
// narrower than "current custodian" (requireEvidenceOwner in the route
// requires the ORIGINAL LOGGING OFFICER specifically), and additionally
// blocked if a transfer has ever been initiated: reopening something
// mid-handshake would leave a recipient able to accept a transfer for an
// item that's supposedly back in draft.
async function reopenForCorrection(evidence, actorUserId) {
  const pendingTransfer = await prisma.custodyTransfer.findFirst({
    where: { evidenceId: evidence.id, status: 'PENDING' },
  });
  if (pendingTransfer) {
    throw httpError(409, 'Cannot reopen evidence with a pending custody transfer');
  }
  return transitionStatus(evidence, actorUserId, {
    allowedFrom: ['COLLECTED'],
    to: 'PENDING',
    eventType: AUDIT_EVENTS.EVIDENCE_REOPENED,
  });
}

// IN_CUSTODY or RETURNED -> RELEASED_FOR_COURT. Not from RELEASED_FOR_COURT
// itself (already released) or PENDING/COLLECTED (never actually reached a
// custodian yet) or ARCHIVED (inactive).
function releaseForCourt(evidence, actorUserId) {
  return transitionStatus(evidence, actorUserId, {
    allowedFrom: ['IN_CUSTODY', 'RETURNED'],
    to: 'RELEASED_FOR_COURT',
    eventType: AUDIT_EVENTS.EVIDENCE_RELEASED_FOR_COURT,
  });
}

// RELEASED_FOR_COURT -> RETURNED. Only a released item can come back.
function markReturned(evidence, actorUserId) {
  return transitionStatus(evidence, actorUserId, {
    allowedFrom: ['RELEASED_FOR_COURT'],
    to: 'RETURNED',
    eventType: AUDIT_EVENTS.EVIDENCE_RETURNED,
  });
}

// COLLECTED, IN_CUSTODY, or RETURNED -> ARCHIVED — any active,
// not-currently-in-court state. Not from PENDING (unconfirmed intake
// shouldn't be archived, it should be corrected or rejected) or
// RELEASED_FOR_COURT (must be returned first).
function archiveEvidence(evidence, actorUserId) {
  return transitionStatus(evidence, actorUserId, {
    allowedFrom: ['COLLECTED', 'IN_CUSTODY', 'RETURNED'],
    to: 'ARCHIVED',
    eventType: AUDIT_EVENTS.EVIDENCE_ARCHIVED,
  });
}

// Only the current custodian may add a file (requireCurrentCustodian on the
// route) — the item is encrypted before it's ever written to disk, and its
// pre-encryption SHA-256 is stored so integrity can be verified independent
// of the encryption layer itself.
async function uploadFile(evidence, user, multerFile) {
  const sha256Hash = sha256(multerFile.buffer);
  const encrypted = encryptBuffer(multerFile.buffer);
  const filename = fileStorage.generateFilename();
  // Written to disk before the DB transaction opens: if the transaction
  // (including its audit event) fails and rolls back, an orphaned encrypted
  // file on disk is a harmless leftover — a DB row pointing at a file that
  // was never actually written would be a worse failure mode.
  fileStorage.writeFile(filename, encrypted);

  return prisma.$transaction(async (tx) => {
    const file = await tx.evidenceFile.create({
      data: {
        evidenceId: evidence.id,
        originalFilename: multerFile.originalname,
        mimeType: multerFile.mimetype,
        sizeBytes: multerFile.size,
        storagePath: filename,
        sha256Hash,
        encryptionKeyId: ENCRYPTION_KEY_VERSION,
        uploadedById: user.id,
      },
    });
    await recordAuditEvent(tx, {
      actorUserId: user.id,
      eventType: AUDIT_EVENTS.EVIDENCE_FILE_UPLOADED,
      entityType: 'Evidence',
      entityId: evidence.id,
      payload: { fileId: file.id, originalFilename: file.originalFilename, sha256Hash },
    });
    return file;
  });
}

async function downloadFile(evidenceId, fileId, actorUserId) {
  const file = await prisma.evidenceFile.findUnique({ where: { id: fileId } });
  if (!file || file.evidenceId !== evidenceId || file.deletedAt) {
    throw httpError(404, 'File not found');
  }

  const encrypted = fileStorage.readFile(file.storagePath);
  const buffer = decryptBuffer(encrypted);

  // Access to evidence contents is itself worth a record — "who looked at
  // this" is a distinct question from "who may change this" (architecture
  // doc §5), and unlike custody events, a download leaves no other trace.
  await prisma.$transaction((tx) =>
    recordAuditEvent(tx, {
      actorUserId,
      eventType: AUDIT_EVENTS.EVIDENCE_FILE_DOWNLOADED,
      entityType: 'Evidence',
      entityId: evidenceId,
      payload: { fileId: file.id, originalFilename: file.originalFilename },
    }),
  );

  return { buffer, originalFilename: file.originalFilename, mimeType: file.mimeType };
}

module.exports = {
  createEvidence,
  listEvidence,
  getEvidenceById,
  updateEvidence,
  confirmCollection,
  reopenForCorrection,
  releaseForCourt,
  markReturned,
  archiveEvidence,
  uploadFile,
  downloadFile,
};
