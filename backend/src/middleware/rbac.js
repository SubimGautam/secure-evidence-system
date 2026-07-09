const httpError = require('../lib/httpError');
const { roleHasPermission } = require('../config/permissions');

// 401 vs 403 is deliberate: 401 means "we don't know who you are" (auth
// missing/expired — shouldn't happen here since `authenticate` runs first,
// but a route that forgets to chain it fails closed rather than silently
// allowing the request through). 403 means "we know exactly who you are,
// and the answer is no." Neither response says which roles *would* have
// been allowed — that's information an attacker probing the API shouldn't
// get for free.
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
