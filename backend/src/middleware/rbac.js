const httpError = require('../lib/httpError');
const { roleHasPermission } = require('../config/permissions');

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(httpError(401, 'Authentication required'));
    if (!roles.includes(req.user.role)) {
      return next(httpError(403, 'You do not have permission to perform this action'));
    }
    next();
  };
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return next(httpError(401, 'Authentication required'));
    if (!roleHasPermission(req.user.role, permission)) {
      return next(httpError(403, 'You do not have permission to perform this action'));
    }
    next();
  };
}

module.exports = { requireRole, requirePermission };
