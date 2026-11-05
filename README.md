# NEXUS ERP

NEXUS ERP is a multi-company ERP SaaS application for Moroccan and international businesses. The repository contains the foundation, identity onboarding, company role administration, company settings and the first live inventory workflows. It is an in-progress ERP and is not ready for production use.

## Architecture

- `apps/web` — Next.js and React web client.
- `apps/api` — NestJS REST API, OpenAPI docs, Prisma client and migration.
- `packages/shared` — cross-app public types and locale/currency defaults.
- `infra/docker` — local database role bootstrap.
- `docs` — roadmap and architecture decisions.
- PostgreSQL 17 — persistence, schema migrations and tenant row-level security.
- Redis 7 — local service reserved for caching and background work in later phases.

Prisma 7 uses the PostgreSQL driver adapter. Prisma migration commands use `MIGRATION_DATABASE_URL`; the API uses `DATABASE_URL`, a separate `nexus_app` role that cannot bypass row-level security. Migrations run with `nexus_migrator`. The database bootstrap role is used only to initialize local PostgreSQL and create these credentials.

## Requirements

- Node.js 24.11 or newer in the Node 24 line (Node 22.18+ also supported by the current framework/dependency set).
- pnpm 10.34.9 via Corepack.
- Docker Engine with the Compose plugin.

## Local setup (PowerShell)

```powershell
Copy-Item .env.example .env
# Edit .env and set distinct local-only values for POSTGRES_PASSWORD,
# POSTGRES_APP_PASSWORD, POSTGRES_MIGRATOR_PASSWORD, and DEMO_USER_PASSWORD.
corepack prepare pnpm@10.34.9 --activate
pnpm install
docker compose up -d postgres redis
pnpm db:generate
pnpm db:deploy
pnpm db:seed
```

The seed command requires `DEMO_USER_EMAIL` and `DEMO_USER_PASSWORD` in `.env`; use a unique development password of at least 12 characters. It seeds two demo companies, Atlas Manufacturing and Rif Commerce, makes the demo user an owner in each, and adds clearly labeled inventory and CRM records for walkthroughs. It does not print the password. Database service initialization only runs when the Postgres data volume is first created. If changing bootstrap credentials after initialization, either update database roles explicitly or remove the local volume with care.

Start API and web in separate terminals:

```powershell
pnpm dev:api
pnpm dev:web
```

- Web: [http://localhost:3000](http://localhost:3000)
- API readiness: [http://localhost:4000/api/v1/health](http://localhost:4000/api/v1/health)
- OpenAPI UI: [http://localhost:4000/api/docs](http://localhost:4000/api/docs)

The browser sign-in, registration, email verification, password-reset, company-switching and session-revocation flows use the NestJS API. `POST /api/v1/auth/register` creates the user, owner role, permissions, company, trial subscription, audit event and hashed email-verification token transactionally. Local development responses include a verification/reset link because no email provider is configured. `GET /api/v1/auth/me` returns only active memberships and their company details. `POST /api/v1/auth/active-company` verifies membership before storing the selected company on that browser session. `GET /api/v1/companies` and `POST /api/v1/companies` list and create workspaces for the signed-in user.

The private workspace is available at `/app` after successful sign-in. It provides the authenticated overview, company management, company settings, active-session review, role and permission administration, inventory operations and a CRM workspace. CRM supports customer/prospect management, opportunity pipeline stages, activity logging/completion, search and summary KPIs. Inventory supports item and warehouse create/edit/archive, search and pagination, goods receipts, inter-warehouse transfers with negative-stock protection, per-location balances and an append-only movement list. Business writes run in tenant-scoped transactions and create audit events.

## Dockerized application services

The API and web images are optional Compose services under the `app` profile. Start them after dependencies are installed and the database is migrated/seeded:

```powershell
docker compose --profile app up --build
```

Compose publishes local service ports on loopback. Put an HTTPS reverse proxy in front before exposing the web or API services outside the machine.

## Database and tenant isolation

Tenant-bound reads and writes must run inside `TenantContextService.run(userId, requestedCompanyId, callback)`. The database validates an active membership inside the same transaction before setting transaction-local PostgreSQL context. User-scoped membership lookup uses `withUserContext`. These settings are reset on commit/rollback and cannot leak to another pooled connection. Do not issue tenant queries through the root Prisma client without the context wrapper.

Company-owned tables have PostgreSQL RLS policies with `FORCE ROW LEVEL SECURITY`. With no tenant setting, the policies return no company rows. The Prisma migration connection must never be used by a running API process. SQL migration grants CRUD to `nexus_app` and the database uses separate credentials for runtime and schema changes.

## Commands

```powershell
pnpm typecheck
pnpm build
pnpm --filter @nexus/api test
pnpm --filter @nexus/api test:integration
```

The integration suite requires the database to be migrated and seeded. It checks that an active member sees only the selected company, an unscoped read fails closed and a non-member cannot establish a company context.

## Phase status and limitations

See [the roadmap](docs/implementation-roadmap.md) and [architecture decisions](docs/architecture-decisions.md). Phase 1 contains no sales, inventory, accounting, HR or billing workflows. The Tailwind/shadcn design system and charts remain deferred. NEXUS ERP is not production-ready, and no real payment provider is configured.

Phase 2 includes registration, company onboarding, email-verification and password-reset tokens, per-session active-company selection, company creation/listing and session review/revocation. Phase 3 includes tenant-scoped permission guards, custom roles, company membership role assignment and audited company profile updates; separate platform-operator workflows remain unimplemented. Email links are surfaced only in development; production email delivery, MFA enrollment/recovery and membership invitations remain incomplete. Inventory and the first CRM slice are operational modules. Sales documents, purchasing, accounting, HR, projects, reports, notifications, subscription management, public pricing/demo workflows and full localization remain planned. Do not deploy this application publicly until the remaining identity, authorization, module and security work is complete.
