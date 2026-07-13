const prisma = require('../../lib/prisma');
const httpError = require('../../lib/httpError');
const { recordAuditEvent, AUDIT_EVENTS } = require('../../lib/auditLog');
const { revokeSessionAndTokens } = require('../auth/auth.service');

// Represents "locked indefinitely by an admin," reusing the existing
// lockedUntil field rather than adding a separate boolean column — the
// authenticate middleware and login flow already treat "lockedUntil in the
// future" as locked, so this needs no other code path to take effect.
const INDEFINITE_LOCK = new Date('9999-12-31T23:59:59.000Z');

// Admins see every account, including deactivated ones — that's the whole
// point of a management view. The directory (below) is the one that hides
// this detail from non-admins.
function listUsers() {
  return prisma.user.findMany({
    select: {
      id: true,
      email: true,
      fullName: true,
      mfaEnabled: true,
      lockedUntil: true,
      deletedAt: true,
      createdAt: true,
      role: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

// Deliberately not gated by `users:manage` — this is a "who else exists to
// hand evidence to" lookup for the custody-transfer picker, open to any
// authenticated user, not an admin-management action. It returns far less
// than listUsers() (no email, no status) since it's meant to be visible
// more broadly.
function listDirectory() {
  return prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, fullName: true, role: { select: { name: true } } },
    orderBy: { fullName: 'asc' },
  });
}

// Self-service role/status/lock/MFA changes are blocked outright, admin or
// not — not because an Admin escalating themselves is the threat model here
// (they're already at the top), but because it's a one-line guard against a
// compromised or scripted admin session locking itself out.
function assertNotSelf(targetUserId, actingUserId, message) {
  if (targetUserId === actingUserId) throw httpError(403, message);
}

async function updateRole(targetUserId, actingUserId, roleName) {
  assertNotSelf(targetUserId, actingUserId, 'You cannot change your own role');

  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: targetUserId },
      data: { roleId: role.id },
      select: { id: true, email: true, role: { select: { name: true } } },
    });
    await recordAuditEvent(tx, {
      actorUserId: actingUserId,
      eventType: AUDIT_EVENTS.USER_ROLE_CHANGED,
      entityType: 'User',
      entityId: targetUserId,
      payload: { newRole: roleName },
    });
    return user;
  });
}

async function updateStatus(targetUserId, actingUserId, isActive) {
  assertNotSelf(targetUserId, actingUserId, 'You cannot change your own account status');

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: targetUserId },
      data: { deletedAt: isActive ? null : new Date() },
      select: { id: true, email: true, deletedAt: true },
    });
    await recordAuditEvent(tx, {
      actorUserId: actingUserId,
      eventType: AUDIT_EVENTS.USER_STATUS_CHANGED,
      entityType: 'User',
      entityId: targetUserId,
      payload: { isActive },
    });
    return user;
  });
}

async function lockUser(targetUserId, actingUserId) {
  assertNotSelf(targetUserId, actingUserId, 'You cannot lock your own account');

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: targetUserId },
      data: { lockedUntil: INDEFINITE_LOCK },
      select: { id: true, email: true, lockedUntil: true },
    });
    await recordAuditEvent(tx, {
      actorUserId: actingUserId,
      eventType: AUDIT_EVENTS.USER_LOCKED,
      entityType: 'User',
      entityId: targetUserId,
    });
    return user;
  });
}

async function unlockUser(targetUserId, actingUserId) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: targetUserId },
      data: { lockedUntil: null },
      select: { id: true, email: true, lockedUntil: true },
    });
    await recordAuditEvent(tx, {
      actorUserId: actingUserId,
      eventType: AUDIT_EVENTS.USER_UNLOCKED,
      entityType: 'User',
      entityId: targetUserId,
    });
    return user;
  });
}

// Recovers a user who lost their authenticator device. Deliberately refuses
// to target an ADMIN account (self or otherwise) — disableMfa's normal path
// requires the account's own password + a valid code specifically so MFA
// stays mandatory for Admins; a same-privilege admin-reset backdoor would
// undermine that guarantee for the highest-privilege role in the system.
async function resetUserMfa(targetUserId, actingUserId) {
  const target = await prisma.user.findUniqueOrThrow({
    where: { id: targetUserId },
    include: { role: true },
  });
  if (target.role.name === 'ADMIN') {
    throw httpError(403, 'MFA is mandatory for Admin accounts and cannot be reset this way');
  }

  return prisma.$transaction(async (tx) => {
    await tx.mFASecret.updateMany({
      where: { userId: targetUserId },
      data: { disabledAt: new Date() },
    });
    await tx.user.update({ where: { id: targetUserId }, data: { mfaEnabled: false } });
    await recordAuditEvent(tx, {
      actorUserId: actingUserId,
      eventType: AUDIT_EVENTS.MFA_RESET_BY_ADMIN,
      entityType: 'User',
      entityId: targetUserId,
    });
  });
}

function listUserSessions(targetUserId) {
  return prisma.session.findMany({
    where: { userId: targetUserId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: 'desc' },
    select: {
      id: true,
      userAgent: true,
      ipAddress: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
  });
}

async function revokeUserSession(targetUserId, sessionId, actingUserId) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== targetUserId) throw httpError(404, 'Session not found');

  await prisma.$transaction(async (tx) => {
    await revokeSessionAndTokens(sessionId, tx);
    await recordAuditEvent(tx, {
      actorUserId: actingUserId,
      eventType: AUDIT_EVENTS.SESSION_REVOKED,
      entityType: 'Session',
      entityId: sessionId,
      payload: { revokedByAdminFor: targetUserId },
    });
  });
}

// ---------------------------------------------------------------------------
// Self-service profile — view/edit/export/import of the caller's own
// account. Every function here takes only `userId` (the authenticated
// caller's own id from req.user), never a target id, which is what makes
// this a different, narrower surface than the admin-only functions above:
// there's no id parameter for an IDOR check to fail on in the first place.
// ---------------------------------------------------------------------------

function getOwnProfile(userId) {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      mfaEnabled: true,
      createdAt: true,
      role: { select: { name: true } },
    },
  });
}

async function updateOwnProfile(userId, { fullName }) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { fullName },
      select: { id: true, email: true, fullName: true },
    });
    await recordAuditEvent(tx, {
      actorUserId: userId,
      eventType: AUDIT_EVENTS.PROFILE_UPDATED,
      entityType: 'User',
      entityId: userId,
      payload: { fullName },
    });
    return user;
  });
}

// A GDPR-style "download my data" export: the account record plus
// everything else the schema attributes to this user — evidence they
// logged/hold, custody transfers they're a party to, their own sessions and
// audit trail. Scoped entirely by the caller's own id (see note above), so
// this can never become a way to pull someone else's history.
async function exportOwnData(userId) {
  const [
    user,
    evidenceLogged,
    evidenceCustodied,
    transfersInitiated,
    transfersReceived,
    sessions,
    auditEntries,
  ] = await Promise.all([
    getOwnProfile(userId),
    prisma.evidence.findMany({
      where: { loggedById: userId },
      select: { id: true, referenceCode: true, description: true, status: true, createdAt: true },
    }),
    prisma.evidence.findMany({
      where: { currentCustodianId: userId },
      select: { id: true, referenceCode: true, description: true, status: true },
    }),
    prisma.custodyTransfer.findMany({
      where: { fromUserId: userId },
      select: { id: true, evidenceId: true, toUserId: true, status: true, initiatedAt: true },
    }),
    prisma.custodyTransfer.findMany({
      where: { toUserId: userId },
      select: { id: true, evidenceId: true, fromUserId: true, status: true, initiatedAt: true },
    }),
    prisma.session.findMany({
      where: { userId },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
      },
    }),
    prisma.auditLog.findMany({
      where: { actorUserId: userId },
      select: { id: true, eventType: true, entityType: true, entityId: true, timestamp: true },
      orderBy: { timestamp: 'desc' },
    }),
  ]);

  // Exporting is itself worth a trail entry — a bulk pull of one's own data
  // is exactly the kind of action an insider-threat review would want to see
  // in the log, not just mutations.
  await prisma.$transaction((tx) =>
    recordAuditEvent(tx, {
      actorUserId: userId,
      eventType: AUDIT_EVENTS.PROFILE_DATA_EXPORTED,
      entityType: 'User',
      entityId: userId,
    }),
  );

  return {
    exportedAt: new Date().toISOString(),
    user,
    evidenceLogged,
    evidenceCustodied,
    transfersInitiated,
    transfersReceived,
    sessions,
    auditEntries,
  };
}

// Re-applies just `fullName` from a previously exported file. Goes through
// the exact same strict-schema, mass-assignment-safe path as
// updateOwnProfile — the rest of an export file (evidence, sessions, audit
// history) is read-only historical data and isn't something "import" is
// meant to write back.
function importOwnProfile(userId, { fullName }) {
  return updateOwnProfile(userId, { fullName });
}

module.exports = {
  listUsers,
  listDirectory,
  updateRole,
  updateStatus,
  lockUser,
  unlockUser,
  resetUserMfa,
  listUserSessions,
  revokeUserSession,
  getOwnProfile,
  updateOwnProfile,
  exportOwnData,
  importOwnProfile,
};
