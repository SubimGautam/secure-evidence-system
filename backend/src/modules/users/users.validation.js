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

module.exports = { updateRoleSchema, updateStatusSchema };
