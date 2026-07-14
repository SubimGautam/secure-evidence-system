const { z } = require('zod');

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
