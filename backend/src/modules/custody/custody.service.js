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

  // Without this, nothing stops a second (or third) PENDING transfer from
  // being created for the same item while the first is still outstanding —
  // and unlike the evidence's own status, a transfer's PENDING state isn't
  // touched by a *different* transfer being accepted. That let a stale,
  // never-withdrawn invite still be accepted later, silently reassigning
  // custody away from whoever the item was legitimately handed to in the
  // meantime (see respondToTransfer's custody re-check below for the
  // second layer of defense against the same class of bug).
  const existingPending = await prisma.custodyTransfer.findFirst({
    where: { evidenceId: evidence.id, status: 'PENDING' },
  });
  if (existingPending) {
    throw httpError(
      409,
      'This evidence already has a pending transfer awaiting response — it must be accepted or rejected before another can be initiated',
    );
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

  // Defense in depth, independent of the duplicate-pending guard in
  // initiateTransfer above: re-confirm the sender is still the item's
  // actual current custodian right before an acceptance takes effect. A
  // transfer being PENDING only means nobody has *responded* to it yet —
  // it says nothing about whether custody has since moved on through some
  // other path. Without this, a stale approval could still silently
  // reassign custody away from whoever legitimately holds the item now.
  if (accept) {
    const evidence = await prisma.evidence.findUnique({ where: { id: transfer.evidenceId } });
    if (!evidence || evidence.currentCustodianId !== transfer.fromUserId) {
      throw httpError(
        409,
        'This transfer is no longer valid — custody of this evidence has changed since it was initiated',
      );
    }
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
