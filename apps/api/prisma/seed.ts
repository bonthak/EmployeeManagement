import bcrypt from 'bcryptjs';
import prisma from '../src/lib/prisma.js';

const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD ?? 'ChangeMe123!';

async function main() {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@company.com' },
    update: {},
    create: {
      email: 'admin@company.com',
      passwordHash,
      role: 'admin',
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@company.com' },
    update: {},
    create: {
      email: 'manager@company.com',
      passwordHash,
      role: 'manager',
    },
  });

  const employeeUser = await prisma.user.upsert({
    where: { email: 'employee@company.com' },
    update: {},
    create: {
      email: 'employee@company.com',
      passwordHash,
      role: 'employee',
    },
  });

  await prisma.employee.upsert({
    where: { email: 'alex.johnson@company.com' },
    update: {},
    create: {
      firstName: 'Alex',
      lastName: 'Johnson',
      email: 'alex.johnson@company.com',
      role: 'manager',
      department: 'Engineering',
      userId: manager.id,
    },
  });

  await prisma.employee.upsert({
    where: { email: 'maya.singh@company.com' },
    update: {},
    create: {
      firstName: 'Maya',
      lastName: 'Singh',
      email: 'maya.singh@company.com',
      role: 'employee',
      department: 'HR',
      userId: employeeUser.id,
    },
  });

  await prisma.employee.upsert({
    where: { email: 'daniel.brooks@company.com' },
    update: {},
    create: {
      firstName: 'Daniel',
      lastName: 'Brooks',
      email: 'daniel.brooks@company.com',
      role: 'admin',
      department: 'Operations',
      userId: admin.id,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
