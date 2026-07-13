const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');

// z.coerce.boolean() runs plain JS `Boolean(value)` — for a string, that's
// true for anything non-empty, *including* "false". Every env var is a
// string (Docker Compose, shells, .env files all pass "false" as four
// characters, not the primitive), so z.coerce.boolean() silently forces
// this true no matter what the operator wrote. Only "true"/"1"
// (case-insensitive) parse as true; everything else — "false", "0", "",
// unset — is false.
const booleanFromEnv = z.preprocess((val) => {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return ['true', '1'].includes(val.trim().toLowerCase());
  return false;
}, z.boolean());

// quiet: true — dotenv v17+ otherwise prints a random promotional "tip"
// (including third-party sponsor URLs) to stdout on every boot, which has
// no business being in this app's logs.
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

// Fail fast on boot rather than surfacing a confusing runtime error the first
// time a misconfigured value (e.g. a missing DATABASE_URL) is actually used.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  // The schema-owning connection (used for migrations). The running app
  // queries through RUNTIME_DATABASE_URL instead — see lib/prisma.js — so
  // that its DB session is never the table owner or a superuser, which is
  // what makes the audit_logs RLS immutability policy actually bind it
  // (migration 20260709073329). Falls back to DATABASE_URL when unset so a
  // single-role local setup (no docker-compose role separation) still works.
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  RUNTIME_DATABASE_URL: z.string().min(1).optional(),
  CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN is required'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

  // Shared AES-256-GCM master key — encrypts both TOTP secrets (lib/mfa.js)
  // and evidence files at rest (lib/crypto.js encryptBuffer/decryptBuffer).
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, 'ENCRYPTION_KEY must be exactly 32 bytes as hex (64 chars)'),

  EVIDENCE_STORAGE_PATH: z.string().default('./storage/evidence-files'),

  // hCaptcha bot-mitigation on /auth/register and /auth/login, layered on
  // top of rate limiting + account lockout (middleware/captcha.js). Off by
  // default so a fresh checkout with no keys provisioned still boots and
  // authenticates — flip CAPTCHA_ENABLED once real hCaptcha keys exist.
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
