const { PrismaClient } = require('../generated/prisma');
const { PrismaPg } = require('@prisma/adapter-pg');
const env = require('../config/env');

// A single shared client per process — Prisma's connection pool is meant to be
// reused, not recreated per request.
//
// RUNTIME_DATABASE_URL, not DATABASE_URL: the app queries as an ordinary,
// non-owner role so the audit_logs RLS policies actually apply to it — see
// config/env.js and prisma/init/01-create-runtime-role.sh.
const adapter = new PrismaPg({ connectionString: env.RUNTIME_DATABASE_URL });
const prisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

module.exports = prisma;
