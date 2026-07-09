const prisma = require('../../lib/prisma');
const env = require('../../config/env');
const { hashPassword } = require('../../lib/password');
const { randomToken, sha256 } = require('../../lib/crypto');
const { sendPasswordResetEmail } = require('../../lib/mailer');
const { httpError, revokeSessionAndTokens } = require('./auth.service');
const { recordAuditEvent, AUDIT_EVENTS } = require('../../lib/auditLog');

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

// Always resolves, and the controller always returns the same response
// regardless of outcome — whether the email exists is not observable from
// the response, only from whether an email (logged, for now) goes out.
async function requestPasswordReset(email) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deletedAt) return;

  const rawToken = randomToken(32);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetTokenHash: sha256(rawToken),
      passwordResetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  const resetLink = `${env.CORS_ORIGIN}/reset-password?token=${rawToken}`;
  await sendPasswordResetEmail(email, resetLink);
}

async function confirmPasswordReset(token, newPassword) {
  const tokenHash = sha256(token);
  const user = await prisma.user.findFirst({
    where: {
      passwordResetTokenHash: tokenHash,
      passwordResetTokenExpiresAt: { gt: new Date() },
    },
  });
  if (!user) throw httpError(400, 'Invalid or expired reset token');

  const passwordHash = await hashPassword(newPassword);

  const activeSessions = await prisma.session.findMany({
    where: { userId: user.id, revokedAt: null },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
        lockedUntil: null,
      },
    });
    await recordAuditEvent(tx, {
      actorUserId: user.id,
      eventType: AUDIT_EVENTS.PASSWORD_RESET_COMPLETED,
      entityType: 'User',
      entityId: user.id,
    });
  });

  // A password reset is frequently a response to a suspected compromise —
  // every existing session (everywhere the account is currently logged in)
  // is killed so a stolen session can't outlive the password that granted it.
  await Promise.all(activeSessions.map((s) => revokeSessionAndTokens(s.id)));
}

module.exports = { requestPasswordReset, confirmPasswordReset };
