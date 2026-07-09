const prisma = require('../../lib/prisma');
const httpError = require('../../lib/httpError');
const { recordAuditEvent, AUDIT_EVENTS } = require('../../lib/auditLog');

// Only items that have actually been confirmed collected, and aren't
// currently checked out to court or archived, can change hands. PENDING
// (not yet confirmed) and RELEASED_FOR_COURT/ARCHIVED are all deliberately
// excluded.
const TRANSFERABLE_STATUSES = ['COLLECTED', 'IN_CUSTODY', 'RETURNED'];

async function initiateTransfer(evidence, fromUser, toUserId) {
  if (toUserId === fromUser.id) throw httpError(400, 'Cannot transfer evidence to yourself');
  if (!TRANSFERABLE_STATUSES.includes(evidence.status)) {
    throw httpError(409, `Evidence is ${evidence.status} and cannot be transferred right now`);
  }

  const toUser = await prisma.user.findUnique({ where: { id: toUserId } });
  if (!toUser || toUser.deletedAt) throw httpError(400, 'Recipient not found');

  return prisma.$transaction(async (tx) => {
    // Evidence.status is deliberately left untouched here — a transfer
    // being mid-handshake is fully captured by this row's own PENDING
    // status, not duplicated onto the evidence record too (see the
    // EvidenceStatus enum's doc comment in schema.prisma).
    const transfer = await tx.custodyTransfer.create({
      data: { evidenceId: evidence.id, fromUserId: fromUser.id, toUserId, status: 'PENDING' },
    });
    await recordAuditEvent(tx, {
      actorUserId: fromUser.id,
      eventType: AUDIT_EVENTS.CUSTODY_TRANSFER_INITIATED,
      entityType: 'CustodyTransfer',
      entityId: transfer.id,
      payload: { evidenceId: evidence.id, fromUserId: fromUser.id, toUserId },
    });
    return transfer;
  });
}

// Whether the transfer is even still PENDING is business state, not
// authorization — requireTransferRecipient already confirmed *who* may
// respond; this confirms the action still makes sense, which is why it's a
// 409 (conflict), not a 403.
async function respondToTransfer(transfer, accept, actorUserId) {
  if (transfer.status !== 'PENDING') {
    throw httpError(409, 'This transfer has already been resolved');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.custodyTransfer.update({
      where: { id: transfer.id },
      data: { status: accept ? 'ACCEPTED' : 'REJECTED', respondedAt: new Date() },
    });
    // Rejecting changes nothing about the evidence — custody, and its
    // status, both stay exactly as they were. Only acceptance moves it:
    // always to IN_CUSTODY, regardless of what state it was transferred
    // from (COLLECTED, IN_CUSTODY, or RETURNED all collapse to "now held
    // by the new custodian").
    if (accept) {
      await tx.evidence.update({
        where: { id: transfer.evidenceId },
        data: { status: 'IN_CUSTODY', currentCustodianId: transfer.toUserId },
      });
    }
    await recordAuditEvent(tx, {
      actorUserId,
      eventType: accept
        ? AUDIT_EVENTS.CUSTODY_TRANSFER_ACCEPTED
        : AUDIT_EVENTS.CUSTODY_TRANSFER_REJECTED,
      entityType: 'CustodyTransfer',
      entityId: transfer.id,
      payload: { evidenceId: transfer.evidenceId },
    });
    return updated;
  });
}

function listAllTransfers() {
  return prisma.custodyTransfer.findMany({
    orderBy: { initiatedAt: 'desc' },
    take: 200,
    include: {
      evidence: { select: { id: true, referenceCode: true, description: true } },
      fromUser: { select: { id: true, fullName: true } },
      toUser: { select: { id: true, fullName: true } },
    },
  });
}

// Self-scoped by toUserId — every authenticated user may see transfers
// addressed to them (no custody:read needed, unlike listAllTransfers, which
// is the cross-user Auditor/Admin view). Powers the Dashboard's "Incoming
// transfers" section so a recipient can find a pending handoff without
// already knowing the evidence item's ID.
function listIncomingTransfers(userId) {
  return prisma.custodyTransfer.findMany({
    where: { toUserId: userId, status: 'PENDING' },
    orderBy: { initiatedAt: 'desc' },
    include: {
      evidence: { select: { id: true, referenceCode: true, description: true } },
      fromUser: { select: { id: true, fullName: true } },
    },
  });
}

module.exports = { initiateTransfer, respondToTransfer, listAllTransfers, listIncomingTransfers };
