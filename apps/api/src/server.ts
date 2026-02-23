import 'dotenv/config';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { z } from 'zod';
import type { AuthUser, Employee, EmployeePayload, LoginRequest, LoginResponse, PaginatedEmployees, UserRole } from '@em/shared';
import prisma from './lib/prisma.js';

const app = express();
const port = Number(process.env.PORT ?? 4000);
const jwtSecret = process.env.JWT_SECRET ?? 'super-secret-change-me';

app.use(helmet());
app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:8081'] }));
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

const employeePayloadSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().email(),
  role: z.enum(['admin', 'employee', 'manager']),
  department: z.string().trim().min(1),
  userId: z.string().optional().nullable(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const profileImageSchema = z.object({
  profileImage: z.string().min(1).max(2_000_000),
});

const DEFAULT_EMPLOYEE_PASSWORD_HASH = '$2b$10$/tnN/KbHtBrRbeQN6ds0QuPD72p.ZhiIKXjMgEn9EUF1Sd.dWPTuW';

type RequestUser = AuthUser;

interface AuthRequest extends Request {
  user?: RequestUser;
}

const toEmployee = (entity: {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  department: string;
  userId: string | null;
}): Employee => ({
  id: entity.id,
  firstName: entity.firstName,
  lastName: entity.lastName,
  email: entity.email,
  role: entity.role,
  department: entity.department,
  userId: entity.userId,
});

const tokenForUser = (user: RequestUser): string => {
  return jwt.sign(user, jwtSecret, { expiresIn: '12h' });
};

const authRequired = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, jwtSecret) as JwtPayload & RequestUser;
    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      employeeId: payload.employeeId ?? null,
      profileImage: payload.profileImage ?? null,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const requireRole = (roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const role = req.user?.role;
    if (!role || !roles.includes(role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    next();
  };
};

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, service: 'api', database: 'connected' });
  } catch {
    res.status(500).json({ ok: false, service: 'api', database: 'disconnected' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body satisfies LoginRequest);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    include: { employee: true },
  });

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const authUser: RequestUser = {
    id: user.id,
    email: user.email,
    role: user.role,
    employeeId: user.employee?.id ?? null,
    profileImage: user.profileImage ?? null,
  };

  const response: LoginResponse = {
    token: tokenForUser(authUser),
    user: authUser,
  };

  return res.json(response);
});

app.post('/api/auth/logout', authRequired, (_req, res) => {
  return res.status(204).send();
});

app.patch('/api/users/me/profile-image', authRequired, async (req: AuthRequest, res) => {
  const parsed = profileImageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data: { profileImage: parsed.data.profileImage },
    });

    const authUser: RequestUser = {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      employeeId: req.user?.employeeId ?? null,
      profileImage: updated.profileImage ?? null,
    };

    return res.json({ user: authUser });
  } catch {
    return res.status(404).json({ error: 'User not found' });
  }
});

app.get('/api/employees', authRequired, async (req: AuthRequest, res) => {
  const q = String(req.query.q ?? '').trim();
  const role = String(req.query.role ?? '').trim().toLowerCase() as '' | UserRole;
  const department = String(req.query.department ?? '').trim();
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize ?? 10)));

  const where = {
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' as const } },
            { lastName: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(department ? { department: { contains: department, mode: 'insensitive' as const } } : {}),
    ...(role ? { role } : {}),
    ...(req.user?.role === 'employee' ? { userId: req.user.id } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    }),
  ]);

  const payload: PaginatedEmployees = {
    data: rows.map(toEmployee),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };

  res.json(payload);
});

app.get('/api/employees/:id', authRequired, async (req: AuthRequest, res) => {
  const employee = await prisma.employee.findUnique({ where: { id: String(req.params.id) } });
  if (!employee) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  if (req.user?.role === 'employee' && employee.userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  return res.json(toEmployee(employee));
});

app.post('/api/employees', authRequired, requireRole(['admin', 'manager']), async (req, res) => {
  const parsed = employeePayloadSchema.safeParse(req.body satisfies EmployeePayload);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const payload: EmployeePayload = parsed.data;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: payload.email.toLowerCase(),
          role: payload.role,
          passwordHash: DEFAULT_EMPLOYEE_PASSWORD_HASH,
        },
      });

      return tx.employee.create({
        data: {
          firstName: payload.firstName,
          lastName: payload.lastName,
          email: payload.email.toLowerCase(),
          role: payload.role,
          department: payload.department,
          userId: user.id,
        },
      });
    });

    return res.status(201).json(toEmployee(created));
  } catch {
    return res.status(409).json({ error: 'User or employee email already exists' });
  }
});

app.put('/api/employees/:id', authRequired, requireRole(['admin', 'manager']), async (req, res) => {
  const parsed = employeePayloadSchema.safeParse(req.body satisfies EmployeePayload);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const payload: EmployeePayload = parsed.data;
  const employeeId = String(req.params.id);
  const normalizedEmail = payload.email.toLowerCase();

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, userId: true },
      });

      if (!existing) {
        throw new Error('NOT_FOUND');
      }

      let userId = existing.userId;
      if (userId) {
        await tx.user.update({
          where: { id: userId },
          data: {
            email: normalizedEmail,
            role: payload.role,
          },
        });
      } else {
        const createdUser = await tx.user.create({
          data: {
            email: normalizedEmail,
            role: payload.role,
            passwordHash: DEFAULT_EMPLOYEE_PASSWORD_HASH,
          },
        });
        userId = createdUser.id;
      }

      return tx.employee.update({
        where: { id: employeeId },
        data: {
          firstName: payload.firstName,
          lastName: payload.lastName,
          email: normalizedEmail,
          role: payload.role,
          department: payload.department,
          userId,
        },
      });
    });

    return res.json(toEmployee(updated));
  } catch {
    return res.status(404).json({ error: 'Employee not found or email already used' });
  }
});

app.delete('/api/employees/:id', authRequired, requireRole(['admin']), async (req, res) => {
  try {
    await prisma.employee.delete({ where: { id: String(req.params.id) } });
    return res.status(204).send();
  } catch {
    return res.status(404).json({ error: 'Employee not found' });
  }
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
