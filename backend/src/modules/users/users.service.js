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
    await tx.mFASecret.updateMany({ where: { userId: targetUserId }, data: { disabledAt: new Date() } });
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
    select: { id: true, userAgent: true, ipAddress: true, createdAt: true, lastUsedAt: true, expiresAt: true },
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
};
