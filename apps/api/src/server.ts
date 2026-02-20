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
app.use(express.json());

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
  };

  const response: LoginResponse = {
    token: tokenForUser(authUser),
    user: authUser,
  };

  return res.json(response);
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
    const created = await prisma.employee.create({
      data: {
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        role: payload.role,
        department: payload.department,
        userId: payload.userId ?? null,
      },
    });

    return res.status(201).json(toEmployee(created));
  } catch {
    return res.status(409).json({ error: 'Employee email already exists' });
  }
});

app.put('/api/employees/:id', authRequired, requireRole(['admin', 'manager']), async (req, res) => {
  const parsed = employeePayloadSchema.safeParse(req.body satisfies EmployeePayload);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const payload: EmployeePayload = parsed.data;

  try {
    const updated = await prisma.employee.update({
      where: { id: String(req.params.id) },
      data: {
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        role: payload.role,
        department: payload.department,
        userId: payload.userId ?? null,
      },
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

