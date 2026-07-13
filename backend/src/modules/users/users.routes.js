const { Router } = require('express');
const authenticate = require('../../middleware/authenticate');
const { requirePermission } = require('../../middleware/rbac');
const validate = require('../../middleware/validate');
const controller = require('./users.controller');
const {
  updateRoleSchema,
  updateStatusSchema,
  updateOwnProfileSchema,
  importOwnProfileSchema,
} = require('./users.validation');

const router = Router();

// Any authenticated user — see the comment on listDirectory() in
// users.service.js. Registered before `/:id/...` only as a matter of
// convention; it wouldn't collide with those patterns either way.
router.get('/directory', authenticate, controller.directory);

// Self-service profile: view/edit/export/import of the caller's own
// account, scoped by req.user.id rather than a route param — see the note
// on users.service.js's self-service section for why that matters.
router.get('/me', authenticate, controller.getOwnProfile);
router.patch('/me', authenticate, validate(updateOwnProfileSchema), controller.updateOwnProfile);
router.get('/me/export', authenticate, controller.exportOwnData);
router.post(
  '/me/import',
  authenticate,
  validate(importOwnProfileSchema),
  controller.importOwnProfile,
);

// Only ADMIN holds `users:manage` in the permission matrix — this whole
// module is a vertical-privilege-escalation test surface by design.
router.get('/', authenticate, requirePermission('users:manage'), controller.list);
router.patch(
  '/:id/role',
  authenticate,
  requirePermission('users:manage'),
  validate(updateRoleSchema),
  controller.updateRole,
);
router.patch(
  '/:id/status',
  authenticate,
  requirePermission('users:manage'),
  validate(updateStatusSchema),
  controller.updateStatus,
);
router.post('/:id/lock', authenticate, requirePermission('users:manage'), controller.lock);
router.post('/:id/unlock', authenticate, requirePermission('users:manage'), controller.unlock);
router.post('/:id/mfa/reset', authenticate, requirePermission('users:manage'), controller.resetMfa);
router.get(
  '/:id/sessions',
  authenticate,
  requirePermission('users:manage'),
  controller.listSessions,
);
router.delete(
  '/:id/sessions/:sessionId',
  authenticate,
  requirePermission('users:manage'),
  controller.revokeSession,
);

module.exports = router;
