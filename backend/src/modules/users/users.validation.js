const { z } = require('zod');

// Enum, not a free-text string — a role name that isn't one of the four
// seeded roles fails validation before it ever reaches the database.
const updateRoleSchema = z
  .object({
    role: z.enum(['ADMIN', 'OFFICER', 'EVIDENCE_CUSTODIAN', 'AUDITOR']),
  })
  .strict();

const updateStatusSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

// The only field a user may change about themselves through this endpoint —
// role/status/lock live exclusively under the admin-only `/:id/...` routes
// above. .strict() means a client trying to slip `role` or `id` into the
// same request body gets a validation error, not a silently-ignored field.
const updateOwnProfileSchema = z
  .object({
    fullName: z.string().trim().min(1, 'Full name is required').max(200),
  })
  .strict();

// Deliberately the same shape as updateOwnProfileSchema, not a generic
// deserializer for an uploaded export file — "import" here means
// "re-apply the one editable field from a file you previously exported,"
// nothing else in that file is trusted.
const importOwnProfileSchema = updateOwnProfileSchema;

module.exports = {
  updateRoleSchema,
  updateStatusSchema,
  updateOwnProfileSchema,
  importOwnProfileSchema,
};
