const prisma = require('../../lib/prisma');
const { verifyPassword, hashPassword } = require('../../lib/password');
const {
  generateTotpSecret,
  verifyTotpStep,
  encryptSecret,
  decryptSecret,
  generateRecoveryCodes,
} = require('../../lib/mfa');
const {
  httpError,
  issueSession,
  verifyMfaPendingAndGetUser,
  toPublicUser,
} = require('./auth.service');
const { recordAuditEvent, AUDIT_EVENTS } = require('../../lib/auditLog');

// Shared by setup/login/disable: validates the code AND, on success, persists
// the matched time-step so the same code can't be replayed again before it
// naturally expires (see lib/mfa.js verifyTotpStep).
async function verifyAndConsumeTotpCode(userId, record, code) {
  const step = verifyTotpStep(decryptSecret(record.secretEncrypted), code);
  if (step === null) throw httpError(401, 'Invalid verification code');
  if (record.lastUsedStep !== null && step <= record.lastUsedStep) {
    throw httpError(401, 'This code has already been used — wait for the next one');
  }
  await prisma.mFASecret.update({ where: { userId }, data: { lastUsedStep: step } });
}

async function setupMfa(userId, email) {
  const { base32, otpauthUrl } = generateTotpSecret(email);

  await prisma.mFASecret.upsert({
    where: { userId },
    // Re-running setup before verifying replaces the pending secret; once
    // enrolled, disableMfa must run before setup can start over — enforced
    // in the controller by requiring authentication + this same upsert
    // resetting verifiedAt, so a stale unverified secret can't linger as
    // "half enabled."
    update: { secretEncrypted: encryptSecret(base32), verifiedAt: null, disabledAt: null },
    create: { userId, secretEncrypted: encryptSecret(base32), recoveryCodesHashed: [] },
  });

  return { otpauthUrl, secret: base32 };
}

async function verifyMfaSetup(userId, code) {
  const record = await prisma.mFASecret.findUnique({ where: { userId } });
  if (!record) throw httpError(400, 'No MFA enrollment in progress — call setup first');

  await verifyAndConsumeTotpCode(userId, record, code);

  const recoveryCodes = generateRecoveryCodes();
  const recoveryCodesHashed = await Promise.all(recoveryCodes.map((c) => hashPassword(c)));

  await prisma.$transaction(async (tx) => {
    await tx.mFASecret.update({
      where: { userId },
      data: { verifiedAt: new Date(), recoveryCodesHashed },
    });
    await tx.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
    await recordAuditEvent(tx, {
      actorUserId: userId,
      eventType: AUDIT_EVENTS.MFA_ENABLED,
      entityType: 'User',
      entityId: userId,
    });
  });

  // Shown exactly once — only the Argon2 hashes persist after this response.
  return { recoveryCodes };
}

async function disableMfa(userId, { password, code }) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { role: true },
  });

  if (user.role.name === 'ADMIN') {
    throw httpError(403, 'MFA is mandatory for the Admin role and cannot be disabled');
  }

  const passwordValid = await verifyPassword(user.passwordHash, password);
  if (!passwordValid) throw httpError(401, 'Invalid password');

  const record = await prisma.mFASecret.findUnique({ where: { userId } });
  if (!record || !record.verifiedAt) throw httpError(400, 'MFA is not enabled');

  await verifyAndConsumeTotpCode(userId, record, code);

  await prisma.$transaction(async (tx) => {
    await tx.mFASecret.update({ where: { userId }, data: { disabledAt: new Date() } });
    await tx.user.update({ where: { id: userId }, data: { mfaEnabled: false } });
    await recordAuditEvent(tx, {
      actorUserId: userId,
      eventType: AUDIT_EVENTS.MFA_DISABLED,
      entityType: 'User',
      entityId: userId,
    });
  });
}

async function loginWithMfa({ mfaToken, code, recoveryCode, ip, userAgent }) {
  const user = await verifyMfaPendingAndGetUser(mfaToken);

  const record = await prisma.mFASecret.findUnique({ where: { userId: user.id } });
  if (!record || !record.verifiedAt) throw httpError(401, 'MFA is not enabled for this account');

  if (code) {
    await verifyAndConsumeTotpCode(user.id, record, code);
  } else {
    const matchIndex = await findMatchingRecoveryCodeIndex(
      record.recoveryCodesHashed,
      recoveryCode,
    );
    if (matchIndex === -1) throw httpError(401, 'Invalid recovery code');

    // One-time use: the consumed hash is removed so it can't be replayed.
    const remaining = record.recoveryCodesHashed.filter((_, i) => i !== matchIndex);
    await prisma.mFASecret.update({
      where: { userId: user.id },
      data: { recoveryCodesHashed: remaining },
    });
  }

  const session = await prisma.$transaction(async (tx) => {
    const result = await issueSession(user, { ip, userAgent }, tx);
    await recordAuditEvent(tx, {
      actorUserId: user.id,
      eventType: AUDIT_EVENTS.LOGIN_SUCCESS,
      entityType: 'User',
      entityId: user.id,
      payload: { ip, userAgent, via: code ? 'totp' : 'recovery_code' },
    });
    return result;
  });
  return { user: toPublicUser(user), ...session };
}

async function findMatchingRecoveryCodeIndex(hashedCodes, plaintextCode) {
  if (!plaintextCode) return -1;
  for (let i = 0; i < hashedCodes.length; i += 1) {
    if (await verifyPassword(hashedCodes[i], plaintextCode)) return i;
  }
  return -1;
}

module.exports = { setupMfa, verifyMfaSetup, disableMfa, loginWithMfa };
