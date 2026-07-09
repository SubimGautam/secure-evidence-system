const { Router } = require('express');
const authenticate = require('../../middleware/authenticate');
const { requirePermission } = require('../../middleware/rbac');
const { requireEvidenceOwner, requireCurrentCustodian } = require('../../middleware/abac');
const { upload } = require('../../middleware/upload');
const validate = require('../../middleware/validate');
const controller = require('./evidence.controller');
const { createEvidenceSchema, updateEvidenceSchema } = require('./evidence.validation');

const router = Router();

router.post(
  '/',
  authenticate,
  requirePermission('evidence:create'),
  validate(createEvidenceSchema),
  controller.create,
);

// Read access is RBAC-only (no ABAC) — every role with `evidence:read` may
// view any item. Ownership only narrows *write* access (architecture doc §7:
// "who looked at this" and "who may change this" are different questions).
router.get('/', authenticate, requirePermission('evidence:read'), controller.list);
router.get('/:id', authenticate, requirePermission('evidence:read'), controller.getOne);

router.patch(
  '/:id',
  authenticate,
  requirePermission('evidence:update'),
  validate(updateEvidenceSchema),
  requireEvidenceOwner,
  controller.update,
);

// All four lifecycle actions are gated the same way: requireCurrentCustodian
// (only whoever currently holds the item may move it forward) plus the
// service layer's own status guard (409 if the move isn't legal from where
// it currently is — see evidence.service.js transitionStatus).
router.post(
  '/:id/confirm',
  authenticate,
  requirePermission('evidence:confirm'),
  requireCurrentCustodian,
  controller.confirmCollection,
);
// Reopening is gated by requireEvidenceOwner, not requireCurrentCustodian —
// it's the original logging Officer's call to undo their own confirmation,
// independent of who currently holds the item.
router.post(
  '/:id/reopen',
  authenticate,
  requirePermission('evidence:reopen'),
  requireEvidenceOwner,
  controller.reopen,
);
router.post(
  '/:id/release',
  authenticate,
  requirePermission('evidence:release'),
  requireCurrentCustodian,
  controller.releaseForCourt,
);
router.post(
  '/:id/return',
  authenticate,
  requirePermission('evidence:return'),
  requireCurrentCustodian,
  controller.markReturned,
);
router.post(
  '/:id/archive',
  authenticate,
  requirePermission('evidence:archive'),
  requireCurrentCustodian,
  controller.archive,
);

// Only the current custodian may add a file — same rule as initiating a
// transfer (architecture doc §5: possession, not just role, gates writes
// that change what's attached to an item in someone's custody).
router.post(
  '/:id/files',
  authenticate,
  requirePermission('evidence:upload'),
  requireCurrentCustodian,
  upload.single('file'),
  controller.uploadFile,
);

router.get(
  '/:id/files/:fileId/download',
  authenticate,
  requirePermission('evidence:read'),
  controller.downloadFile,
);

module.exports = router;
