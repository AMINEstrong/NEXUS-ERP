# NEXUS ERP implementation roadmap

## Phase 1 — foundation (implemented)

- pnpm workspace with separate Next.js web and NestJS API applications.
- PostgreSQL and Redis development services in Docker Compose.
- Prisma schema and initial migration for identity, companies, memberships, roles, permissions, subscriptions, plans and audit events.
- Separate non-superuser database roles for migrations and runtime; forced row-level security on tenant-owned tables.
- Database-scoped user and company context helpers, session login and health checks.
- Seed command for two Moroccan demo companies, an owner who belongs to both, company roles, permissions and trial subscriptions.
- README, implementation roadmap and architecture decisions.

The local Docker Desktop engine could not start in this environment. The project was instead migrated and tested against the already available PostgreSQL 17.11 service on port 5432. Redis is not running and is not currently required by the implemented workflows.

## Phase 2 — identity and company onboarding (implemented with remaining production work)

- Registration provisions a tenant, owner role, default permissions, trial subscription, audit event and hashed verification token transactionally.
- Email verification and password-reset tokens are hashed, one-time and time-limited. Password reset revokes active sessions.
- Local development responses provide verification/reset links while no mail provider is configured.
- Sign-in, registration, verification, password reset, company listing/creation/switching and session review/revocation screens call the API.
- Session-level company selection is checked against active membership; RLS context remains transaction-local.
- PostgreSQL integration tests exercise the account lifecycle and company switching.

Still required for production identity: verified email delivery, MFA enrollment/challenge/recovery and membership invitations.

## Phase 3 — authorization and platform administration (in progress)

Implemented:

- Per-route permission guards resolve grants only from the active company's role.
- Tenant-scoped APIs list permissions, create custom roles, replace custom-role grants, list memberships and assign company roles.
- The authenticated administration screen edits custom-role permissions and member assignments; system roles are protected.
- Company profile reads/updates use company permissions and write audit events.

Still needed: separate platform-operator identities and workflows, invitation lifecycle, and wider authorization coverage as new business modules are added.

## Phase 4 — public site and ERP shell (partial)

- The public home page and sign-in/registration routes are present.
- The authenticated shell has company switching, page search, theme selection, responsive navigation and account controls.
- Overview, company, security, administration and inventory screens use live API data.

Still needed: complete public Features, Modules, Pricing, Contact and Request-a-Demo flows, plus fuller navigation and accessibility review.

## Phase 5 — executive dashboard and company management (partial)

- Company membership management is available.
- Active-company profile settings include name, legal name, country, currency, language, time zone and fiscal-year start month. Updates are permission-checked and audited.
- The dashboard currently summarizes account and workspace state; business KPIs await the later transaction modules.

## Phase 6 — inventory and warehouses (implemented first operational slice)

- Tenant-scoped item and warehouse CRUD, with archive/reactivate operations that preserve the ledger.
- Search and pagination for items and warehouses.
- Goods receipts atomically increase stock and append receipt movements.
- Warehouse transfers atomically decrease/increase balances, append paired ledger movements, and reject insufficient source stock.
- Per-warehouse balances, low-stock counts, recent movement history and audit events.
- PostgreSQL integration coverage exercises receipts, transfers, duplicate SKU handling, insufficient-stock rollback, archive protection and cross-company isolation.

The inventory slice is not yet connected to sales deliveries, purchasing goods receipts, cost accounting or financial journal entries.

## Phase 7 — CRM and sales (CRM slice implemented; sales pending)

Implemented CRM slice:

- Tenant-scoped customer/prospect directory with edit, archive/reactivate and search.
- Sales opportunity pipeline with stages, estimated value, probability and company-local customer links.
- Call, email, meeting, task and note activities linked to customers/opportunities, with complete/reopen actions.
- CRM summary KPIs, role permissions, audit events, forced PostgreSQL RLS and composite tenant foreign keys.
- Seeded demonstration customer, prospect, opportunity and follow-up task for Atlas Manufacturing and Rif Commerce.
- PostgreSQL integration coverage for CRM lifecycle, stage changes, activity completion and company isolation.

Still needed: quotations, sales orders, fulfillment/delivery, customer invoices and payment allocations; CRM import/export and richer ownership/contact management.

## Phases 8–12 — remaining business capabilities

Still to implement with database, API, UI, permissions, audit and business tests:

- Purchasing requests, purchase orders, receipts and supplier invoices.
- Accounting and finance, including balanced double-entry journals and reconciliation.
- Human resources, payroll-related workflows and employee records.
- Projects and notifications.
- Reports and analytics using real operational data.
- Subscription management and verified payment-provider integration.

The first CRM slice above does not yet integrate with transactional sales or finance workflows.

## Phase 13 — localization

Complete English, French and Arabic catalogs, RTL layouts, locale-aware dates and numbers, currency settings and country-specific tax configuration. Tax rules remain data/configuration rather than hardcoded constants.

## Phase 14 — security and performance review

Run tenant-escape testing, load testing, logging-redaction and accessibility reviews, and database query/index tuning. Do not make legal-compliance claims without a verified review.

## Phase 15 — production operations

Configure production secrets, HTTPS ingress, email and payment provider credentials, backups and restoration drills, monitoring and staged release procedures. Real payment processing remains disabled until merchant and webhook verification are configured.

## Verification status

- [ ] `pnpm install --frozen-lockfile` (blocked by local pnpm-store symlink permissions; installed workspace dependencies are available).
- [ ] Docker Compose PostgreSQL and Redis health checks (Docker CLI is denied access to `npipe:////./pipe/dockerDesktopLinuxEngine`; local PostgreSQL on `127.0.0.1:5432` is used instead).
- [x] Prisma generation, additive migrations and seed against the separate migration/runtime PostgreSQL roles.
- [x] Existing demo owner and both seeded companies preserved.
- [x] CRM migration, demo records, API, UI and company-isolation integration test.
- [x] Root TypeScript checks pass.
- [x] API unit tests pass (8 tests).
- [x] PostgreSQL integration tests pass (6 tests across account lifecycle, inventory operations, CRM and tenant isolation).
- [x] API production build succeeds; Next.js development server serves authenticated inventory and CRM routes.

NEXUS ERP remains an in-progress application, not a production-ready ERP. The remaining phase work above must be completed before deployment to external users.
