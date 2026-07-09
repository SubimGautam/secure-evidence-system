const prisma = require('../../lib/prisma');
const env = require('../../config/env');
const httpError = require('../../lib/httpError');
const { hashPassword, verifyPassword } = require('../../lib/password');
const { randomToken, sha256 } = require('../../lib/crypto');
const { signAccessToken, signMfaPendingToken, verifyMfaPendingToken } = require('../../lib/tokens');
const { recordAuditEvent, AUDIT_EVENTS } = require('../../lib/auditLog');

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

// Every branch a failed login can take — unknown email, wrong password,
// deleted account — returns this exact message. Distinguishing them would
// hand an attacker a free oracle for which emails have accounts.
const INVALID_CREDENTIALS = 'Invalid email or password';

async function register({ email, password, fullName }) {
  const officerRole = await prisma.role.findUniqueOrThrow({ where: { name: 'OFFICER' } });

  const passwordHash = await hashPassword(password);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email, fullName, passwordHash, roleId: officerRole.id },
        include: { role: true },
      });
      await recordAuditEvent(tx, {
        actorUserId: created.id,
        eventType: AUDIT_EVENTS.USER_REGISTERED,
        entityType: 'User',
        entityId: created.id,
        payload: { email: created.email },
      });
      return created;
    });
    return toPublicUser(user);
  } catch (err) {
    // Registration is the one place email existence is intentionally
    // revealed — the alternative (a generic "check your email" response) is
    // standard for password reset, but at signup time it just confuses
    // users who already have an account and forgot.
    if (err.code === 'P2002') throw httpError(409, 'An account with this email already exists');
    throw err;
  }
}

async function recordLoginAttempt({ userId, email, ip, userAgent, success }) {
  await prisma.loginAttempt.create({
    data: { userId, emailAttempted: email, ipAddress: ip, userAgent, success },
  });
}

async function applyLockoutIfLoginFailing(user) {
  const recentFailures = await prisma.loginAttempt.count({
    where: {
      emailAttempted: user.email,
      success: false,
      createdAt: { gte: new Date(Date.now() - LOCKOUT_WINDOW_MS) },
    },
  });

  if (recentFailures >= MAX_FAILED_ATTEMPTS) {
    await prisma.user.update({
      where: { id: user.id },
      data: { lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS) },
    });
  }
}

// `client` defaults to the top-level prisma client but accepts a `tx` from
// an outer prisma.$transaction() so session creation and its LOGIN_SUCCESS
// audit event commit (or fail) together — see auditLog.js.
async function issueSession(user, { ip, userAgent }, client = prisma) {
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const session = await client.session.create({
    data: { userId: user.id, userAgent, ipAddress: ip, expiresAt },
  });

  const rawRefreshToken = randomToken(32);
  await client.refreshToken.create({
    data: {
      sessionId: session.id,
      userId: user.id,
      tokenHash: sha256(rawRefreshToken),
      expiresAt,
    },
  });

  const accessToken = signAccessToken({ id: user.id, role: user.role.name, sessionId: session.id });

  return { accessToken, refreshToken: rawRefreshToken, refreshTokenExpiresAt: expiresAt };
}

async function login({ email, password, ip, userAgent }) {
  const user = await prisma.user.findUnique({ where: { email }, include: { role: true } });

  if (!user || user.deletedAt) {
    await recordLoginAttempt({ userId: null, email, ip, userAgent, success: false });
    throw httpError(401, INVALID_CREDENTIALS);
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    // Covers two different causes with one message: the automatic lockout
    // above (repeated failed sign-ins) and an admin-initiated lock
    // (users.service.js lockUser) — both set the same field, and neither
    // reason is anything a rejected login attempt should spell out.
    throw httpError(423, 'Account is locked. Contact an administrator for help.');
  }

  const passwordValid = await verifyPassword(user.passwordHash, password);
  if (!passwordValid) {
    await recordLoginAttempt({ userId: user.id, email, ip, userAgent, success: false });
    await applyLockoutIfLoginFailing(user);
    throw httpError(401, INVALID_CREDENTIALS);
  }

  await recordLoginAttempt({ userId: user.id, email, ip, userAgent, success: true });
  if (user.lockedUntil) {
    await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: null } });
  }

  if (user.mfaEnabled) {
    return { mfaRequired: true, mfaToken: signMfaPendingToken({ id: user.id }) };
  }

  const session = await prisma.$transaction(async (tx) => {
    const result = await issueSession(user, { ip, userAgent }, tx);
    await recordAuditEvent(tx, {
      actorUserId: user.id,
      eventType: AUDIT_EVENTS.LOGIN_SUCCESS,
      entityType: 'User',
      entityId: user.id,
      payload: { ip, userAgent },
    });
    return result;
  });
  return { mfaRequired: false, user: toPublicUser(user), ...session };
}

async function refresh({ rawToken, ip, userAgent }) {
  if (!rawToken) throw httpError(401, 'No refresh token supplied');

  const tokenHash = sha256(rawToken);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { session: true, user: { include: { role: true } } },
  });

  if (!existing) throw httpError(401, 'Invalid refresh token');

  // The token was already rotated once before — presenting it again means
  // someone has a copy they shouldn't. Burn the whole session, not just this
  // token, since we can't tell which of the two holders is the attacker.
  if (existing.revokedAt || existing.session.revokedAt) {
    await prisma.$transaction(async (tx) => {
      await revokeSessionAndTokens(existing.sessionId, tx);
      await recordAuditEvent(tx, {
        actorUserId: existing.userId,
        eventType: AUDIT_EVENTS.TOKEN_REUSE_DETECTED,
        entityType: 'Session',
        entityId: existing.sessionId,
        payload: { ip, userAgent },
      });
    });
    throw httpError(401, 'Session revoked — possible token reuse detected');
  }

  if (existing.expiresAt < new Date()) {
    throw httpError(401, 'Refresh token expired');
  }

  const rawNewToken = randomToken(32);
  const newToken = await prisma.$transaction(async (tx) => {
    const created = await tx.refreshToken.create({
      data: {
        sessionId: existing.sessionId,
        userId: existing.userId,
        tokenHash: sha256(rawNewToken),
        // Capped at the session's original absolute expiry, not extended on
        // every refresh — otherwise a session could be kept alive forever
        // by refreshing just before each expiry, defeating the point of
        // having an expiry at all.
        expiresAt: existing.session.expiresAt,
      },
    });
    await tx.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedByTokenId: created.id },
    });
    await tx.session.update({
      where: { id: existing.sessionId },
      data: { lastUsedAt: new Date(), userAgent, ipAddress: ip },
    });
    return created;
  });

  const accessToken = signAccessToken({
    id: existing.user.id,
    role: existing.user.role.name,
    sessionId: existing.sessionId,
  });

  return {
    accessToken,
    refreshToken: rawNewToken,
    refreshTokenExpiresAt: newToken.expiresAt,
    user: toPublicUser(existing.user),
  };
}

async function logout({ rawToken }) {
  if (!rawToken) return;

  const tokenHash = sha256(rawToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!existing) return;

  await prisma.$transaction(async (tx) => {
    await revokeSessionAndTokens(existing.sessionId, tx);
    await recordAuditEvent(tx, {
      actorUserId: existing.userId,
      eventType: AUDIT_EVENTS.LOGOUT,
      entityType: 'Session',
      entityId: existing.sessionId,
    });
  });
}

// `client` defaults to the top-level prisma client (used by callers that
// don't need this atomic with anything else, e.g. an admin force-locking a
// user) but accepts a `tx` so callers that DO need atomicity — reuse
// detection, logout, password reset — can pass their transaction through.
async function revokeSessionAndTokens(sessionId, client = prisma) {
  const now = new Date();
  await client.session.update({ where: { id: sessionId }, data: { revokedAt: now } });
  await client.refreshToken.updateMany({
    where: { sessionId, revokedAt: null },
    data: { revokedAt: now },
  });
}

async function verifyMfaPendingAndGetUser(mfaToken) {
  let payload;
  try {
    payload = verifyMfaPendingToken(mfaToken);
  } catch {
    throw httpError(401, 'Invalid or expired MFA challenge — please log in again');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub }, include: { role: true } });
  if (!user || user.deletedAt) throw httpError(401, 'Invalid or expired MFA challenge');
  return user;
}

function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role.name,
    mfaEnabled: user.mfaEnabled,
  };
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  issueSession,
  revokeSessionAndTokens,
  verifyMfaPendingAndGetUser,
  toPublicUser,
  httpError,
};
