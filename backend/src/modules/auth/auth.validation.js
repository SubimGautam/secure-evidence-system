const { z } = require('zod');

// NIST 800-63B favors length over forced complexity, but a light complexity
// check here catches the weakest passwords (e.g. "aaaaaaaaaaaa") without
// the false sense of security that comes with the older ordering rules.
const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

const emailSchema = z.string().trim().toLowerCase().email('Invalid email address').max(255);

const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Code must be 6 digits');

const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(1, 'Full name is required').max(200),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

const mfaLoginSchema = z
  .object({
    mfaToken: z.string().min(1, 'mfaToken is required'),
    code: totpCodeSchema.optional(),
    recoveryCode: z.string().trim().optional(),
  })
  .refine((data) => data.code || data.recoveryCode, {
    message: 'Either code or recoveryCode is required',
  });

const mfaVerifySchema = z.object({
  code: totpCodeSchema,
});

const mfaDisableSchema = z.object({
  password: z.string().min(1, 'Password is required'),
  code: totpCodeSchema,
});

const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

const passwordResetConfirmSchema = z.object({
  token: z.string().min(1, 'token is required'),
  newPassword: passwordSchema,
});

module.exports = {
  registerSchema,
  loginSchema,
  mfaLoginSchema,
  mfaVerifySchema,
  mfaDisableSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
};
