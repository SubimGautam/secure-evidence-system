const crypto = require('node:crypto');

const GENESIS_HASH = '0'.repeat(64);

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
  PROFILE_UPDATED: 'PROFILE_UPDATED',
  PROFILE_DATA_EXPORTED: 'PROFILE_DATA_EXPORTED',
};

function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`)
    .join(',')}}`;
}

function computeEntryHash({
  prevHash,
  timestamp,
  actorUserId,
  eventType,
  entityType,
  entityId,
  payload,
}) {
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
async function recordAuditEvent(
  tx,
  { actorUserId = null, eventType, entityType = null, entityId = null, payload = null },
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY})`;

  const last = await tx.auditLog.findFirst({ orderBy: { timestamp: 'desc' } });
  const prevHash = last ? last.entryHash : GENESIS_HASH;
  const timestamp = new Date();
  const entryHash = computeEntryHash({
    prevHash,
    timestamp,
    actorUserId,
    eventType,
    entityType,
    entityId,
    payload,
  });

  return tx.auditLog.create({
    data: { actorUserId, eventType, entityType, entityId, payload, prevHash, entryHash, timestamp },
  });
}
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
        reason:
          "This entry's prevHash does not match the previous entry's hash — the chain has been broken or reordered.",
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
        reason:
          "This entry's stored hash does not match its recomputed hash — its contents were altered after being written.",
      };
    }

    expectedPrevHash = row.entryHash;
  }

  return {
    valid: true,
    checkedCount: rows.length,
    totalCount: rows.length,
    brokenAt: null,
    reason: null,
  };
}

module.exports = {
  recordAuditEvent,
  verifyChain,
  computeEntryHash,
  canonicalStringify,
  AUDIT_EVENTS,
  GENESIS_HASH,
};
