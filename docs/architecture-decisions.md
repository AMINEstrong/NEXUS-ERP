# Architecture decisions

## ADR 001 — separate web and API applications

**Status:** Accepted for Phase 1.

The browser experience lives in `apps/web` (Next.js); the versioned REST API lives in `apps/api` (NestJS). This keeps the future React Native client on the same API and gives business domains explicit backend module boundaries.

## ADR 002 — shared PostgreSQL database with forced row-level security

**Status:** Accepted for Phase 1.

Company data shares a PostgreSQL database and has a `company_id` tenant key. PostgreSQL policies use transaction-local `app.current_user_id` and `app.current_company_id` settings. Tenant queries set those settings and execute inside the same transaction. Row-level security is forced on every tenant-owned table. The runtime database role is a non-superuser, has no `BYPASSRLS`, and does not own the tables; application queries therefore cannot rely on the table-owner bypass.

Schema changes run using a distinct non-superuser migration role. That role owns created tables, but `FORCE ROW LEVEL SECURITY` still applies to it. A company owner is a normal tenant role; platform operator permissions are reserved for a separate later phase.

## ADR 003 — opaque, hashed browser sessions

**Status:** Accepted for Phase 1.

Successful sign-in creates a cryptographically random opaque cookie token. Only its SHA-256 hash is stored in PostgreSQL. The cookie is HttpOnly, SameSite=Lax and configurable as Secure, and the API supports revocation and a configured expiry. Active company selection is stored on the session only after the API verifies current membership. Email verification and password reset use one-time, hashed PostgreSQL tokens. MFA challenge/enrollment and production email delivery remain future work; the seeded demo email is marked verified.

## ADR 004 — accounting and country rules are data/configuration

**Status:** Accepted for future domain phases.

Financial values use PostgreSQL fixed precision decimals when finance entities are introduced. Tax rates and accounting rules are selected from company/country configuration, not constants embedded in code. External payment collection is not enabled in the foundation.

## ADR 005 — Prisma ORM 7 with PostgreSQL driver adapter

**Status:** Accepted for Phase 1.

Prisma ORM 7 places the CLI connection URL and seed command in `prisma.config.ts` and uses the PostgreSQL driver adapter at runtime. Migration CLI connections use `MIGRATION_DATABASE_URL`; API and seed operations use `DATABASE_URL` with the lower-privilege runtime role. The generated Prisma client is build output and is not committed.

## ADR 006 — company onboarding is one RLS-aware transaction

**Status:** Accepted for Phase 2.

Registration creates the user before provisioning the first company, then establishes `app.current_user_id` and a server-generated `app.current_company_id` inside the same database transaction before writing any tenant-owned rows. It creates the company, owner role and permission links, active membership, free-trial subscription and audit event atomically. The browser supplies company settings, but never supplies the new tenant identifier. Additional company creation follows the same transaction path and then updates the authenticated session's selected company.

Development returns a verification/reset URL for local testing because no outbound email provider is configured. Those URLs are never returned when `NODE_ENV=production`; production registration/recovery is incomplete until a verified email-delivery adapter is configured.

## ADR 007 — tenant-scoped inventory ledger

**Status:** Accepted for Phase 6.

Inventory items, warehouses, stock balances and movement records are tenant-owned PostgreSQL tables with forced row-level security. Composite `(id, company_id)` foreign keys prevent stock rows from associating an item or warehouse from another company. Quantities use fixed precision decimals. Receipts update a balance and append a movement in one tenant-scoped transaction. Transfers decrement the source only when its current quantity is sufficient, increment the destination and append paired movements inside the same transaction. Movement records have no update endpoint; archive actions preserve product, warehouse and ledger history.

## ADR 008 — CRM records are tenant-linked and auditable

**Status:** Accepted for Phase 7.

Customer/prospect, opportunity and activity rows carry the owning company ID and use forced row-level security. Opportunities link to customers through a composite `(customer_id, company_id)` foreign key; activities use the same pattern for customer and opportunity references. Opportunity values use fixed precision decimals. Status and pipeline changes use audited tenant-scoped transactions. This CRM directory and pipeline are the first Phase 7 slice and do not yet represent orders, invoices or accounting entries.
