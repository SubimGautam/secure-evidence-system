
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
    'evidence:confirm',
    'evidence:reopen',
    'custody:initiate',
    'custody:respond',
  ],
  EVIDENCE_CUSTODIAN: [
    'evidence:read',
    'evidence:upload',
    'evidence:release',
    'evidence:return',
    'evidence:archive',
    'custody:initiate',
    'custody:respond',
  ],
  AUDITOR: ['evidence:read', 'audit:read', 'custody:read'],
};

function roleHasPermission(role, permission) {
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

module.exports = { ROLE_PERMISSIONS, roleHasPermission };
