// Coarse-grained "can this role ever do X" gate. Deliberately separate from
// the ABAC layer (middleware/abac.js), which answers the finer question —
// "can THIS user do X to THIS specific resource" — that a role-only check
// can never express (see architecture doc §7).
//
// ADMIN is a superset of every other role's permissions here, but full admin
// access is really guaranteed by the explicit bypass in each ABAC check
// (middleware/abac.js) — this list alone wouldn't get an Admin past an
// ownership check on its own.
const ROLE_PERMISSIONS = {
  ADMIN: [
    'evidence:create',
    'evidence:read',
    'evidence:update',
    'evidence:upload',
    'evidence:confirm',
    'evidence:reopen',
    'evidence:release',
    'evidence:return',
    'evidence:archive',
    'custody:initiate',
    'custody:respond',
    'custody:read',
    'users:manage',
    'audit:read',
    'system:read',
  ],
  OFFICER: [
    'evidence:create',
    'evidence:read',
    'evidence:update',
    'evidence:upload',
    // Confirming collection (PENDING -> COLLECTED) is the logging Officer's
    // call, not the Custodian's — it happens before the item has ever left
    // their hands. Reopening (COLLECTED -> PENDING, undoing a confirmation
    // made in error) is the same Officer's call for the same reason.
    'evidence:confirm',
    'evidence:reopen',
    'custody:initiate',
    'custody:respond',
  ],
  // No `evidence:update` or `evidence:confirm` — a Custodian holds items
  // in transit and afterward, they don't edit metadata or confirm the
  // initial intake (that's the Officer's job), but they can still attach a
  // file while they're the current custodian (requireCurrentCustodian
  // narrows `evidence:upload` to only the item(s) they're actually holding).
  // Court release/return/archive are the Custodian's calls, though — those
  // happen to items already in their custody.
  EVIDENCE_CUSTODIAN: [
    'evidence:read',
    'evidence:upload',
    'evidence:release',
    'evidence:return',
    'evidence:archive',
    'custody:initiate',
    'custody:respond',
  ],
  // `custody:read` is the system-wide, cross-evidence transfer history view
  // (Auditor page) — distinct from seeing one item's transfers via
  // evidence:read, which every role above already has.
  AUDITOR: ['evidence:read', 'audit:read', 'custody:read'],
};

function roleHasPermission(role, permission) {
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

module.exports = { ROLE_PERMISSIONS, roleHasPermission };
