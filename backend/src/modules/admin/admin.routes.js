const { Router } = require('express');
const authenticate = require('../../middleware/authenticate');
const { requirePermission } = require('../../middleware/rbac');
const controller = require('./admin.controller');

const router = Router();

router.get('/health', authenticate, requirePermission('system:read'), controller.health);

module.exports = router;
