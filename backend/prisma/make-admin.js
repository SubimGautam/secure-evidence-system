const prisma = require('../src/lib/prisma');

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node prisma/make-admin.js <email>');
    process.exit(1);
  }

  const adminRole = await prisma.role.findUnique({ where: { name: 'ADMIN' } });
  if (!adminRole) {
    console.error('ADMIN role not found — did you run the seed script?');
    process.exit(1);
  }

  const user = await prisma.user.update({
    where: { email },
    data: { roleId: adminRole.id },
  });

  console.log(`Updated ${user.email} -> roleId: ${user.roleId}`);
}

main()
  .catch((err) => {
    console.error('Failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });