const prisma = require('../src/lib/prisma');

// Idempotent by design (upsert on the unique `name`) so it's safe to run
// again after `migrate dev` on an already-seeded database.
const ROLES = [
  {
    name: 'ADMIN',
    description:
      'Full system access — manages users and roles, and is the only role that can force-reassign evidence custody.',
  },
  {
    name: 'OFFICER',
    description: 'Logs evidence and initiates custody transfers for items they currently hold.',
  },
  {
    name: 'EVIDENCE_CUSTODIAN',
    description:
      'Receives and holds evidence; accepts or rejects custody transfers addressed to them.',
  },
  {
    name: 'AUDITOR',
    description:
      'Read-only access to evidence and custody history; can verify audit log chain integrity.',
  },
];

async function main() {
  for (const role of ROLES) {
    const record = await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
    console.log(`Role ready: ${record.name}`);
  }
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
