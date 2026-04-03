import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const login = process.argv[2];
  const password = process.argv[3];

  if (!login || !password) {
    console.error('Usage: node dist/tools/reset-admin-password.js <login> <password>');
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const firstAdmin = await prisma.admin.findFirst({ orderBy: { id: 'asc' } });

    if (!firstAdmin) {
      await prisma.admin.create({
        data: {
          login,
          passwordHash,
        },
      });
    } else {
      await prisma.admin.update({
        where: { id: firstAdmin.id },
        data: {
          login,
          passwordHash,
        },
      });
    }

    console.log(`Admin credentials updated for login=${login}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});