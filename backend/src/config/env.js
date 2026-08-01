const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');

const booleanFromEnv = z.preprocess((val) => {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return ['true', '1'].includes(val.trim().toLowerCase());
  return false;
}, z.boolean());

dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  RUNTIME_DATABASE_URL: z.string().min(1).optional(),
  CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN is required'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, 'ENCRYPTION_KEY must be exactly 32 bytes as hex (64 chars)'),

  EVIDENCE_STORAGE_PATH: z.string().default('./storage/evidence-files'),

  CAPTCHA_ENABLED: booleanFromEnv.default(false),
  CAPTCHA_SECRET_KEY: z.string().optional(),
});

const parsed = envSchema
  .refine((data) => !data.CAPTCHA_ENABLED || !!data.CAPTCHA_SECRET_KEY, {
    message: 'CAPTCHA_SECRET_KEY is required when CAPTCHA_ENABLED=true',
    path: ['CAPTCHA_SECRET_KEY'],
  })
  .safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

module.exports = {
  ...parsed.data,
  RUNTIME_DATABASE_URL: parsed.data.RUNTIME_DATABASE_URL || parsed.data.DATABASE_URL,
};
