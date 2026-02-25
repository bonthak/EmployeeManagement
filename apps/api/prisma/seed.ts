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
      role: 'employee',
      department: 'Engineering',
      empId: 'EMP-1001',
      workingLocation: 'Bengaluru',
      baseLocation: 'Bengaluru',
      mobileNumber: '+1-555-0101',
      billable: true,
      projectAllocation: 100,
      active: true,
      userId: employeeUser.id,
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
      empId: 'EMP-1002',
      workingLocation: 'Pune',
      baseLocation: 'Pune',
      mobileNumber: '+1-555-0102',
      billable: false,
      projectAllocation: 0,
      active: true,
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
      role: 'employee',
      department: 'Operations',
      empId: 'EMP-1003',
      empId: 'EMP-1003',
      workingLocation: 'Hyderabad',
      baseLocation: 'Hyderabad',
      mobileNumber: '+1-555-0103',
      billable: true,
      projectAllocation: 65,
      active: true,
      userId: employeeUser.id,
    },
  });

  const employees = await prisma.employee.findMany({
    select: { id: true, email: true, role: true },
  });

  for (const employee of employees) {
    const employeeUser = await prisma.user.upsert({
      where: { email: employee.email },
      update: {
        role: employee.role,
        passwordHash,
      },
      create: {
        email: employee.email,
        role: employee.role,
        passwordHash,
      },
    });

    await prisma.employee.update({
      where: { id: employee.id },
      data: { userId: employeeUser.id },
    });
  }
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
