# NEXUS ERP — Phase 1 Implementation Report

> **Phase:** Release hardening (Phase 1 of `docs/NEXUS-ERP-FULL-AUDIT.md`).
> **Status:** IN PROGRESS — Tasks 1–2 complete and verified; Tasks 3–7 pending.
> **Started:** 2026-11-10
> **Baseline:** uncommitted working tree on top of `e0d7f9a Initial commit - NEXUS ERP`.

---

## 1. Progress summary

| Task | Scope | Status |
| --- | --- | --- |
| 1 | Production security (cookies, secrets, env validation, trusted proxy, HTTPS) | **COMPLETE** |
| 2 | Email delivery abstraction (verification, reset, templates, logging) | **COMPLETE** |
| 3 | Docker & deployment path | Pending |
| 4 | Dashboard effective-permission projection | Pending |
| 5 | Playwright E2E suite | Pending |
| 6 | Backup scripts, recovery docs, observability | Pending |
| 7 | Full verification (typecheck, tests, E2E, build, Compose smoke) | Pending |

---

## 2. Task 1 — Production security

### 2.1 Problems addressed

| Audit ID | Problem | Resolution |
| --- | --- | --- |
| AUTH-06 | Compose production profile defaulted `COOKIE_SECURE=false` | Compose now defaults to `true`, and the API refuses to boot in production when it is not `true` |
| AUTH-10 | Known development passwords usable in production; no fail-fast | Production startup now rejects `DATABASE_URL` values containing development password markers (`*_dev_only`, `changeme`, `password123`, `secret123`) |
| AUTH-07 | No trusted-proxy configuration | Added `TRUST_PROXY` env setting, applied to Express; disabled by default; no blind trust of `X-Forwarded-*` |
| AUTH-06 / AUTH-07 | HSTS not configured | HSTS enabled only in production (`max-age=1y`, `includeSubDomains`, `preload`) |
| — | Production could use a plain-HTTP `WEB_ORIGIN` | Production validation requires an `https://` origin |
| — | Cookie `Secure` depended only on config | `cookieOptions` now forces `Secure` whenever `NODE_ENV=production` (defence in depth) |

### 2.2 Files modified

| File | Change |
| --- | --- |
| `apps/api/src/config/env.ts` | **New.** Central Zod schema + `validateEnv()` with production hardening rules + `resolveTrustProxy()`. |
| `apps/api/src/config/env.spec.ts` | **New.** Unit tests for production validation and proxy resolution. |
| `apps/api/src/app.module.ts` | Replaced the inline schema with the shared `validateEnv` validator. |
| `apps/api/src/main.ts` | Reads config through `ConfigService`, applies trusted-proxy setting, disables HSTS in development and enables it with preload in production, uses configured origin/port. |
| `apps/api/src/auth/auth.controller.ts` | Session cookie is always `Secure` in production, independent of the env flag. |
| `docker-compose.yml` | `COOKIE_SECURE` defaults to `true`, `WEB_ORIGIN` is configurable, `TRUST_PROXY` added, production secret warning documented. |
| `.env.example` | Documents production requirements and `TRUST_PROXY`. |
| `README.md` | Corrected stale local ports (web 3001, API 4001, Swagger 4001). |
| `docs/USER-GUIDE.md` | **New.** French end-user and operator guide. |
| `docs/PHASE-1-IMPLEMENTATION-REPORT.md` | **New.** This report. |

### 2.3 Database changes

None. No schema, migration, data or credential change was made.

### 2.4 Security behaviour

Production startup now fails with a non-zero exit code and an explicit message if any of the following is true:

- `COOKIE_SECURE` is absent or not `"true"`;
- `WEB_ORIGIN` does not start with `https://`;
- `DATABASE_URL` contains a known development password marker.

Example verified output:

```text
Error: Invalid NEXUS environment configuration. The API will not start:
  - COOKIE_SECURE: COOKIE_SECURE must be "true" when NODE_ENV=production. Session cookies must not travel over plain HTTP.
  - WEB_ORIGIN: WEB_ORIGIN must use https:// when NODE_ENV=production.
  - DATABASE_URL: DATABASE_URL still references a known development password. Set a unique production secret instead of a *_dev_only value.
```

Process exit code: `1`.

Session cookie attributes remain `HttpOnly`, `SameSite=Lax`, `Path=/`; `Secure` is now guaranteed in production.

### 2.5 Tests executed

| Command | Result |
| --- | --- |
| `pnpm --filter @nexus/api typecheck` | **PASS** |
| `pnpm --filter @nexus/api test` | **PASS** — 3 suites, 17 tests (includes 7 new environment tests) |
| `pnpm --filter @nexus/api test:integration` | **PASS** — 6 suites, 9 tests |
| `pnpm --filter @nexus/api build` | **PASS** |
| Production fail-fast smoke (`NODE_ENV=production` + insecure env) | **PASS** — refused to start, exit code 1 |

### 2.6 Decisions

1. **Fail fast at startup rather than warn.** A production deployment must not run with insecure cookies or default credentials.
2. **Keep development working unchanged.** Development and test modes still accept local defaults; only `NODE_ENV=production` is strict.
3. **`TRUST_PROXY` defaults to `false`.** Trusting forwarding headers implicitly would allow IP spoofing and defeat rate limiting. Operators behind a proxy must set an explicit hop count, `true`, or an IP/subnet list.
4. **HSTS is production-only.** Sending HSTS on local HTTP development can create sticky browser state on `localhost`.
5. **Defence in depth for cookies.** Even if configuration validation were bypassed, the controller forces `Secure` in production.
6. **`WEB_ORIGIN` must be HTTPS in production.** TLS termination at a reverse proxy is fine; the browser-facing origin must still be HTTPS.
7. **Compose remains explicit.** The `app` profile intentionally fails until real secrets and an HTTPS origin are supplied; local development uses `pnpm dev` with `.env` and `NODE_ENV=development`.

### 2.7 Known limitations after Task 1

- TLS termination / reverse proxy is **not yet shipped**; Task 3 or a follow-up must provide it (audit AUTH-07 is only partially addressed: trust-proxy support is now available).
- Compose still runs no migrations and has the web port/API-URL defect; this is Task 3.
- `MIGRATION_DATABASE_URL` is only used by the Prisma CLI, so it is not validated at API startup.
- Existing deployments must rotate any credentials that were previously created from the development defaults.

### 2.8 Production configuration requirement (Task 1 scope)

```dotenv
NODE_ENV=production
WEB_ORIGIN=https://erp.example.ma
COOKIE_SECURE=true
TRUST_PROXY=1                 # or an explicit IP/subnet list
DATABASE_URL=postgresql://nexus_app:<unique-secret>@db:5432/nexus_erp?schema=public
SESSION_COOKIE_NAME=nexus.sid
SESSION_TTL_HOURS=12
```

---

## 3. Task 2 — Email delivery

Detailed report: `docs/TASK-2-EMAIL-REPORT.md`.

### 3.1 Problems addressed

| Audit ID | Problem | Resolution |
| --- | --- | --- |
| AUTH-08 | Registration/password reset produced only development URLs; no e-mail was delivered | Added a provider-independent `EmailService` and wired registration, resend verification and password reset |
| AUTH-09 | No resend-verification path | Added throttled `POST /auth/verification/resend` with token rotation and generic responses |
| — | No templating or localization | Responsive HTML + text templates in EN/FR/AR (RTL)/DE, selected from the stored locale with English fallback |
| — | Risk of leaking tokens/URLs/credentials in logs | Metadata-only logging with masked recipients; SMTP errors reduced to status codes |
| — | No startup validation for mail configuration | Extended production env validation (provider, sender domain, SMTP/API credentials, timeout/retry bounds) |

### 3.2 Files added or modified

| File | Change |
| --- | --- |
| `apps/api/src/email/email.templates.ts` | **New.** Locale normalisation, escaping, layout and verification/reset templates. |
| `apps/api/src/email/email.transports.ts` | **New.** Transport interface, delivery error type, log/SMTP/Resend/SendGrid transports. |
| `apps/api/src/email/email.service.ts` | **New.** Retry loop, transport factory, masked logging. |
| `apps/api/src/email/email.module.ts` | **New.** `EMAIL_TRANSPORT` provider wiring. |
| `apps/api/src/auth/auth.service.ts` | Sends verification/reset mail, generic resend workflow, locale selection. |
| `apps/api/src/auth/auth.controller.ts` | Added `POST /auth/verification/resend` (3/min). |
| `apps/api/src/auth/auth.module.ts` | Imports `EmailModule`. |
| `apps/api/src/auth/token.dto.ts` | Added `ResendVerificationDto`. |
| `apps/api/src/config/env.ts` | Added and validated all email/SMTP variables. |
| `apps/api/package.json` | Added `nodemailer` + types. |
| `.env.example` | Documented every e-mail/SMTP variable with safe placeholders. |
| `docs/TASK-2-EMAIL-REPORT.md` | **New.** Full Task 2 report. |

### 3.3 Database changes

None. Existing `EmailVerificationToken`, `PasswordResetToken` and `User.locale` fields are reused; no migration is required.

### 3.4 Tests executed

| Command | Result |
| --- | --- |
| `pnpm --filter @nexus/api typecheck` | **PASS** |
| `pnpm --filter @nexus/api test` | **PASS** — 6 suites, 67 tests |
| `pnpm --filter @nexus/api test:integration` | **PASS** — 7 suites, 14 tests |
| `pnpm --filter @nexus/api build` | **PASS** |
| Production e-mail config smoke | **PASS** — rejected `smtp` without `SMTP_HOST`, `log` in production and `resend` without `EMAIL_API_KEY` |

### 3.5 Known limitations after Task 2

- Compose does not yet forward e-mail secrets; that remains Task 3.
- Delivery is best-effort (no persistent outbox, no bounce webhooks).
- Throttler storage is per process; shared storage is needed before horizontal scaling.
- Provider integration is verified against mocks, not a live account.
- Task 1 items (TLS/reverse proxy, Compose migration/web URL fixes) remain Task 3.

---

## 4. Task 3 — Docker & deployment

_Pending._

---

## 5. Task 4 — Dashboard permission projection

_Pending._

---

## 6. Task 5 — Automated E2E tests

_Pending._

---

## 7. Task 6 — Backup & observability

_Pending._

---

## 8. Task 7 — Verification

_Pending._

---

## 9. Remaining blockers

- Production onboarding no longer depends on Task 2: e-mail delivery is implemented.
- Docker `app` profile still cannot serve the web app correctly until Task 3.
- Backups and observability remain absent until Task 6.
- No browser E2E coverage until Task 5.

## 10. Deployment instructions (Task 1 state only)

1. Provide the production environment variables listed in section 2.8 and the e-mail variables in `docs/TASK-2-EMAIL-REPORT.md` section 3 through the platform secret store.
2. Ensure the public origin terminates TLS and forwards to the API.
3. Set `TRUST_PROXY` to match the number of proxy hops or the proxy subnet.
4. Start the API and confirm it does not exit with an environment-validation error.
5. Confirm the session cookie returned by `POST /api/v1/auth/login` carries `Secure; HttpOnly; SameSite=Lax`.

Do not use the Compose `app` profile as a production deployment until Task 3 is complete.
