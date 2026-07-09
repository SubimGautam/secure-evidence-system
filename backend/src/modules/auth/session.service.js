const prisma = require('../../lib/prisma');
const { httpError, revokeSessionAndTokens } = require('./auth.service');
const { recordAuditEvent, AUDIT_EVENTS } = require('../../lib/auditLog');

async function listSessions(userId) {
  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
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
  return sessions;
}

// Object-ownership check (session.userId === userId), not just "is this
// user authenticated" — otherwise any logged-in user could revoke anyone
// else's session by guessing a UUID.
async function revokeSession(userId, sessionId) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== userId) throw httpError(404, 'Session not found');

  await prisma.$transaction(async (tx) => {
    await revokeSessionAndTokens(sessionId, tx);
    await recordAuditEvent(tx, {
      actorUserId: userId,
      eventType: AUDIT_EVENTS.SESSION_REVOKED,
      entityType: 'Session',
      entityId: sessionId,
    });
  });
}

// Used for "log out other devices" — deliberately excludes the caller's own
// current session so this action doesn't invalidate the request making it.
async function revokeOtherSessions(userId, currentSessionId) {
  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null, id: { not: currentSessionId ?? undefined } },
    select: { id: true },
  });

  await Promise.all(
    sessions.map((s) =>
      prisma.$transaction(async (tx) => {
        await revokeSessionAndTokens(s.id, tx);
        await recordAuditEvent(tx, {
          actorUserId: userId,
          eventType: AUDIT_EVENTS.SESSION_REVOKED,
          entityType: 'Session',
          entityId: s.id,
          payload: { reason: 'bulk_revoke_other_sessions' },
        });
      }),
    ),
  );
  return sessions.length;
}

module.exports = { listSessions, revokeSession, revokeOtherSessions };
