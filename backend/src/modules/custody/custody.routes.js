const { Router } = require('express');
const authenticate = require('../../middleware/authenticate');
const { requirePermission } = require('../../middleware/rbac');
const { requireCurrentCustodian, requireTransferRecipient } = require('../../middleware/abac');
const validate = require('../../middleware/validate');
const controller = require('./custody.controller');
const { initiateTransferSchema } = require('./custody.validation');

const router = Router();

// Mounted at /api/v1 (not /api/v1/custody) so these read as
// /evidence/:id/transfer and /transfers/:id/accept|reject, matching the API
// shape in the architecture doc's §9.
router.post(
  '/evidence/:id/transfer',
  authenticate,
  requirePermission('custody:initiate'),
  validate(initiateTransferSchema),
  requireCurrentCustodian,
  controller.initiate,
);

router.post(
  '/transfers/:id/accept',
  authenticate,
  requirePermission('custody:respond'),
  requireTransferRecipient,
  controller.accept,
);

router.post(
  '/transfers/:id/reject',
  authenticate,
  requirePermission('custody:respond'),
  requireTransferRecipient,
  controller.reject,
);

// Self-scoped ("transfers addressed to me") — no custody:read permission
// required, since a user asking "what's waiting on me" isn't browsing
// anyone else's data. Powers the Dashboard's incoming-transfers section.
router.get('/transfers/incoming', authenticate, controller.listIncoming);

// System-wide, cross-evidence transfer history — the Auditor's dedicated
// view. Everyone with evidence:read can already see one item's transfers
// via GET /evidence/:id; this is the "browse everything" equivalent, so
// it's gated by its own `custody:read` permission (Auditor + Admin only)
// rather than piggybacking on evidence:read.
router.get('/custody-transfers', authenticate, requirePermission('custody:read'), controller.list);

module.exports = router;
