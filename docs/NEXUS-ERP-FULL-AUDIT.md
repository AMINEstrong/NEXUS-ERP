# NEXUS ERP — Full Technical and Business Audit

> **Status:** Read-only audit. No application code, schema, configuration, or data was changed.
> **Date:** 2026-11-08
> **Baseline:** `e0d7f9a Initial commit - NEXUS ERP` plus the uncommitted working tree present at audit time.
> **Deliverable:** This report only. No fixes have been started.

---

## 1. Executive summary

NEXUS ERP is a **well-built, narrow vertical slice**, not yet a complete ERP product.

The engineering foundation is materially stronger than a typical prototype:

- Clean pnpm monorepo: NestJS 11 API, Next.js 16.4.5 / React 19 web app, PostgreSQL 17, Prisma 7.
- Real database-backed multi-tenancy with forced PostgreSQL row-level security on business tables.
- Argon2id password hashing, hashed opaque session tokens, HTTP-only cookies, revocation, verification and reset tokens.
- A genuine multi-role RBAC model with effective-permission union, owner semantics, escalation guardrails and self-change protection.
- Real sales-to-cash slice: quotation → order → delivery → invoice → payment, with atomic stock movement and balanced double-entry journals for invoices and payments.
- Four-language UI (`en`, `fr`, `ar`, `de`), Arabic RTL, persisted locale, verified responsive behavior.
- Safe verification suite passes: typecheck, unit tests, integration tests and production build.

It is also **not production-ready** and **far from ERP-complete**:

- Production registration cannot complete because there is no email delivery adapter and login requires a verified email.
- The Docker Compose `app` profile is functionally broken: the web container listens on port 3001 while Compose maps 3000, no API URL is supplied to the web container, and migrations are not run.
- Production cookie and secret defaults are unsafe.
- MFA is schema-only; login deliberately rejects MFA-enabled users.
- The dashboard's permission projection uses only the legacy primary role, so multi-role users see fewer widgets and search groups than their effective permissions allow.
- Accounting is a side effect of sales, not a first-class ledger: no COGS posting, no fiscal close, no statements, no tax configuration, no multi-currency/FX.
- Purchasing, accounts payable, HR, projects, manufacturing, reporting/export and Moroccan statutory compliance are absent.
- There is no browser E2E suite, no lint/format gate, no backup/DR configuration and no structured observability.

### Overall health verdict

| Dimension | Assessment | Score (1–10) |
| --- | --- | --- |
| Engineering quality of implemented slice | Strong modular structure, validation, RLS, tests | **7.5** |
| Security posture of implemented slice | Good fundamentals, incomplete production hardening | **6.0** |
| Production readiness | Launch blockers remain | **3.5** |
| ERP functional completeness | Identity, RBAC, inventory, CRM and a sales slice only | **3.0** |
| Moroccan market readiness | Currency and languages present; compliance absent | **3.0** |
| Overall | Strong MVP foundation; not yet a sellable general ERP | **5.5 / 10** |

### Feature counts (68 audited capabilities)

| Result | Count | Meaning |
| --- | ---: | --- |
| **Working (PASS)** | **21** | Implemented end-to-end and verified by code review and/or tests |
| **Partial (PARTIAL)** | **25** | Works for the primary path but has material gaps |
| **Failed (FAIL)** | **5** | Implemented but broken, unsafe by default, or inconsistent |
| **Missing (NOT IMPLEMENTED)** | **17** | No implementation found |
| **Total** | **68** | See section 4 for the full matrix |

### Critical findings

1. **AUTH-01 — Production email delivery is absent.** Registration creates a verification token but never sends it. Production responses omit the development URL, and login rejects unverified users. Self-service onboarding is impossible in production.
2. **AUTH-06 — The production Compose profile defaults `COOKIE_SECURE=false`.** A production API can issue session cookies without the Secure flag.
3. **AUTH-10 — Development secrets are valid defaults.** Database and migrator passwords have known fallback values; there is no fail-fast on defaults.
4. **OPS-08 — The web container is misconfigured.** It listens on 3001, Compose maps 3000, and it has no `NEXT_PUBLIC_API_URL` or internal API URL.

No authentication bypass, SQL injection path, or cross-tenant read was demonstrated. Integration tests for tenant isolation and RBAC pass. The critical items above are production-readiness and hardening failures, not confirmed active exploits.

---

## 2. Scope, method and verification

### 2.1 What was inspected

- Repository structure, workspace configuration and package manifests.
- All API modules: auth, authorization, companies, CRM, dashboard, database, health, inventory, roles, sales.
- Prisma schema, all six migrations, RLS policies, constraints, indexes and grants.
- Web app shell, session context, dashboard, companies, CRM, inventory, roles, sales, security and settings views.
- i18n dictionaries, RTL helpers, locale persistence and date/number formatting.
- Dockerfiles, Compose profiles, PostgreSQL role bootstrap, GitHub Actions workflow, `.env.example`.
- Documentation: `docs/cahier-des-charges.md`, `docs/implementation-status.md`, `docs/architecture-decisions.md`, `docs/implementation-roadmap.md`.

### 2.2 Commands executed (safe, local, read-only with respect to source)

| Command | Result |
| --- | --- |
| `pnpm typecheck` | **PASS** — API, web and shared package all typecheck |
| `pnpm test` | **PASS** — API: 2 suites / 8 tests; web: 8 dictionary/RTL tests |
| `pnpm --filter @nexus/api test:integration` | **PASS** — 6 suites / 9 tests, including RBAC, dashboard, inventory, auth lifecycle, CRM and tenant isolation |
| `pnpm build` | **PASS** — Nest build and Next.js production build; 16 routes generated |
| `git status --short` | Confirmed all changes are uncommitted; no audit-time source edits |

### 2.3 Limitations

- This is a **code and configuration audit**, not a penetration test, load test or legal/compliance review.
- No dependency CVE scan, container scan, SAST or DAST was run.
- No production-like TLS/proxy environment was exercised.
- No automated browser E2E suite exists to execute; browser behavior was observed manually in prior verification.
- Some findings are risk statements about defaults and deployment paths, not demonstrated exploits.

### 2.4 Verified facts versus assumptions

**Verified by code/configuration/tests**

- Tenant RLS exists on companies, memberships, roles, role permissions, subscriptions, audit logs, inventory, CRM and all sales/accounting tables.
- `users`, `sessions`, `email_verification_tokens` and `password_reset_tokens` have **no RLS**; access relies on application-level `where userId` filters.
- Sessions are opaque random tokens; only SHA-256 hashes are stored.
- Login rejects unverified users and MFA-enabled users.
- Dashboard permission checks read `membership.roleId` only.
- Sales deliveries create `ISSUE` stock movements; invoices and payments create balanced journals.
- No COGS or inventory asset journal is posted on delivery.
- The web container's `start` script listens on 3001; Compose maps host 3000 to container 3000.
- No mail provider, no MFA implementation, no PDF generator, no background job runner, no backup configuration.

**Assumptions**

- A reverse proxy or managed platform may terminate TLS outside the repository. The report still flags that no such configuration is documented or shipped.
- The Docker `app` profile is intended as a deployable path. If it is only a local convenience profile, the severity of OPS-07/OPS-08 is reduced.
- The business target is Moroccan SMEs and mid-market companies. Competitive and localization recommendations assume that target.

---

## 3. Architecture

### 3.1 Stack

| Layer | Technology |
| --- | --- |
| Monorepo | pnpm 10.34.9, Node ≥ 22.18 |
| Web | Next.js 16.4.5, React 19.2.3, plain CSS, Turbopack |
| API | NestJS 11.2.8, Express, class-validator, class-transformer |
| Data | PostgreSQL 17, Prisma 7.10.1 with `@prisma/adapter-pg` |
| Auth | Argon2id, SHA-256 token hashes, HTTP-only cookie sessions |
| Config | Zod env validation, `.env` loading |
| API docs | Swagger, enabled only when `NODE_ENV !== "production"` |
| Runtime | Docker Compose with `api`, `web`, `postgres`, `redis` services |

### 3.2 Runtime topology

```
Browser
  │  HTTPS (not configured in repo)
  ▼
Next.js web :3001 (Compose maps 3000 — mismatch)
  │  server-side fetch of /auth/me with forwarded cookie
  ▼
NestJS API :4001 locally / :4000 in container
  │  Prisma driver adapter, DATABASE_URL = nexus_app role
  ▼
PostgreSQL 17
  ├─ RLS enforced with app.current_user_id / app.current_company_id
  ├─ nexus_migrator owns schema, runs migrations
  └─ nexus_app has DML only, NOBYPASSRLS
Redis :6379 — provisioned, currently unused by the API
```

### 3.3 API modules

`DatabaseModule`, `HealthModule`, `AuthModule`, `CompaniesModule`, `RolesModule`, `InventoryModule`, `CrmModule`, `SalesModule`, `DashboardModule`.

There is **no** purchasing, accounts payable, general ledger management, HR, projects, manufacturing, reporting or notification module.

### 3.4 Data model (33 models)

- Identity: `User`, `Session`, `EmailVerificationToken`, `PasswordResetToken`.
- Tenancy and access: `Company`, `Membership`, `Role`, `Permission`, `RolePermission`, `MembershipRole`, `AuditLog`.
- Commercial: `Plan`, `Subscription`.
- Inventory: `InventoryItem`, `Warehouse`, `StockBalance`, `InventoryMovement`.
- CRM: `CrmCustomer`, `CrmOpportunity`, `CrmActivity`.
- Sales and accounting: `DocumentSequence`, `AccountingAccount`, `JournalEntry`, `JournalLine`, `SalesQuotation`, `SalesQuotationLine`, `SalesOrder`, `SalesOrderLine`, `SalesDelivery`, `SalesDeliveryLine`, `SalesInvoice`, `SalesInvoiceLine`, `SalesPayment`.

### 3.5 Request lifecycle

1. `AuthGuard` resolves the session token hash, rejects expired/revoked sessions, updates `lastSeenAt`, and attaches `userId`, `sessionId`, `activeCompanyId`.
2. `PermissionGuard` resolves effective permissions from all roles plus the legacy primary role, caching them on the request.
3. The service opens `withTenantContext`, which sets `app.current_user_id`, verifies an active membership, sets `app.current_company_id`, then runs the business transaction.
4. RLS policies restrict every tenant table to the current company.

This is a sound design. The main costs are multiple short transactions and a session row write on every authenticated request (ARCH-05).

---

## 4. Feature inventory

Status definitions: **PASS** = implemented and verified; **PARTIAL** = usable primary path with material gaps; **FAIL** = implemented but broken, unsafe by default, or inconsistent; **NOT IMPLEMENTED** = no implementation found.

| # | Area | Feature | Status | Evidence / notes |
| ---: | --- | --- | --- | --- |
| 1 | Identity | Registration | PARTIAL | Creates user, company, roles, trial, token; no email delivery; enumeration |
| 2 | Identity | Sign-in / sign-out | PASS | Argon2id, hashed session cookie, logout revocation |
| 3 | Identity | Session listing / revocation | PASS | `/auth/sessions`, current-session revoke |
| 4 | Identity | Email verification | PARTIAL | Token lifecycle works; production cannot deliver token |
| 5 | Identity | Password reset | PARTIAL | Generic request response, token revoke sessions; no delivery |
| 6 | Identity | MFA | NOT IMPLEMENTED | Schema fields only; login blocks MFA users |
| 7 | Identity | Company switching | PASS | Session active company checked against membership |
| 8 | Identity | Company provisioning | PASS | Atomic company, owner role, permissions, subscription, audit |
| 9 | Identity | Membership invite / remove | NOT IMPLEMENTED | Only role assignment exists |
| 10 | Identity | Audit logging | PARTIAL | Key mutations audited; no read API or UI; not all actions |
| 11 | RBAC | Role CRUD | PASS | Custom roles, duplicate, system-role protection |
| 12 | RBAC | Multi-role effective permissions | PASS | Union of `membership_roles` plus legacy `roleId`; owner all tenant permissions |
| 13 | RBAC | Escalation / owner safeguards | PASS | Self-change blocked, last-owner guard, no over-grant |
| 14 | RBAC | Tenant RLS on business tables | PASS | ENABLE + FORCE policies, composite tenant FKs |
| 15 | RBAC | RLS on identity tables | FAIL | `users`, `sessions`, token tables are not RLS-protected |
| 16 | Security | CSRF protection | PARTIAL | SameSite=Lax only; no CSRF token or origin check |
| 17 | Security | Secret management | FAIL | Known dev defaults, no fail-fast, no secret store |
| 18 | Security | Security headers / rate limiting | PASS | Helmet, global 60/min, stricter auth limits |
| 19 | Dashboard | KPI cards | PARTIAL | Real tenant data; primary-role gating; mixed tax basis |
| 20 | Dashboard | Charts / series | PASS | Server-generated series, client-localized labels |
| 21 | Dashboard | Global search | PARTIAL | Five groups, primary-role gate, requires `reports.read` |
| 22 | Dashboard | Notifications | PARTIAL | Derived from live data; read state client-only |
| 23 | Dashboard | Permission-aware widgets | FAIL | Uses legacy primary role only |
| 24 | Dashboard | Time-zone-correct periods | FAIL | All periods and buckets computed in UTC |
| 25 | CRM | Customers / leads directory | PASS | CRUD, search, pagination, archive/reactivate |
| 26 | CRM | Opportunity pipeline | PASS | Stages, value, probability, customer link |
| 27 | CRM | Activities | PARTIAL | Create and complete; no edit/delete |
| 28 | CRM | Lifecycle / archive | PARTIAL | `isActive` toggle; no hard delete; UI coverage limited |
| 29 | Inventory | Items / warehouses CRUD | PASS | Archive protected when stock exists |
| 30 | Inventory | Goods receipts | PASS | Atomic balance + movement |
| 31 | Inventory | Transfers | PASS | Paired movements, insufficient-stock guard |
| 32 | Inventory | Adjustments | NOT IMPLEMENTED | Enum exists; no endpoint |
| 33 | Inventory | Stock counts | NOT IMPLEMENTED | No count/session workflow |
| 34 | Inventory | Valuation / costing / GL | PARTIAL | Current unit cost only; no COGS or valuation method |
| 35 | Sales | Quotations | PARTIAL | Create/send/convert; no line edit, revision, PDF, expiry job |
| 36 | Sales | Orders | PARTIAL | Created by conversion; no cancel endpoint |
| 37 | Sales | Deliveries | PASS | Atomic stock issue, partial delivery |
| 38 | Sales | Invoices | PARTIAL | Issue/pay; no void, credit note, PDF |
| 39 | Sales | Payments | PARTIAL | One invoice per payment; no allocation/refund |
| 40 | Sales | Credit notes / returns / void | NOT IMPLEMENTED | No endpoint or model |
| 41 | Finance | Double-entry journals | PARTIAL | Invoice and payment journals; no COGS/manual journals |
| 42 | Finance | Chart of accounts management | PARTIAL | Auto-seeded minimum; no UI/API management |
| 43 | Finance | Financial statements | NOT IMPLEMENTED | No trial balance, P&L or balance sheet |
| 44 | Finance | Moroccan VAT / tax | PARTIAL | Per-line rate and output tax posting; no TVA return or rules |
| 45 | Finance | Multi-currency / FX | PARTIAL | Currency codes stored; no rates or conversion |
| 46 | Procurement | Purchasing / AP | NOT IMPLEMENTED | No suppliers, POs, receipts or bills |
| 47 | Extended ERP | HR / payroll | NOT IMPLEMENTED | No employees, contracts, leave or payroll |
| 48 | Extended ERP | Projects | NOT IMPLEMENTED | No project or timesheet model |
| 49 | Extended ERP | Manufacturing | NOT IMPLEMENTED | No BOM, routing or production orders |
| 50 | Reporting | Reporting / export | NOT IMPLEMENTED | Dashboard only; no export/report builder |
| 51 | UI | Static i18n (EN/FR/AR/DE) | PASS | 1,049-line dictionaries; key and placeholder parity tests |
| 52 | UI | Dynamic error localization | PARTIAL | Static messages translated; server/class-validator text English |
| 53 | UI | RTL | PASS | Arabic direction, persisted, no horizontal overflow observed |
| 54 | UI | Responsive layout | PASS | Manual sweep verified core pages |
| 55 | UI | Error / loading / not-found boundaries | NOT IMPLEMENTED | No `error.tsx`, `loading.tsx`, `not-found.tsx` |
| 56 | UI | PDF / print | NOT IMPLEMENTED | No document generation |
| 57 | UI | Import / export | NOT IMPLEMENTED | No CSV/XLSX flows despite permissions |
| 58 | Platform | Plan / subscription enforcement | PARTIAL | Trial recorded; no limits or billing enforcement |
| 59 | Quality | API unit tests | PASS | 2 suites / 8 tests |
| 60 | Quality | API integration tests | PASS | 6 suites / 9 tests |
| 61 | Quality | Web unit tests | PARTIAL | Dictionary and RTL helper tests only |
| 62 | Quality | Browser E2E | NOT IMPLEMENTED | No Playwright/Cypress dependency or suite |
| 63 | DevOps | CI pipeline | PARTIAL | Build + API tests; no web tests, lint, E2E or scans |
| 64 | DevOps | Docker `app` profile | FAIL | Port mismatch, missing web API URL, no migrations |
| 65 | DevOps | Reverse proxy / TLS | NOT IMPLEMENTED | No proxy, TLS or trust-proxy configuration |
| 66 | DevOps | Backups / DR | NOT IMPLEMENTED | No backup, PITR or restore runbook |
| 67 | DevOps | Observability | PARTIAL | Nest default logs only; no metrics/tracing/request IDs |
| 68 | DevOps | Health checks | PARTIAL | Database only; Redis and dependencies unchecked |

**Totals: 21 PASS, 25 PARTIAL, 5 FAIL, 17 NOT IMPLEMENTED.**

---

## 5. Findings register

Severity reflects production risk and business impact, not only exploitability. Priority uses P0–P4 as defined in section 10.

### 5.1 Architecture

| ID | Severity | Status | Priority | Finding and technical explanation | Evidence | Recommended solution |
| --- | --- | --- | --- | --- | --- | --- |
| ARCH-01 | Low | FAIL | P4 | The `packages/shared` workspace exists but neither app consumes it. Its types and constants duplicate values already present in API/web code. | `packages/shared/src/index.ts`; only self-reference found for `@nexus/shared`. | Either adopt it for shared enums, locale constants and API contracts, or remove it to avoid a false abstraction. |
| ARCH-02 | Medium | PARTIAL | P3 | There is no generated or shared API contract. Web types and API DTOs are maintained independently, so field drift is likely as modules grow. | Dashboard `types.ts`, sales/inventory view-local types versus API DTOs; no OpenAPI client generation. | Generate a typed client from OpenAPI or publish shared DTO types; add contract tests. |
| ARCH-03 | Medium | NOT IMPLEMENTED | P2 | The App Router has no route-level `error.tsx`, `loading.tsx`, `not-found.tsx` or `global-error.tsx`. Runtime failures fall back to framework defaults. | `apps/web/src/app` contains none of these files. | Add route-group boundaries, consistent error UX, and localized messages. |
| ARCH-04 | Low | PARTIAL | P4 | Large monolithic client views and a 68 KB global stylesheet increase change risk and make reuse difficult. | `roles/view.tsx` ~37 KB, `dashboard/view.tsx` ~33 KB, `inventory/view.tsx` ~30 KB, `app.css` ~68 KB. | Extract primitives (table, dialog, form field, status pill) and split views by feature; consider CSS modules. |
| ARCH-05 | Medium | PARTIAL | P2 | Each permission-guarded request performs a session update, a permission transaction, and a service tenant transaction. `/auth/me` also loops per membership. This will amplify writes and latency. | `auth.service.ts` updates `lastSeenAt` per request; `permission.guard.ts` opens `tenants.run`; services open another tenant transaction. | Throttle `lastSeenAt` writes, cache effective permissions per session with invalidation, and reduce transaction count. |
| ARCH-06 | Medium | NOT IMPLEMENTED | P2 | There is no job runner, queue, scheduler or outbox. Email, reminders, recurring invoices, exports and retries must run inline or not at all. Redis is provisioned but unused. | No BullMQ/Agenda/scheduler dependency; `docker-compose.yml` defines Redis; no API Redis client. | Introduce a durable job queue and outbox for email, PDFs, reminders and integration retries. |
| ARCH-07 | Low | PARTIAL | P4 | Versioning is only the `/api/v1` prefix; there is no deprecation policy, compatibility contract or version negotiation. | `main.ts` global prefix. | Document versioning and deprecation rules before external API exposure. |
| ARCH-08 | Low | PARTIAL | P4 | The web client is a hand-written `fetch` wrapper with ad hoc response types. | `apps/web/src/lib/api.ts`. | Consolidate into a typed client with runtime validation for critical responses. |

### 5.2 Backend / API

| ID | Severity | Status | Priority | Finding and technical explanation | Evidence | Recommended solution |
| --- | --- | --- | --- | --- | --- | --- |
| API-01 | High | FAIL | P1 | Dashboard widget and search permissions use only `membership.roleId`. A user whose `crm.read` or `sales.read` comes from a secondary role is treated as lacking it, even though the API guard allows the request. | `dashboard.service.ts` lines 175, 271, 401, 514–529. | Resolve `resolveEffectiveAccess` once and use its permission set for all dashboard/search gating. Add a multi-role regression test. |
| API-02 | Medium | FAIL | P2 | The seeded permission catalog grants `purchasing.*`, `finance.*`, `hr.*`, `projects.*` and `reports.*`, but most of those modules have no API or UI. Admins can configure capabilities that do nothing. | `prisma/seed.ts` lines 46–56; module list in `app.module.ts`. | Generate permissions from implemented capabilities, or mark unimplemented modules as unavailable in role editing. |
| API-03 | High | NOT IMPLEMENTED | P2 | No supplier, purchase request, purchase order, goods receipt from supplier, supplier bill or AP payment endpoints. | `app.module.ts` has no purchasing module; no supplier models. | Add procurement and AP as a first-class module with RLS and approval limits. |
| API-04 | High | NOT IMPLEMENTED | P2 | No general-ledger management, trial balance, P&L, balance sheet, cash-flow, VAT return or report endpoints. | No accounting controller/service; only journal creation inside sales. | Add accounting read models and report endpoints over `journal_entries`/`journal_lines`. |
| API-05 | High | PARTIAL | P2 | Sales lifecycle is incomplete: no order cancellation, invoice void, credit note, return/RMA, quotation revision or line edits after creation, and no PDF. | `sales.controller.ts` endpoints; `SalesInvoiceStatus` includes `VOID` but no void route. | Add explicit state transitions with audit, reversal journals and credit-note documents. |
| API-06 | High | NOT IMPLEMENTED | P2 | `StockMovementType.ADJUSTMENT` exists, but there is no adjustment or stock-count endpoint. Shrinkage, damage and count corrections cannot be recorded. | `inventory.controller.ts` has receipts, transfers and movements only. | Add adjustment and count workflows with reason codes, approvals and immutable movements. |
| API-07 | Low | PARTIAL | P3 | CRM activities can be created and completed but not edited or deleted; customers/opportunities have no hard-delete path (archive only). | `crm.controller.ts`; `crm.dto.ts` activity DTOs. | Add activity edit/delete with audit and soft-delete semantics where legally allowed. |
| API-08 | High | NOT IMPLEMENTED | P1 | There is no membership invitation, acceptance, resend, suspension or removal endpoint. New users cannot be onboarded except by direct database work. | `roles.controller.ts` lists memberships and assigns roles; no invite/remove routes. | Add invitation lifecycle, email delivery, acceptance tokens and removal with last-owner protection. |
| API-09 | Medium | NOT IMPLEMENTED | P2 | Financial POSTs accept no idempotency key. A retried invoice/payment request can duplicate documents or payments. | `SalesController` POST routes; no `Idempotency-Key` handling. | Require idempotency keys for invoice, payment, delivery and journal-creating operations. |
| API-10 | Medium | NOT IMPLEMENTED | P3 | Mutable business documents have no version/ETag or optimistic concurrency control. Concurrent edits can overwrite each other. | No `version` column or `If-Match` handling in sales/CRM DTOs. | Add row versions and conditional updates for editable documents. |
| API-11 | Medium | PARTIAL | P3 | Global search covers only customers, products, invoices, orders and quotations; it requires `reports.read`, so sales or inventory users without reporting access cannot search their own data. | `dashboard.service.ts` search groups; `dashboard.controller.ts` guard. | Decouple search from `reports.read`; add permission-filtered groups for warehouses, payments, suppliers and activities. |
| API-12 | Medium | NOT IMPLEMENTED | P2 | No document/PDF/attachment endpoints. Invoices, quotations and deliveries cannot be rendered, downloaded or archived. | No PDF library, storage adapter or attachment model. | Add server-side PDF generation and object storage, with signed download URLs. |
| API-13 | Medium | NOT IMPLEMENTED | P3 | No bulk import/export endpoints for items, customers, opening balances or journals, despite `*.export` permissions. | No CSV/XLSX dependency or import/export routes. | Add validated, asynchronous import/export jobs with templates and error reports. |
| API-14 | Medium | PARTIAL | P1 | Throttling is IP-based with a single global 60/min policy and no `trust proxy` configuration. Behind a proxy all users may share one bucket, or limits may be bypassed. | `app.module.ts` throttler; `main.ts` has no `app.set("trust proxy", ...)`. | Configure trusted proxies, user/session-aware limits and separate limits for expensive endpoints. |
| API-15 | Low | PARTIAL | P2 | Health check verifies only `SELECT 1`. It does not check migrations, Redis, disk, mail or queue health. | `health.service.ts`. | Add readiness/liveness separation and dependency checks. |
| API-16 | Medium | PARTIAL | P3 | Dynamic exceptions and class-validator messages remain English. The i18n client can translate exact known strings, but interpolated messages and validation text are not covered. | `translateApiMessage` exact-key lookup; DTOs use English messages. | Return stable error codes plus params; translate on the client. |
| API-17 | Low | NOT IMPLEMENTED | P3 | No request/correlation IDs are generated or propagated, making production support and audit correlation difficult. | No middleware/interceptor for request IDs. | Add request IDs to logs, responses and audit metadata. |

### 5.3 Database and data integrity

| ID | Severity | Status | Priority | Finding and technical explanation | Evidence | Recommended solution |
| --- | --- | --- | --- | --- | --- | --- |
| DB-01 | High | FAIL | P1 | `users`, `sessions`, `email_verification_tokens` and `password_reset_tokens` are not RLS-protected. Isolation depends entirely on application `where userId` filters. A missed filter in a future endpoint could expose identity data across users/tenants. | Foundation and identity migrations enable RLS only on tenant/business tables; no policy for these four tables. | Add user-scoped RLS policies using `app.current_user_id`, or document and test compensating controls; add cross-user tests for every identity query. |
| DB-02 | Medium | PARTIAL | P2 | `journal_lines` enforces one-sided lines but no database constraint that total debits equal total credits per entry. Balance depends on application code. | Migration `20261106020000_sales` check `journal_lines_balanced_side_check` only. | Add a deferred constraint trigger or a posting service that validates and locks the entry total. |
| DB-03 | High | PARTIAL | P2 | Delivery reduces stock and records a movement at current unit cost, but posts no COGS or inventory-asset journal. Gross profit and inventory valuation are therefore not represented in accounting. | `sales.service.ts` lines 152–160; invoice journal lines 193–197 contain AR, revenue and tax only. | Post COGS and inventory relief at delivery using a defined valuation method; add reconciliation reports. |
| DB-04 | Medium | NOT IMPLEMENTED | P2 | There is no fiscal period, period lock or closing table. Backdated postings can change prior-period statements. | No period/close model in schema. | Add fiscal periods, posting-date validation and an audited close/reopen workflow. |
| DB-05 | Low | NOT IMPLEMENTED | P4 | No partitioning or retention policy for audit logs, inventory movements or journal lines. Growth will eventually degrade reporting. | Schema has indexes but no partition/retention design. | Define retention and archive/partition strategy; monitor table growth. |
| DB-06 | High | NOT IMPLEMENTED | P1 | No backup, PITR, restore test or disaster-recovery configuration is shipped. | No backup service, script, policy or runbook. | Enable managed PITR or `pg_basebackup`/WAL archiving; document and test restore RTO/RPO. |
| DB-07 | Medium | PARTIAL | P3 | Plans and subscriptions are recorded at registration but never enforced. User/company limits, module entitlements and billing status are decorative. | `auth.service.ts` creates a subscription; no plan checks in guards/services. | Enforce plan entitlements and seat/company limits in authorization and provisioning. |
| DB-08 | Low | PARTIAL | P3 | Audit logs are append-only by convention, not tamper-evident. There is no hash chain, signature or write-once storage. | `AuditLog` model; no integrity fields. | Add hash chaining or periodic signed exports for regulated customers. |
| DB-09 | High | NOT IMPLEMENTED | P3 | Multi-currency is limited to storing `currencyCode` on documents. There are no FX rates, base-currency conversion, revaluation or gain/loss postings. | `currencyCode` columns; no FX model or conversion logic. | Add exchange-rate tables, document base amounts, revaluation and FX gain/loss accounts. |
| DB-10 | High | NOT IMPLEMENTED | P2 | No tax configuration tables for jurisdictions, rates, exemptions or reporting. Tax is a free-form line percentage. | `taxRate` on sales lines; no tax model. | Add tax codes/jurisdictions, effective dates, exemption rules and Moroccan TVA reporting. |

### 5.4 Authentication and security

| ID | Severity | Status | Priority | Finding and technical explanation | Evidence | Recommended solution |
| --- | --- | --- | --- | --- | --- | --- |
| AUTH-01 | Critical | FAIL | P0 | Registration creates a verification token but no email is sent. In production the response omits the development URL, and login rejects unverified users. New customers cannot complete onboarding. | `auth.service.ts` lines 83–105 and 191; no mail dependency in `apps/api/package.json`. | Add a transactional email provider/template system, delivery retries, bounce handling and production smoke tests. |
| AUTH-02 | High | NOT IMPLEMENTED | P1 | MFA fields exist in the schema, but there is no enrollment, challenge, recovery-code or disable flow. Login explicitly rejects MFA-enabled users. | `auth.service.ts` line 192; no MFA module/routes. | Implement TOTP/WebAuthn enrollment, challenge, recovery codes and admin reset. |
| AUTH-03 | Medium | PARTIAL | P2 | Password policy is length-only (minimum 12). There is no complexity, breached-password, reuse or expiry policy. | `register.dto.ts`, `login.dto.ts`, reset DTOs. | Add breached-password checks, minimum entropy, reuse prevention and clear guidance. |
| AUTH-04 | Medium | FAIL | P2 | Registration returns a distinct conflict when an email exists, enabling account enumeration. Password reset correctly returns a generic response, which highlights the inconsistency. | `auth.service.ts` line 66; reset response lines 129–135. | Use a neutral registration response and email-based continuation, or add rate-limited verification. |
| AUTH-05 | Medium | PARTIAL | P2 | CSRF protection relies solely on `SameSite=Lax`. There is no CSRF token, double-submit cookie or strict Origin/Referer validation. | `auth.controller.ts` cookie options; no CSRF middleware. | Add CSRF tokens for state-changing requests or enforce strict Origin checks with tests. |
| AUTH-06 | Critical | FAIL | P0 | The Compose `api` service runs with `NODE_ENV=production` but defaults `COOKIE_SECURE=false`. A production deployment can send session cookies over plain HTTP. | `docker-compose.yml` app profile. | Default to secure cookies in production and fail startup when `NODE_ENV=production` and `COOKIE_SECURE!=true`. |
| AUTH-07 | High | NOT IMPLEMENTED | P1 | No TLS termination, reverse proxy, HSTS or trusted-proxy configuration is shipped. Compose binds to loopback, which mitigates local exposure, but there is no documented production edge. | No nginx/Traefik/Caddy config; `main.ts` has no `trust proxy`. | Ship a hardened edge configuration, force HTTPS, set HSTS and configure trusted proxies. |
| AUTH-08 | Low | NOT IMPLEMENTED | P3 | A signed-in user cannot change their password; they must use the reset flow and lose sessions. | No change-password endpoint; only reset. | Add authenticated password change with current-password verification and session rotation. |
| AUTH-09 | Low | NOT IMPLEMENTED | P3 | Sessions store no device, browser, IP or approximate location metadata. Users cannot recognize unfamiliar sessions. | `Session` model has timestamps only. | Capture user agent/IP at login and show them in session management. |
| AUTH-10 | Critical | FAIL | P0 | Known development passwords are valid defaults for Postgres, app and migrator roles. Startup does not reject defaults or missing production secrets. | `docker-compose.yml`; `.env.example`; `app.module.ts` env schema only requires `DATABASE_URL`. | Fail fast on default/short secrets in production; integrate a secret manager and rotate credentials. |
| AUTH-11 | Low | NOT IMPLEMENTED | P4 | There is no email-change flow or re-verification. | Auth routes contain no email update. | Add verified email change with notification to the old address. |

### 5.5 RBAC and authorization

| ID | Severity | Status | Priority | Finding and technical explanation | Evidence | Recommended solution |
| --- | --- | --- | --- | --- | --- | --- |
| RBAC-01 | — | PASS | — | Effective access is the union of active role links plus the legacy primary role. Owners receive every non-platform permission. The guard checks all required permissions. | `effective-permissions.ts`; `permission.guard.ts`; `rbac.e2e-spec.ts`. | Keep; add regression coverage for every new module. |
| RBAC-02 | Medium | PARTIAL | P3 | `memberships.role_id` and `membership_roles` are dual sources of truth. The service maintains consistency, but any future write path that bypasses it can drift. | `roles.service.ts` assignment methods update both. | Migrate primary-role semantics to a flag on `membership_roles` or enforce with a trigger. |
| RBAC-03 | Medium | NOT IMPLEMENTED | P3 | No separation of duties or approval limits. The same user can create, approve and pay a sales document if granted permissions. | No approval model or amount thresholds. | Add configurable approval matrices and segregation rules for invoice, payment and purchasing. |
| RBAC-04 | Medium | NOT IMPLEMENTED | P3 | Authorization is module/action-level only. There are no record-level (owner, team, branch) or field-level restrictions. | Permission keys only. | Add scoped roles and field policies where customer/territory confidentiality matters. |
| RBAC-05 | Medium | NOT IMPLEMENTED | P4 | There is no platform-operator identity or console. Tenant administration and platform administration are not separated. | ADR reserves platform permissions; no platform module. | Add a separate operator realm, console and audited impersonation policy. |
| RBAC-06 | Low | PARTIAL | P3 | The server layout verifies authentication only; page-level restrictions are enforced client-side. The API remains authoritative, but users can open restricted routes and see restricted empty states. | `app/layout.tsx`; `usePermissions` in views. | Add server-side permission checks or route guards for defense in depth. |
| RBAC-07 | Low | NOT IMPLEMENTED | P3 | Audit events are written but there is no audit-log read API or UI for administrators. | No audit controller/page. | Add a filterable, permission-gated audit viewer with export. |

### 5.6 Dashboard and analytics

| ID | Severity | Status | Priority | Finding and technical explanation | Evidence | Recommended solution |
| --- | --- | --- | --- | --- | --- | --- |
| DASH-01 | Medium | PARTIAL | P3 | KPI bases are inconsistent: revenue uses invoice subtotal excluding tax, while sales uses order total including tax. Users may compare unlike figures. | `dashboard.service.ts` sales metrics lines 532–548. | Define each KPI in a metric catalog and label tax basis explicitly. |
| DASH-02 | Medium | FAIL | P2 | All periods and buckets are computed in UTC. The company `timeZone` is returned as metadata but not used, so Moroccan day/week/month boundaries are shifted. | `startOfUtcDay`, `buildBuckets`, `timeZone: "UTC"` in dashboard service. | Compute periods in the company time zone using `Intl`/date library and test DST and midnight edges. |
| DASH-03 | Medium | PARTIAL | P2 | No net-profit, gross-margin, cash-flow or receivables-aging KPI. Expenses appear only when expense accounts exist, which is not the default. | `dashboard.service.ts` expense tracking note; KPI list. | Add AR aging, cash position, gross/net profit and configurable expense categories. |
| DASH-04 | Medium | PARTIAL | P2 | Profit metrics cannot be correct without COGS posting. Any future gross-profit card would overstate margin. | See DB-03. | Implement COGS first, then expose margin KPIs. |
| DASH-05 | Low | FAIL | P4 | The finance quick action is always shown because `finance` is special-cased true in the UI. | `dashboard/view.tsx` quick-action logic. | Gate it with `finance.read` or `reports.read` like other actions. |
| DASH-06 | Low | PARTIAL | P4 | Notification read state is stored client-side only, so it is lost across devices and users. | `notification readIds` in `app-shell.tsx`. | Persist read state per user/company. |
| DASH-07 | Medium | NOT IMPLEMENTED | P2 | No export, print or scheduled report delivery. | No export endpoints or PDF/CSV generation. | Add CSV/XLSX export and scheduled email reports after PDF infrastructure exists. |

### 5.7 UI, UX, i18n and RTL

| ID | Severity | Status | Priority | Finding and technical explanation | Evidence | Recommended solution |
| --- | --- | --- | --- | --- | --- | --- |
| UI-01 | Medium | PARTIAL | P3 | UI strings are translated, but dynamic server exceptions and class-validator messages are English. Translation depends on exact dictionary keys. | `api.ts` exact lookup; DTO messages. | Standardize error codes and localized message parameters. |
| UI-02 | Low | PARTIAL | P4 | `formatApiDate` hardcodes `en-GB` and UTC, ignoring the active language and company time zone. | `apps/web/src/lib/api.ts` line 52. | Use the i18n locale and company time zone, or route through the dashboard formatter. |
| UI-03 | Medium | PARTIAL | P3 | Many timestamps are rendered explicitly in UTC, including payments, movements and notifications. This is correct for date-only values but wrong for local business timestamps. | `sales/view.tsx`, `inventory/view.tsx`, `app-shell.tsx`, `dashboard/format.ts`. | Distinguish date-only from instant values; render instants in the company time zone. |
| UI-04 | Medium | NOT IMPLEMENTED | P2 | No route-level error, loading or not-found boundaries. Failures can produce generic framework screens. | Missing `error.tsx`, `loading.tsx`, `not-found.tsx`. | Add localized boundaries and skeleton/loading states. |
| UI-05 | Medium | PARTIAL | P3 | Accessibility has not been audited. There is no automated axe/Lighthouse check, focus-trap testing or screen-reader verification. | No a11y tooling or tests. | Add axe checks, keyboard tests and an accessibility acceptance checklist. |
| UI-06 | Low | NOT IMPLEMENTED | P4 | The public site lacks complete features, modules, pricing, contact and demo-request flows. | Public routes limited to landing, auth and password flows. | Complete the marketing funnel and legal pages before outbound sales. |
| UI-07 | Low | PARTIAL | P4 | Feedback is inline alert text; there is no global toast/notification pattern or optimistic update convention. | Views use local `error`/`notice` state. | Add a small feedback primitive and standardize mutation states. |
| UI-08 | — | PASS | — | Four-language dictionaries have key/placeholder parity; Arabic RTL, persistence and responsive layout were verified. | `apps/web/test`; locale dictionaries; prior browser sweep. | Keep dictionary parity tests in CI. |

### 5.8 ERP business logic and market scope

| ID | Severity | Status | Priority | Finding and technical explanation | Evidence | Recommended solution |
| --- | --- | --- | --- | --- | --- | --- |
| BIZ-01 | — | PASS | — | Sales-to-cash primary path is real: quote, convert, deliver with stock issue, invoice with journal, record payment with journal. | `sales.service.ts`; integration suites. | Keep and extend with the gaps below. |
| BIZ-02 | High | NOT IMPLEMENTED | P2 | No Moroccan statutory layer: CGNC chart mapping, TVA declaration, ICE/IF/RC/patente fields, CNSS/AMO payroll, DGI e-invoicing readiness. | Schema and UI contain none of these fields. | Build a Morocco localization pack with configurable legal identifiers and reports. |
| BIZ-03 | High | NOT IMPLEMENTED | P2 | No returns, credit notes, refunds or RMA. | No model or endpoint. | Add return authorization, credit note, stock receipt and reversal journal. |
| BIZ-04 | High | NOT IMPLEMENTED | P3 | No HR, leave, payroll or CNSS/AMO processing. | No HR models/modules. | Partner or build payroll after finance localization is stable. |
| BIZ-05 | Medium | NOT IMPLEMENTED | P4 | No projects, timesheets, project costing or billing. | No project models. | Add projects for services/construction segments after core finance. |
| BIZ-06 | Medium | NOT IMPLEMENTED | P4 | No manufacturing, BOM, routing or production orders. | No manufacturing models. | Defer unless targeting industrial SMEs; otherwise integrate with a specialist MES. |
| BIZ-07 | Medium | NOT IMPLEMENTED | P3 | No bank statement import, matching or reconciliation. | No bank model or import. | Add bank accounts, statement import and reconciliation. |
| BIZ-08 | Medium | NOT IMPLEMENTED | P3 | No recurring invoices, subscription billing or dunning. | `Plan`/`Subscription` exist but no billing engine. | Add schedules, retry policy and dunning templates. |
| BIZ-09 | Medium | NOT IMPLEMENTED | P3 | No approval workflows or spend/credit limits. | No approval model. | Add configurable approvals for quotes, invoices, payments and purchases. |
| BIZ-10 | Medium | PARTIAL | P3 | CRM has no lead-to-customer conversion, email sync, segmentation or forecast. | CRM models and endpoints are basic. | Add conversion, email integration and pipeline forecasting. |
| BIZ-11 | — | PASS | — | Document sequences are transactional and tenant-scoped. | `document_sequences`, `nextNumber`. | Keep; add gap-free legal numbering review for invoices. |
| BIZ-12 | Medium | PARTIAL | P2 | Tax is a per-line percentage with a single output-tax account. No rates, exemptions or jurisdiction logic. | `ensureAccounts`; line `taxRate`. | Replace with a tax-code engine and reporting. |

### 5.9 Testing, CI, infrastructure and operations

| ID | Severity | Status | Priority | Finding and technical explanation | Evidence | Recommended solution |
| --- | --- | --- | --- | --- | --- | --- |
| OPS-01 | — | PASS | — | API unit tests pass (2 suites / 8 tests). | `pnpm test`. | Expand coverage around money rounding, permissions and error paths. |
| OPS-02 | — | PASS | — | Integration tests pass (6 suites / 9 tests), including tenant isolation. Coverage is thin relative to the feature surface. | `pnpm --filter @nexus/api test:integration`. | Add tests per endpoint and state transition; target meaningful branch coverage. |
| OPS-03 | Low | PARTIAL | P3 | Web tests cover dictionaries and RTL helpers only; no component or interaction tests. | `apps/web/test/*.test.mjs`. | Add React Testing Library for forms, permission gating and error states. |
| OPS-04 | High | NOT IMPLEMENTED | P1 | No Playwright/Cypress browser suite. Critical flows are verified manually. | No E2E dependency or tests. | Add E2E smoke tests for onboarding, RBAC, sales-to-cash and language/RTL. |
| OPS-05 | Medium | PARTIAL | P1 | CI runs API tests, integration tests and build, but not web tests, lint, E2E, a11y or security scans. | `.github/workflows/phase1.yml`. | Add web tests, lint, E2E smoke, dependency audit and container scan. |
| OPS-06 | Medium | NOT IMPLEMENTED | P2 | No ESLint or Prettier configuration. Style and correctness checks depend on TypeScript alone. | No config files found. | Add lint/format gates and CI enforcement. |
| OPS-07 | High | FAIL | P0 | The `api` Compose service does not run `prisma migrate deploy`. A fresh deployment can start against an unmigrated database while the health check still passes. | `docker-compose.yml` app profile. | Add a migration job/init container and block API start until migrations succeed. |
| OPS-08 | Critical | FAIL | P0 | The `web` container listens on 3001, Compose maps 3000, and the container has no `NEXT_PUBLIC_API_URL` or internal API URL. Client and server API calls fail or target the user's localhost. | `apps/web/package.json` start script; `docker-compose.yml` web service; `web.Dockerfile`. | Align ports, pass build/runtime API URLs, and add a web health check. |
| OPS-09 | Medium | PARTIAL | P3 | Runtime images copy the entire repository, including dev dependencies and source. This increases size and attack surface. | `api.Dockerfile`, `web.Dockerfile` runtime stages. | Use multi-stage prod installs, copy only build output and production dependencies, run as non-root. |
| OPS-10 | Medium | NOT IMPLEMENTED | P2 | No structured logging, metrics, tracing or alerting. Logs are Nest defaults. | No logger/APM configuration. | Add JSON logs, request IDs, RED/USE metrics and error alerting. |
| OPS-11 | Medium | NOT IMPLEMENTED | P2 | No dependency, container or SAST scanning in CI. | Workflow has no scan steps. | Add `pnpm audit`, Trivy/Grype, CodeQL/Semgrep and secret scanning. |
| OPS-12 | Low | PARTIAL | P3 | `prisma migrate dev` fails with P3014 because the migrator role cannot create a shadow database. Developers must use `migrate deploy`. | Observed local behavior; role bootstrap grants no CREATEDB. | Document the workflow or provide a dedicated local shadow database. |
| OPS-13 | Medium | NOT IMPLEMENTED | P2 | No deployment, rollback, restore, secret-rotation or incident runbook. | No runbook document. | Write operational runbooks and rehearse them. |
| OPS-14 | Low | FAIL | P3 | Redis is provisioned and health-checked but unused by the API. This adds operational cost with no benefit. | Compose Redis service; no Redis client. | Use it for cache/queue or remove it from the deployment. |
| OPS-15 | Low | NOT IMPLEMENTED | P3 | No abuse monitoring for repeated failed logins, permission denials or rate-limit hits. | No metrics/alerts. | Emit security events and alert on thresholds. |

### 5.10 Documentation

| ID | Severity | Status | Priority | Finding and technical explanation | Evidence | Recommended solution |
| --- | --- | --- | --- | --- | --- | --- |
| DOC-01 | Low | PARTIAL | P3 | `docs/implementation-roadmap.md` still says sales are pending and inventory is not connected to deliveries, while the code now implements both. Other status text is stale relative to the dashboard and RBAC work. | Roadmap Phase 6/7 text versus `sales.service.ts`. | Update status docs and make them generated or reviewed per release. |
| DOC-02 | — | PASS | — | ADRs document the major architectural decisions and known gaps honestly. | `docs/architecture-decisions.md`. | Keep ADRs current as production hardening proceeds. |

---

## 6. Critical security findings — detail

### 6.1 AUTH-01 — Production onboarding is impossible

**Evidence chain**

1. `register()` creates an `emailVerificationToken` with a 24-hour expiry (`auth.service.ts` lines 83–89).
2. The raw token is only returned as `developmentVerificationUrl` when `NODE_ENV !== "production"` (lines 103–105).
3. No mail dependency exists in `apps/api/package.json`, and a repository-wide search for `nodemailer`, SMTP, SendGrid, Mailgun, Resend or `sendMail` returns no implementation.
4. `login()` rejects users without `emailVerifiedAt` (`auth.service.ts` line 191).

**Impact:** every self-registered production user is permanently locked out unless an operator manually reads the database token or marks the email verified. Password recovery is similarly unusable because reset links are never delivered.

**Fix:** add a transactional email adapter with templates for verification, reset, invitation, invoice and payment receipt; add retries, bounce handling and a production smoke test. Until then, do not claim self-service onboarding.

### 6.2 AUTH-06 and AUTH-10 — Unsafe production defaults

**Evidence**

- Compose `api` environment: `NODE_ENV: production`, `COOKIE_SECURE: ${COOKIE_SECURE:-false}`.
- Compose Postgres defaults: `bootstrap_dev_only`, `nexus_app_dev_only`, `nexus_migrator_dev_only`.
- Env schema accepts `COOKIE_SECURE=false` in production and has no secret-strength validation.

**Impact:** a deployment that forgets to override defaults issues non-Secure cookies and uses publicly known database credentials. Compose currently binds ports to `127.0.0.1`, which reduces external exposure, but the defaults are still unsafe for any real deployment.

**Fix:** fail startup in production when `COOKIE_SECURE!=true`, `DATABASE_URL` uses a default password, or `SESSION_COOKIE_NAME` is missing; require secrets from the platform secret store.

### 6.3 OPS-08 — Container deployment is broken

**Evidence**

- `apps/web/package.json`: `"start": "next start --hostname 0.0.0.0 --port 3001"`.
- `web.Dockerfile`: `EXPOSE 3000`.
- `docker-compose.yml`: `"127.0.0.1:${WEB_PORT:-3000}:3000"`.
- The `web` service has no environment variables; `NEXT_PUBLIC_API_URL` defaults to `http://localhost:4001/api/v1` in `lib/api.ts`.
- `apps/web/src/app/app/layout.tsx` fetches `${API_BASE_URL}/auth/me` server-side; inside the web container that resolves to the container's own localhost.

**Impact:** the web container is unreachable through the published port, the browser bundle points at the user's localhost, and server-side session loading fails. The `app` profile cannot serve a working application as written.

**Fix:** run the web server on the mapped port (or map 3001), pass `NEXT_PUBLIC_API_URL` at build time and an internal `API_URL` at runtime, add a web health check, and run migrations before API start.

### 6.4 DB-01 — Identity tables lack RLS

Tenant business data is well protected. Identity tables are not. This is a defense-in-depth gap, not a demonstrated breach: current queries consistently filter by user ID and session token hash, and tenant isolation tests pass. It becomes high-risk when future endpoints query users, sessions or tokens without a user filter.

**Fix:** add user-scoped RLS policies keyed on `app.current_user_id`, or document and test the compensating application controls. Add cross-user access tests for profile, sessions and token consumption.

### 6.5 What was not found

- No SQL injection path: Prisma parameterizes queries; the few raw statements use tagged template parameters.
- No cross-tenant read in reviewed paths; RLS and composite tenant foreign keys are present and tested.
- No direct authentication bypass; session tokens are random, hashed at rest, revocable and expiry-checked.
- No stored XSS path identified; React escapes rendered values and no `dangerouslySetInnerHTML` usage was found in reviewed pages.

This does not replace a penetration test.

---

## 7. Verified strengths (what is genuinely working)

1. **Tenant isolation design.** RLS is forced on tenant tables; the runtime role is `NOBYPASSRLS` and not the table owner; composite `(id, company_id)` foreign keys prevent cross-tenant references; integration tests exercise isolation.
2. **Authorization semantics.** Effective permissions are a true union of roles; owners cannot be locked out; escalation and self-change guards are explicit and tested.
3. **Session security.** Opaque random tokens, SHA-256 storage, HTTP-only cookies, revocation, password-reset session invalidation and per-route rate limits.
4. **Transactional business logic.** Deliveries lock orders, check stock, decrement balances and append movements atomically. Invoices and payments post balanced journals in the same transaction.
5. **Validation.** Global `ValidationPipe` with whitelist and `forbidNonWhitelisted`; DTO-level length, enum, UUID, money and quantity patterns.
6. **Database precision and constraints.** Money `DECIMAL(14,2)`, quantities `DECIMAL(16,3)`, non-negative stock, document total checks, one-sided journal lines, immutable movement ledger.
7. **Internationalization.** Four complete dictionaries with key/placeholder parity tests, Arabic RTL, persisted locale and localized number/date formatting.
8. **Honest documentation.** ADRs and status docs explicitly list missing production work rather than overclaiming.

---

## 8. Top architectural problems

1. **The production deployment path is not executable.** Compose port/env/migration gaps make the `app` profile non-functional.
2. **Identity's production loop is incomplete.** Email delivery and MFA are missing, blocking onboarding and enterprise security requirements.
3. **Accounting is a side effect, not a subsystem.** No COGS, fiscal periods, statements, tax engine or FX makes financial reporting unreliable.
4. **Authorization projection is inconsistent.** Backend guards use effective roles; dashboard/search use the legacy primary role.
5. **Identity tables rely on application filters only.** RLS covers business data but not users, sessions or tokens.
6. **No asynchronous processing layer.** Email, PDFs, reminders, exports and retries have no durable execution path.
7. **Request path does redundant work.** Session writes, permission resolution and service transactions multiply per request.
8. **No browser E2E or meaningful frontend tests.** Regressions in critical flows will be caught manually or in production.
9. **No operational safety net.** No backups, structured logs, metrics, tracing, alerting or runbooks.
10. **The product surface is a vertical slice, not an ERP suite.** Purchasing, AP, HR, projects, manufacturing, reporting and compliance are absent.

---

## 9. Competitive gap analysis

Comparison is directional, based on publicly known product capabilities and the audited codebase. It is not a feature-by-feature procurement scorecard.

### 9.1 Capability comparison

| Capability | SAP Business One | Oracle NetSuite | Odoo | NEXUS today | Gap |
| --- | --- | --- | --- | --- | --- |
| General ledger / financial statements | Strong | Strong | Strong | Journal posting only | **Critical** |
| Sales order-to-cash | Strong | Strong | Strong | Partial: no credit notes, void, PDF | **High** |
| Purchasing / accounts payable | Strong | Strong | Strong | None | **Critical** |
| Inventory / warehousing | Strong | Strong | Strong | Basic receipts, transfers, balances | **High** |
| Inventory valuation / costing | Strong | Strong | Strong | Unit cost only; no COGS | **High** |
| Manufacturing / MRP | Add-on / limited | Suite | Strong | None | **High** for industrial segment |
| CRM | Basic | Strong | Good | Basic customers, pipeline, activities | **Medium** |
| HR / payroll | Add-on | SuitePeople | Good | None | **High** for mid-market |
| Projects / timesheets | Basic | Strong | Good | None | **Medium** |
| Reporting / BI / exports | Strong | Strong | Strong | Dashboard only | **High** |
| Multi-currency / FX | Strong | Strong | Strong | Currency code only | **High** |
| Tax / statutory reporting | Strong | Strong | Strong | Line rate only | **High** |
| Morocco localization | Partner-dependent | Limited | Community modules | MAD, FR/AR, but no legal/tax layer | **Opportunity** |
| Deployment flexibility | On-prem/cloud | Cloud | On-prem/cloud | Docker, but profile broken | **Medium** |
| Extensibility / API | Strong | Strong | Strong | REST + dev Swagger; no webhooks/API keys | **Medium** |
| Ecosystem / marketplace | Strong | Strong | Very strong | None | **High** |
| UX / mobile | Dated | Modern | Modern | Modern responsive web; no mobile app | **Opportunity** |
| Price / TCO | High | High | Low | Could be low | **Opportunity** |

### 9.2 Where NEXUS can realistically win

- **Moroccan SME focus.** SAP B1 and NetSuite are expensive and partner-heavy; Odoo is capable but generic. A MAD-first, French/Arabic, CGNC-aligned product with local support is a credible wedge.
- **Modern UX.** The existing shell is cleaner and more responsive than SAP B1's classic client. Keep that advantage while adding depth.
- **Fast implementation.** A narrow, opinionated distribution/wholesale package can go live faster than a full suite.
- **Transparent pricing.** Per-company or per-module pricing with no mandatory heavy partner implementation is attractive to 10–100 employee firms.
- **Vertical templates.** Distribution, textile/apparel, agro-food, automotive suppliers and BTP subcontractors have repeatable workflows that a focused product can serve better than a generic suite.

### 9.3 Where NEXUS is not competitive yet

- Any prospect that needs purchasing, payables, statutory accounts, VAT returns, payroll or multi-currency will disqualify the product today.
- Any enterprise security review will flag missing MFA, email delivery, backups and CSRF hardening.
- Any multi-entity or multi-currency group will find the data model insufficient.
- Any company requiring audited financial statements cannot use the current accounting layer.

### 9.4 Morocco-specific opportunities

1. **CGNC-aligned accounting.** Map the chart of accounts to the Code Général de Normalisation Comptable and generate trial balance, P&L and balance sheet in the expected Moroccan format.
2. **TVA and statutory declarations.** Support 20%, 10%, 7% and 0% rates, exemptions, input/output tax accounts and periodic TVA returns.
3. **Legal identifiers.** Add ICE, IF, RC, patente and CNSS fields to company, customer and supplier records, and print them on documents.
4. **Arabic/French documents.** Generate bilingual, RTL-correct invoices and quotes with Moroccan legal mentions.
5. **DGI e-invoicing readiness.** Track the DGI electronic-invoicing pilot and design an adapter boundary now; do not hard-code a format that may change.
6. **MAD-first with FX.** Support EUR/USD import/export pricing with exchange rates, base-currency reporting and revaluation.
7. **Payroll localization.** CNSS, AMO and IR calculations for SMEs, or a clean integration with a local payroll provider.
8. **Bank and payment integrations.** CMI payment links, bank statement import and reconciliation for Attijariwafa, BOA/BMCE, CIH and Société Générale.
9. **Field sales and WhatsApp orders.** Mobile-friendly order capture and a WhatsApp/phone order inbox fit Moroccan distribution and retail behavior.
10. **Offline resilience.** Shops and warehouses with unstable connectivity need offline capture and conflict-aware sync.
11. **Sector templates.** Preconfigured item hierarchies, units, tax codes, document sequences and reports for target verticals.
12. **Local support and data residency.** French/Arabic onboarding, Moroccan business hours and clear data-location commitments.

---

## 10. P0–P4 classification

| Priority | Definition | Findings |
| --- | --- | --- |
| **P0** | Immediate launch blocker or unsafe production default | AUTH-01, AUTH-06, AUTH-10, OPS-07, OPS-08 |
| **P1** | Next sprint; high security, data-loss or operational risk | API-01, AUTH-02, AUTH-07, API-08, API-14, DB-01, DB-06, OPS-04, OPS-05 |
| **P2** | Next 1–2 quarters; required for a credible ERP | API-02, API-03, API-04, API-05, API-06, API-09, API-12, API-15, AUTH-03, AUTH-04, AUTH-05, DB-02, DB-03, DB-04, DB-10, DASH-02, DASH-03, DASH-04, DASH-07, UI-04, BIZ-02, BIZ-03, BIZ-12, OPS-06, OPS-10, OPS-11, OPS-13 |
| **P3** | Later; depth, scale and enterprise requirements | ARCH-02, ARCH-03, ARCH-05, ARCH-06, API-07, API-10, API-11, API-13, API-16, API-17, DB-05, DB-07, DB-08, DB-09, DASH-01, UI-01, UI-03, UI-05, RBAC-02, RBAC-03, RBAC-04, RBAC-06, RBAC-07, BIZ-04, BIZ-07, BIZ-08, BIZ-09, BIZ-10, OPS-03, OPS-09, OPS-12, OPS-14, OPS-15, DOC-01 |
| **P4** | Nice-to-have or long-horizon | ARCH-01, ARCH-04, ARCH-07, ARCH-08, AUTH-08, AUTH-09, AUTH-11, DASH-05, DASH-06, UI-02, UI-06, UI-07, BIZ-05, BIZ-06, RBAC-05 |

> Note: priority is about sequencing risk, not only severity. A High-severity item can be P2 if it does not block launch and has a viable manual workaround.

---

## 11. Top 10 fixes

1. **Fix the dashboard/search permission projection (API-01).** Use effective permissions everywhere; add a multi-role regression test.
2. **Implement production email delivery (AUTH-01).** Verification, reset and invitation emails with retries and templates.
3. **Harden the production Compose path (AUTH-06, AUTH-10, OPS-07, OPS-08).** Secure cookies, secret fail-fast, migration job, correct web port and API URLs.
4. **Add TLS/reverse-proxy and trusted-proxy configuration (AUTH-07, API-14).** Force HTTPS, HSTS, correct client IP handling.
5. **Protect identity tables (DB-01).** User-scoped RLS or tested compensating controls.
6. **Implement MFA and stronger password/CSRF controls (AUTH-02, AUTH-03, AUTH-05).** TOTP/WebAuthn, breached-password checks, CSRF tokens.
7. **Add browser E2E and CI gates (OPS-04, OPS-05, OPS-06).** Onboarding, RBAC, sales-to-cash, languages and RTL.
8. **Make accounting real (DB-02, DB-03, DB-04, DB-10, BIZ-12).** COGS posting, fiscal periods, tax codes, financial statements.
9. **Complete the sales lifecycle (API-05, BIZ-03).** Order cancel, invoice void, credit notes, returns and PDFs.
10. **Add inventory adjustments/valuation and purchasing/AP (API-03, API-06).** This unlocks the operational core of an ERP.

---

## 12. Eight-phase prioritized roadmap

Estimates are engineer-weeks (ew) for a small senior team, excluding sales/marketing. Add 20–30% contingency.

### Phase 1 — Release hardening and production readiness (P0/P1)

**Objective:** make the existing product deployable, observable and safe enough for controlled pilots.

**Tasks**
- Fix dashboard/search effective-permission projection.
- Add transactional email adapter and templates; verify registration/reset in a production-like environment.
- Secure production defaults: fail on `COOKIE_SECURE!=true`, default DB passwords and missing secrets.
- Fix Compose: migration job, web port, build-time `NEXT_PUBLIC_API_URL`, internal API URL, web health check.
- Add reverse proxy/TLS/HSTS and trusted-proxy configuration.
- Add request IDs, structured logs, error alerts and a health check that covers migrations and dependencies.
- Add backup/PITR and a tested restore runbook.
- Add Playwright smoke tests and run web tests/lint in CI.
- Update stale roadmap/status documentation.

**Dependencies:** none; this is the first phase.

**Deliverables:** hardened deployment bundle, email service, observability baseline, backup/restore proof, CI gates, green smoke suite.

**Acceptance criteria**
- A new user can register, receive an email, verify and sign in on a production-like deployment.
- Session cookies are `Secure`, `HttpOnly` and `SameSite=Lax`.
- A fresh deployment migrates automatically and serves the web app on the published port.
- Restore from backup is demonstrated within the agreed RTO/RPO.
- CI blocks merges on typecheck, lint, unit, integration and E2E smoke failures.

**Required tests:** production onboarding E2E; cookie flag assertion; Compose smoke; restore drill; secret-fail-fast test; permission regression test.

**Estimate:** 4–6 ew.

### Phase 2 — Identity, tenancy and access hardening (P1)

**Objective:** close the remaining security and onboarding gaps.

**Tasks**
- MFA enrollment/challenge/recovery and admin reset.
- Membership invitation, acceptance, resend, suspension and removal.
- Signed-in password change and email change with re-verification.
- Password policy: breached-password checks, reuse prevention, entropy guidance.
- CSRF tokens or strict Origin validation for state-changing requests.
- User-scoped RLS or documented compensating controls for identity tables.
- Session device/IP metadata and security event logging.
- Separation-of-duties design for approvals.

**Dependencies:** Phase 1 email and deployment foundation.

**Deliverables:** complete identity lifecycle, MFA, hardened session management, identity RLS decision and tests.

**Acceptance criteria**
- Invited users can join without database intervention.
- MFA can be enabled, challenged and recovered; disabling requires re-authentication.
- Cross-user identity access tests fail closed.
- CSRF and password-policy tests pass.

**Required tests:** invite/accept/remove E2E; MFA enrollment/challenge/recovery; cross-user identity isolation; CSRF; password policy; session metadata.

**Estimate:** 6–8 ew.

### Phase 3 — Accounting core and Moroccan compliance (P1/P2)

**Objective:** turn journal side effects into a trustworthy accounting subsystem.

**Tasks**
- Chart of accounts management mapped to CGNC.
- Fiscal periods, posting-date validation, close/reopen with audit.
- COGS and inventory relief at delivery using a defined valuation method.
- Tax codes, jurisdictions, exemptions and TVA reporting.
- Trial balance, P&L, balance sheet, cash-flow and AR aging.
- Legal identifiers (ICE, IF, RC, patente) on company/customer/supplier and documents.
- Invoice numbering compliance and gap analysis.
- DGI e-invoicing adapter boundary and readiness assessment.

**Dependencies:** Phase 1 deployment; Phase 2 identity for approvals; finance product decisions.

**Deliverables:** accounting module, statements, tax configuration, Morocco localization pack, reconciliation reports.

**Acceptance criteria**
- Every stock issue and invoice produces balanced, reconcilable GL entries.
- Trial balance balances for all seeded and test companies.
- Statements match independently calculated test fixtures.
- TVA report reconciles to posted tax lines.
- Legal identifiers appear on generated documents.

**Required tests:** journal balance property tests; COGS reconciliation; period-lock tests; statement fixtures; TVA fixtures; document-numbering tests.

**Estimate:** 14–20 ew.

### Phase 4 — Sales and receivables completion (P2)

**Objective:** make order-to-cash complete and customer-ready.

**Tasks**
- Quotation revisions, line editing, expiry automation and PDF.
- Order cancellation with stock/journal reversal rules.
- Invoice void, credit notes, returns/RMA and refunds.
- Payment allocation across invoices, partial payments and advance payments.
- Customer statements, dunning and collection follow-up.
- Invoice/quote/delivery PDF templates with bilingual/RTL support.

**Dependencies:** Phase 3 accounting and tax; Phase 1 PDF/email infrastructure.

**Deliverables:** complete sales document lifecycle, PDF templates, collections workflow.

**Acceptance criteria**
- A quote can be revised, converted, delivered, invoiced, credited and refunded without inconsistent balances.
- Reversals produce balanced journals and correct stock.
- PDFs render correctly in FR/AR and include legal identifiers.
- Statements reconcile to ledger balances.

**Required tests:** full lifecycle E2E; void/credit-note accounting; stock reversal; PDF snapshot; statement reconciliation.

**Estimate:** 8–12 ew.

### Phase 5 — Inventory depth and procurement (P2)

**Objective:** add the operational backbone most Moroccan SMEs need.

**Tasks**
- Stock adjustments and cycle counts with reason codes and approvals.
- Valuation methods (weighted average, FIFO) and valuation reports.
- Reorder points, purchase suggestions and supplier management.
- Purchase requests, purchase orders, goods receipts and supplier bills.
- AP aging, supplier payments and payment scheduling.
- Landed costs and purchase price variance.

**Dependencies:** Phase 3 accounting; Phase 4 document infrastructure.

**Deliverables:** inventory depth, procurement module, AP subledger and reports.

**Acceptance criteria**
- Adjustments and counts update stock and GL consistently.
- Valuation reports reconcile to inventory accounts.
- A purchase order can be received, billed and paid with balanced journals.
- AP aging matches supplier balances.

**Required tests:** adjustment/count tests; valuation fixtures; PO-to-bill E2E; AP reconciliation; RLS isolation.

**Estimate:** 12–16 ew.

### Phase 6 — CRM depth, reporting and analytics (P3)

**Objective:** make the data actionable and exportable.

**Tasks**
- Lead-to-customer conversion, activity edit/delete, ownership and teams.
- Email integration and activity capture.
- Pipeline forecasting and win/loss analysis.
- Dashboard drill-down, cash-flow and margin KPIs with correct time zones.
- Report builder, CSV/XLSX export and scheduled email reports.
- Audit-log viewer and operational dashboards.

**Dependencies:** Phases 3–5 data models; Phase 1 jobs/email.

**Deliverables:** richer CRM, reporting module, export/scheduling, audit UI.

**Acceptance criteria**
- Reports match source data and respect permissions.
- Exports are reproducible and audited.
- Time-zone boundaries are correct for Africa/Casablanca.
- Audit events are searchable and exportable.

**Required tests:** report fixtures; time-zone edge cases; export integrity; permission-filtered report tests.

**Estimate:** 8–10 ew.

### Phase 7 — HR, projects and extended ERP (P3/P4)

**Objective:** expand into adjacent mid-market needs without destabilizing the core.

**Tasks**
- Employee records, contracts, leave and timesheets.
- Moroccan payroll (CNSS, AMO, IR) or a certified payroll integration.
- Projects, budgets, timesheet costing and project billing.
- Asset register and depreciation.
- Optional manufacturing/BOM only if the target segment validates it.

**Dependencies:** Phase 3 accounting and Phase 5 procurement; payroll/legal expertise.

**Deliverables:** HR/projects modules, payroll integration, asset accounting.

**Acceptance criteria**
- Payroll produces auditable payslips and statutory declarations.
- Project costs reconcile to GL and billing.
- Asset depreciation posts correctly.

**Required tests:** payroll fixtures; project costing; depreciation schedules; permission and tenant tests.

**Estimate:** 20–30 ew.

### Phase 8 — Scale, platform and ecosystem (P4)

**Objective:** support growth, integrations and a partner ecosystem.

**Tasks**
- Durable job queue/outbox, Redis usage, retries and dead-letter handling.
- Multi-currency/FX, revaluation and consolidation.
- Bank statement import and reconciliation.
- API keys, webhooks, rate tiers and public API documentation.
- Mobile/offline field-sales capability.
- Platform operator console, tenant lifecycle and usage metering.
- Performance/load testing, caching, DR drills and cost optimization.

**Dependencies:** stable core from Phases 1–7; product and partnership strategy.

**Deliverables:** integration platform, multi-currency, mobile/offline, operator console, scale evidence.

**Acceptance criteria**
- Documented SLOs are met under load.
- Webhooks are signed, retried and observable.
- FX revaluation reconciles.
- DR drill meets RTO/RPO.

**Required tests:** load tests; webhook signature/retry tests; FX fixtures; failover drills; security review.

**Estimate:** 12–18 ew.

### Roadmap summary

| Phase | Theme | Priority | Estimate | Key dependency |
| --- | --- | --- | ---: | --- |
| 1 | Release hardening | P0/P1 | 4–6 ew | None |
| 2 | Identity/access hardening | P1 | 6–8 ew | Phase 1 |
| 3 | Accounting/Morocco | P1/P2 | 14–20 ew | Phases 1–2 |
| 4 | Sales/receivables completion | P2 | 8–12 ew | Phase 3 |
| 5 | Inventory/procurement | P2 | 12–16 ew | Phases 3–4 |
| 6 | CRM/reporting | P3 | 8–10 ew | Phases 3–5 |
| 7 | HR/projects/extended ERP | P3/P4 | 20–30 ew | Phases 3–5 |
| 8 | Scale/ecosystem | P4 | 12–18 ew | Phases 1–7 |

---

## 13. Complexity and effort estimate

| Scope | Engineer-weeks | Calendar with 2 senior engineers | Notes |
| --- | ---: | --- | --- |
| **P0 + P1 only** (Phases 1–2) | **10–14 ew** | **~6–8 weeks** | Production-safe pilot for the current feature set |
| **Credible Moroccan SME ERP** (Phases 1–5) | **44–62 ew** | **~6–8 months** | Identity, accounting, sales, inventory, purchasing |
| **Full eight-phase roadmap** | **84–120 ew** | **~12–18 months** | Excludes sales, marketing, support and partner network |
| **With 20–30% contingency** | **101–156 ew** | **~15–22 months** | Recommended planning range |

**Cost drivers**

- Accounting and Moroccan compliance are the largest and least forgiving workstreams.
- Procurement and AP roughly double the operational surface.
- Payroll localization carries legal and testing risk; a partner integration may be cheaper.
- Each new module requires RLS, permissions, audit, UI, i18n, tests and documentation, not only CRUD.
- E2E, backup/DR, observability and security hardening are ongoing costs, not one-off tasks.

---

## 14. Recommended next phase

**Start with Phase 1 — Release hardening — immediately, before any net-new ERP module.**

Rationale:

1. The current product cannot complete production onboarding or deploy correctly through its own Compose profile.
2. Unsafe cookie and secret defaults create avoidable security risk.
3. Without backups, observability and E2E tests, every new module increases the blast radius.
4. The dashboard permission bug is small but undermines trust in RBAC, which is currently the strongest part of the product.
5. Phase 1 is short (4–6 engineer-weeks) and unlocks a credible pilot.

After Phase 1, run **Phase 2 (identity hardening)** and **Phase 3 (accounting/Morocco)** as the next strategic block. Do not start purchasing or HR before accounting is trustworthy; otherwise those modules will post into an incomplete ledger and require rework.

If commercial pressure requires a demo sooner, limit the pilot to a design-partner program with manual email verification and a documented support process. Do not present the product as self-service or ERP-complete until Phase 3 lands.

---

## 15. Assumptions and open questions

1. **Deployment target:** Is the Compose `app` profile the intended production path, or will a managed platform/reverse proxy own TLS and migrations? This changes the severity of OPS-07/OPS-08/AUTH-07.
2. **Business segment:** Is the primary target micro/SME distribution, or mid-market multi-entity? The roadmap weighting changes significantly.
3. **Accounting standard:** Confirm CGNC as the required chart and reporting framework, and whether consolidated/IFRS reporting is needed.
4. **Payroll:** Build, partner, or defer? Payroll is high-risk and may not be the best first differentiator.
5. **E-invoicing:** Confirm the DGI timeline and technical format before committing to an adapter design.
6. **Email provider:** Which provider and data-residency constraints apply?
7. **Support model:** Is there a partner network for implementation, or will NEXUS provide direct onboarding?
8. **Compliance:** Are there customer requirements for SOC 2, ISO 27001, data residency or audit-log immutability?

---

## 16. Approval requested

This audit is complete and **no fixes have been started**.

Requested decisions:

1. Approve the findings and priority classification.
2. Confirm the deployment target and business segment assumptions.
3. Approve Phase 1 (release hardening) as the next workstream.
4. Confirm whether Phase 2 (identity hardening) and Phase 3 (accounting/Morocco) should run sequentially or with limited parallelism.
5. Confirm whether payroll and manufacturing are in scope for the next 12 months.

Upon approval, implementation can begin with the P0 items: production email delivery, safe production defaults, Compose correction and migration automation, followed by the dashboard permission fix and E2E smoke coverage.

---

## Appendix A — Key file map

| Area | Files |
| --- | --- |
| API bootstrap | `apps/api/src/main.ts`, `apps/api/src/app.module.ts` |
| Auth | `apps/api/src/auth/auth.service.ts`, `auth.controller.ts`, `auth.guard.ts` |
| Authorization | `apps/api/src/authorization/permission.guard.ts`, `effective-permissions.ts` |
| Tenancy | `apps/api/src/database/prisma.service.ts`, `tenant-context.service.ts` |
| Roles | `apps/api/src/roles/roles.service.ts`, `roles.controller.ts`, `role.dto.ts` |
| Dashboard | `apps/api/src/dashboard/dashboard.service.ts`, `dashboard.controller.ts` |
| Inventory | `apps/api/src/inventory/inventory.service.ts`, `inventory.controller.ts` |
| CRM | `apps/api/src/crm/crm.service.ts`, `crm.controller.ts` |
| Sales | `apps/api/src/sales/sales.service.ts`, `sales.controller.ts` |
| Schema | `apps/api/prisma/schema.prisma` |
| Migrations | `apps/api/prisma/migrations/20261104000000_foundation`, `20261105000000_identity_onboarding`, `20261106000000_inventory`, `20261106010000_crm`, `20261106020000_sales`, `20261106030000_rbac_multi_role_locale` |
| Web shell | `apps/web/src/app/app/app-shell.tsx`, `session-context.tsx`, `layout.tsx` |
| Web views | `apps/web/src/app/app/dashboard/view.tsx`, `inventory/view.tsx`, `sales/view.tsx`, `crm/view.tsx`, `roles/view.tsx`, `views.tsx` |
| i18n | `apps/web/src/lib/i18n.tsx`, `i18n-core.mjs`, `locales/en.json`, `fr.json`, `ar.json`, `de.json` |
| Docker | `docker-compose.yml`, `infra/docker/api.Dockerfile`, `web.Dockerfile`, `infra/docker/postgres/01-create-roles.sh` |
| CI | `.github/workflows/phase1.yml` |
| Docs | `docs/architecture-decisions.md`, `docs/implementation-roadmap.md`, `docs/implementation-status.md`, `docs/cahier-des-charges.md` |

## Appendix B — Verification output summary

| Check | Result | Counts |
| --- | --- | --- |
| Typecheck | PASS | 3 workspace projects |
| API unit tests | PASS | 2 suites, 8 tests |
| Web unit tests | PASS | 8 tests |
| API integration tests | PASS | 6 suites, 9 tests |
| Production build | PASS | API build + 16 Next.js routes |

**Final note:** the verification suite passing does not contradict the findings above. The tests confirm the implemented paths; they do not cover production email delivery, container deployment, MFA, backups, accounting completeness or the multi-role dashboard projection.
