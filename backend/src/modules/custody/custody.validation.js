const { z } = require('zod');

const initiateTransferSchema = z
  .object({
    toUserId: z.string().uuid('toUserId must be a valid user id'),
  })
  .strict();

module.exports = { initiateTransferSchema };
