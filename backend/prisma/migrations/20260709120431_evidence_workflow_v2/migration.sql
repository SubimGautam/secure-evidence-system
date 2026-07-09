-- Replaces the evidence lifecycle with the workflow described in the
-- architecture review: PENDING -> COLLECTED -> IN_CUSTODY -> (optional court
-- round trip) -> ARCHIVED. TRANSFER_PENDING is retired — a transfer in
-- progress is tracked by CustodyTransfer.status alone now, not duplicated
-- onto Evidence.status too.

-- New type first, so existing rows can be cast into it below.
CREATE TYPE "EvidenceStatus_new" AS ENUM ('PENDING', 'COLLECTED', 'IN_CUSTODY', 'RELEASED_FOR_COURT', 'RETURNED', 'ARCHIVED');

-- Explicit remap for every existing value, not just a same-name cast:
--   COLLECTED / IN_CUSTODY keep their meaning and carry straight across.
--   TRANSFER_PENDING becomes COLLECTED — the item had already been
--     confirmed collected by definition (only COLLECTED-or-later items
--     could ever have had a transfer initiated), and whether a transfer is
--     still mid-handshake is now answered by CustodyTransfer.status alone.
--   RELEASED / DISPOSED (the old terminal states) both become ARCHIVED,
--     the one terminal state in the new lifecycle.
ALTER TABLE "evidence" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "evidence" ALTER COLUMN "status" TYPE "EvidenceStatus_new" USING (
  CASE "status"::text
    WHEN 'COLLECTED' THEN 'COLLECTED'
    WHEN 'IN_CUSTODY' THEN 'IN_CUSTODY'
    WHEN 'TRANSFER_PENDING' THEN 'COLLECTED'
    WHEN 'RELEASED' THEN 'ARCHIVED'
    WHEN 'DISPOSED' THEN 'ARCHIVED'
  END
)::"EvidenceStatus_new";

DROP TYPE "EvidenceStatus";
ALTER TYPE "EvidenceStatus_new" RENAME TO "EvidenceStatus";
ALTER TABLE "evidence" ALTER COLUMN "status" SET DEFAULT 'PENDING';
