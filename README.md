# Employee Management Platform

Monorepo containing:
- `apps/web`: Next.js web app (desktop + mobile browsers)
- `apps/mobile`: Expo React Native mobile app
- `apps/api`: Node.js Express API with Prisma + PostgreSQL
- `packages/shared`: shared types/utilities

## Quick start

1. Copy `apps/api/.env.example` to `apps/api/.env` and set values.
2. Start PostgreSQL and create database `emportal`.
3. Install dependencies:

```bash
pnpm install
```

4. Generate Prisma client and migrate schema:

```bash
pnpm --filter @em/api prisma:generate
pnpm --filter @em/api prisma:migrate --name init
```

5. Seed default users/employees:

```bash
pnpm --filter @em/api prisma:seed
```

6. Start apps:

```bash
pnpm dev
```

## Default login users (after seed)
- `admin@company.com` / `ChangeMe123!`
- `manager@company.com` / `ChangeMe123!`
- `employee@company.com` / `ChangeMe123!`

## Quality and security

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm format
pnpm audit --audit-level=high
```
