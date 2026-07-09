const crypto = require('node:crypto');

const GENESIS_HASH = '0'.repeat(64);

// A fixed, arbitrary key for a Postgres advisory lock (see recordAuditEvent).
// Any 32-bit-safe integer works — it's not a secret, just a named mutex.
const AUDIT_CHAIN_LOCK_KEY = 847362910;

const AUDIT_EVENTS = {
  USER_REGISTERED: 'USER_REGISTERED',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGOUT: 'LOGOUT',
  TOKEN_REUSE_DETECTED: 'TOKEN_REUSE_DETECTED',
  MFA_ENABLED: 'MFA_ENABLED',
  MFA_DISABLED: 'MFA_DISABLED',
  MFA_RESET_BY_ADMIN: 'MFA_RESET_BY_ADMIN',
  PASSWORD_RESET_COMPLETED: 'PASSWORD_RESET_COMPLETED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  EVIDENCE_CREATED: 'EVIDENCE_CREATED',
  EVIDENCE_UPDATED: 'EVIDENCE_UPDATED',
  EVIDENCE_FILE_UPLOADED: 'EVIDENCE_FILE_UPLOADED',
  EVIDENCE_FILE_DOWNLOADED: 'EVIDENCE_FILE_DOWNLOADED',
  EVIDENCE_COLLECTION_CONFIRMED: 'EVIDENCE_COLLECTION_CONFIRMED',
  EVIDENCE_REOPENED: 'EVIDENCE_REOPENED',
  EVIDENCE_RELEASED_FOR_COURT: 'EVIDENCE_RELEASED_FOR_COURT',
  EVIDENCE_RETURNED: 'EVIDENCE_RETURNED',
  EVIDENCE_ARCHIVED: 'EVIDENCE_ARCHIVED',
  CUSTODY_TRANSFER_INITIATED: 'CUSTODY_TRANSFER_INITIATED',
  CUSTODY_TRANSFER_ACCEPTED: 'CUSTODY_TRANSFER_ACCEPTED',
  CUSTODY_TRANSFER_REJECTED: 'CUSTODY_TRANSFER_REJECTED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_STATUS_CHANGED: 'USER_STATUS_CHANGED',
  USER_LOCKED: 'USER_LOCKED',
  USER_UNLOCKED: 'USER_UNLOCKED',
};

// Deterministic regardless of key insertion order — needed because a value
// round-tripped through Postgres JSONB is not guaranteed to come back with
// the same key order it was written with, and the hash must be reproducible
// from what verifyChain() reads back, not just from what was written.
function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`)
    .join(',')}}`;
}

function computeEntryHash({ prevHash, timestamp, actorUserId, eventType, entityType, entityId, payload }) {
  const canonical = [
    prevHash,
    timestamp.toISOString(),
    actorUserId ?? '',
    eventType,
    entityType ?? '',
    entityId ?? '',
    canonicalStringify(payload ?? null),
  ].join('|');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

// Must be called with a transaction client (`tx` from prisma.$transaction),
// never the top-level `prisma` client, for two reasons:
//  1. The advisory lock below only serializes writers within the same
//     transaction/session scope that then reads-and-inserts — without it,
//     two concurrent requests could both read the same "last" row and each
//     compute a valid-looking next link off the same prevHash, forking the
//     chain into two branches instead of one linear history.
//  2. The event is meant to be atomic with the action it's recording: if the
//     audit write fails, the action it describes should roll back too — a
//     chain-of-custody system's log is not allowed to fall behind reality.
async function recordAuditEvent(tx, { actorUserId = null, eventType, entityType = null, entityId = null, payload = null }) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY})`;

  const last = await tx.auditLog.findFirst({ orderBy: { timestamp: 'desc' } });
  const prevHash = last ? last.entryHash : GENESIS_HASH;
  const timestamp = new Date();
  const entryHash = computeEntryHash({ prevHash, timestamp, actorUserId, eventType, entityType, entityId, payload });

  return tx.auditLog.create({
    data: { actorUserId, eventType, entityType, entityId, payload, prevHash, entryHash, timestamp },
  });
}

// Full recompute from genesis — correct and simple for this project's data
// volume. A production system with millions of rows would checkpoint
// periodically (architecture doc §6) and verify only since the last
// checkpoint; noted as a future improvement rather than built now.
async function verifyChain(prisma) {
  const rows = await prisma.auditLog.findMany({ orderBy: { timestamp: 'asc' } });

  let expectedPrevHash = GENESIS_HASH;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];

    if (row.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        checkedCount: i,
        totalCount: rows.length,
        brokenAt: { id: row.id, eventType: row.eventType, timestamp: row.timestamp },
        reason: 'This entry\'s prevHash does not match the previous entry\'s hash — the chain has been broken or reordered.',
      };
    }

    const recomputed = computeEntryHash({
      prevHash: row.prevHash,
      timestamp: row.timestamp,
      actorUserId: row.actorUserId,
      eventType: row.eventType,
      entityType: row.entityType,
      entityId: row.entityId,
      payload: row.payload,
    });

    if (recomputed !== row.entryHash) {
      return {
        valid: false,
        checkedCount: i,
        totalCount: rows.length,
        brokenAt: { id: row.id, eventType: row.eventType, timestamp: row.timestamp },
        reason: 'This entry\'s stored hash does not match its recomputed hash — its contents were altered after being written.',
      };
    }

    expectedPrevHash = row.entryHash;
  }

  return { valid: true, checkedCount: rows.length, totalCount: rows.length, brokenAt: null, reason: null };
}

module.exports = { recordAuditEvent, verifyChain, computeEntryHash, canonicalStringify, AUDIT_EVENTS, GENESIS_HASH };
