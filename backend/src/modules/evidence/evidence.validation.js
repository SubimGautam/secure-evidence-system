const { z } = require('zod');

// .strict() rejects any key it doesn't recognize instead of silently
// dropping it — a client sending `status`, `currentCustodianId`, `loggedById`
// or `id` gets a loud 400, not a quietly-ignored field or (worse) a write
// mass-assignment would have let through.
const createEvidenceSchema = z
  .object({
    description: z.string().trim().min(1).max(2000),
    type: z.string().trim().min(1).max(100),
    collectedAt: z.coerce.date(),
    collectedLocation: z.string().trim().max(500).optional(),
  })
  .strict();

const updateEvidenceSchema = z
  .object({
    description: z.string().trim().min(1).max(2000).optional(),
    type: z.string().trim().min(1).max(100).optional(),
    collectedLocation: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' });

module.exports = { createEvidenceSchema, updateEvidenceSchema };
