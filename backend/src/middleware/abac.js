const prisma = require('../lib/prisma');
const httpError = require('../lib/httpError');

// One factory behind every ABAC check below: load the resource named in the
// route param, let ADMIN through unconditionally ("Administrators have full
// access"), otherwise run the caller's `allow` predicate against the
// resource and the requesting user. The loaded resource is attached to
// `req[attachAs]` so the controller that runs next doesn't re-fetch it (and
// can't act on a version of the row from after the check).
//
// A missing resource is a plain 404, not a 403 — there is nothing sensitive
// about a random ID matching no evidence item. A resource that exists but
// fails `allow` is a 403 with a message that says only "not permitted,"
// never which user/role would have been (see rbac.js for the same reasoning).
function requireResourceAttribute({ model, idParam = 'id', attachAs, allow }) {
  return async (req, res, next) => {
    if (!req.user) return next(httpError(401, 'Authentication required'));
    try {
      const resource = await prisma[model].findUnique({ where: { id: req.params[idParam] } });
      if (!resource) return next(httpError(404, `${model} not found`));

      if (req.user.role !== 'ADMIN' && !allow(resource, req.user)) {
        return next(httpError(403, 'You do not have permission to perform this action'));
      }

      req[attachAs] = resource;
      next();
    } catch (err) {
      next(err);
    }
  };
}

// "Officers may only modify evidence they originally created until it
// enters custody" — both conditions are checked together (loggedById match
// AND still in the pre-transfer draft window) because either one alone is
// the wrong rule: dropping the status check would let the original logger
// edit history after the item has moved on; dropping the ownership check
// would let any Officer edit anyone's freshly-logged item. PENDING and
// COLLECTED both count as "before it enters custody" — the officer who
// logged it still owns the record through the confirm-collection step.
const requireEvidenceOwner = requireResourceAttribute({
  model: 'evidence',
  attachAs: 'evidence',
  allow: (evidence, user) =>
    evidence.loggedById === user.id && ['PENDING', 'COLLECTED'].includes(evidence.status),
});

// Only the current holder of an item may hand it off.
const requireCurrentCustodian = requireResourceAttribute({
  model: 'evidence',
  attachAs: 'evidence',
  allow: (evidence, user) => evidence.currentCustodianId === user.id,
});

// Only the person a transfer was addressed to may accept or reject it — a
// role check alone can't express this, since any Officer/Custodian could
// otherwise resolve a transfer meant for someone else (architecture doc §5).
const requireTransferRecipient = requireResourceAttribute({
  model: 'custodyTransfer',
  attachAs: 'transfer',
  allow: (transfer, user) => transfer.toUserId === user.id,
});

module.exports = {
  requireResourceAttribute,
  requireEvidenceOwner,
  requireCurrentCustodian,
  requireTransferRecipient,
};
