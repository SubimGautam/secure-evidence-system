const { Router } = require('express');
const authenticate = require('../../middleware/authenticate');
const { requirePermission } = require('../../middleware/rbac');
const controller = require('./audit.controller');

const router = Router();

// AUDITOR and ADMIN only — Officers and Custodians have no reason to read
// the security event log, and "Auditors have read-only access" is enforced
// simply by never giving AUDITOR any `:create`/`:update` permission anywhere
// in the matrix, not by a special case here.
router.get('/audit-log', authenticate, requirePermission('audit:read'), controller.list);
router.get('/audit-log/verify', authenticate, requirePermission('audit:read'), controller.verify);

module.exports = router;
