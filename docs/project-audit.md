# NEXUS ERP project audit

Audit date: 2026-11-05  
Audited revision: `main` at `e0d7f9ad4ddbda50c4f78e0aff0269a876e1b591`  
Scope: repository tree, project documentation, workspace/package configuration, Prisma schema, existing API domain/controller/service structure, authenticated web shell and dashboard, and the available migration/test/infrastructure file inventory. This remote repository review does not execute the code; see verification limitations below.

## Findings

### Implemented and connected

- PNPM monorepo with a Next.js 16 / React 19 web app, NestJS 11 REST API, shared TypeScript package, Prisma 7/PostgreSQL and Docker Compose configuration.
- Identity foundation: opaque browser sessions, registration, login/logout, email verification and password-reset flows, company membership and switching, session listing/revocation. The browser's private layout validates the session against the API.
- Tenant isolation: database transaction context validates active membership and sets transaction-local RLS context. Existing architectural notes and schema/migration layout document forced RLS and tenant composite foreign keys.
- Company profile/settings and company role/permission/member administration.
- Inventory catalog, warehouses, stock balances, receipts, transfers and movement history, with API controllers, permission checks and audit events.
- CRM customers/prospects, opportunities and activities, with tenant-scoped APIs and audit events.
- Sales quotations, quote conversion to orders, inventory-backed deliveries, invoices, customer payments and balanced journal posting are represented in the existing sales service and Prisma model set.
- Existing web screens cover inventory, CRM, sales, companies, settings, roles and security. The authenticated dashboard route existed, but its view only displayed account/workspace status and did not request business KPIs.
- Seed configuration contains demo companies and records for identity, inventory, CRM and quotations. It seeds permissions for several future modules, which does not by itself mean those workflows exist.

### Partial or missing

- The original overview page was an account/workspace summary, not an executive dashboard. It had no period-comparison business KPIs, revenue chart or combined operational activity feed.
- Purchasing/suppliers, general expenses, employee/HR/payroll, reports/analytics, notifications and subscription billing workflows are not present in the inspected domain module tree/schema. Do not present these as live metrics or working navigation destinations.
- The roadmap describes the sales workflow as pending, but the inspected current revision already contains sales schema, service, controller, UI routes, and demo quotation data. The repository documentation is behind the code and should be reconciled in a dedicated roadmap update.
- The dashboard must respect module-level grants: possessing company access should not expose sales, inventory or CRM records to roles without the corresponding read grant.
- Production email delivery, MFA enrollment/challenges/recovery, invitations and production operations remain roadmap limitations.

### Broken or duplicated items observed in the audit

- No duplicate business domain module was identified in the repository tree. The dashboard route and dashboard view were not duplicates: the route simply rendered a generic account overview.
- No migration was changed or superseded as part of this dashboard work. Existing migration directories include foundation, identity/onboarding, inventory, CRM and sales migrations.
- No claim is made that all tests/builds pass: this GitHub-only audit has no workspace runtime, installed dependencies or database with which to execute them.

## Dashboard implementation batch

- Added `GET /api/v1/dashboard/summary`, scoped through the existing tenant transaction/RLS service and protected by authentication, permission guard and `company.read`.
- The summary checks active-role grants and only queries/returns each business area when the caller has `sales.read`, `inventory.read` or `crm.read`.
- Returned live metrics use existing records: current-month invoiced revenue and invoice count with previous-month comparisons, pending sales orders, open receivables, active CRM customers, active inventory products, stock-at-cost value and configured low-stock count.
- The six-month revenue series excludes void invoices. The recent activity feed combines invoices, inventory movements and CRM activities only for areas the caller can read.
- The dashboard client renders loading/error/empty states, responsive KPI cards, month trend visualization, latest activity and links to the existing sales/inventory/CRM screens. Unimplemented purchasing, supplier, finance-expense and HR statistics are deliberately not fabricated.

## Existing migrations, tests and deployment inventory

- Existing migrations in the repository tree: `20261104000000_foundation`, `20261105000000_identity_onboarding`, `20261106000000_inventory`, `20261106010000_crm`, and `20261106020000_sales`, plus `migration_lock.toml`.
- API test inventory includes auth service and health unit tests, plus lifecycle, CRM, inventory and tenant-isolation E2E test files. The root scripts expose workspace typecheck/build/test and database commands.
- Docker Compose, API/web Dockerfiles, PostgreSQL role bootstrap, and one GitHub Actions workflow are present.
- Test bodies, every migration SQL statement, all deployment settings, and CI execution results require runtime follow-up; they were not exhaustively validated in this remote audit.

## Verification and follow-up

Run in the project environment, with workspace dependencies installed:

1. `pnpm typecheck`
2. `pnpm --filter @nexus/api test`
3. `pnpm --filter @nexus/api test:integration` against the migrated/seeded PostgreSQL service
4. `pnpm build`
5. Add an integration test proving dashboard tenant isolation and permission-dependent metric visibility.
6. Reconcile `docs/implementation-roadmap.md` with the sales implementation already present in this revision.

Do not treat this audit or the dashboard batch as evidence that the whole ERP is production-ready.
