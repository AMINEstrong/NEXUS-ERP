# NEXUS ERP — Task 2: Email Delivery Report

> **Phase:** Release hardening, Task 2 of `docs/PHASE-1-IMPLEMENTATION-REPORT.md`.
> **Status:** COMPLETE — implemented and verified.
> **Date:** 2026-11-10
> **Scope:** transactional e-mail for account verification and password reset, with a provider abstraction and EN/FR/AR/DE templates.

---

## 1. Summary

Task 2 replaces the previous "development URL only" flow with real transactional e-mail delivery. Registration, password-reset requests and a new resend-verification endpoint now render responsive HTML + plain-text messages through a provider-independent transport, store only SHA-256 token hashes, and log delivery metadata without tokens, links, full addresses or credentials.

- No database migration was required; the existing `EmailVerificationToken`, `PasswordResetToken` and `User.locale` columns are reused.
- Docker Compose and the deployment/TLS architecture were **not** modified (deferred to Task 3).
- Task 1 production validation is preserved and extended with e-mail requirements.

---

## 2. Architecture

```text
AuthController
  ├─ POST /auth/register               → AuthService.register()
  ├─ POST /auth/verification/resend    → AuthService.resendVerification()
  ├─ POST /auth/verify-email           → AuthService.verifyEmail()
  ├─ POST /auth/password-reset/request → AuthService.requestPasswordReset()
  └─ POST /auth/password-reset/confirm → AuthService.resetPassword()

AuthService
  ├─ generates randomBytes(32) tokens (base64url)
  ├─ persists only sha256(token)
  ├─ renders build*Email({ locale, … }) → subject/html/text
  └─ EmailService.send({ template, … })

EmailService (@Injectable)
  ├─ retries transient failures (EMAIL_MAX_ATTEMPTS)
  ├─ sanitizes/limits log output
  └─ delegates to EmailTransport (injected via EMAIL_TRANSPORT symbol)

EmailTransport (interface)
  ├─ LogEmailTransport       (development only, no network)
  ├─ SmtpEmailTransport      (nodemailer, STARTTLS/implicit TLS)
  ├─ ResendEmailTransport    (HTTPS API)
  └─ SendGridEmailTransport  (HTTPS API)
```

| File | Responsibility |
| --- | --- |
| `apps/api/src/email/email.templates.ts` | Locale normalisation, HTML escaping, layout, verification/reset templates for EN/FR/AR/DE. |
| `apps/api/src/email/email.transports.ts` | `EmailTransport` interface, `EmailDeliveryError`, log/SMTP/Resend/SendGrid transports and error classification. |
| `apps/api/src/email/email.service.ts` | Transport factory, retry loop, masked metadata logging. |
| `apps/api/src/email/email.module.ts` | Nest module wiring with the `EMAIL_TRANSPORT` provider. |
| `apps/api/src/auth/auth.service.ts` | Token generation/consumption and e-mail dispatch for register/reset/resend. |
| `apps/api/src/auth/auth.controller.ts` | Throttled endpoints, including the new resend route. |

### Extensibility

Adding Amazon SES or another provider means implementing `EmailTransport` (`name` + `send()`), adding an `EMAIL_PROVIDER` enum member, and a branch in `createTransport()`. Nothing in `AuthService` or the templates changes.

---

## 3. Environment variables

All values are validated at startup by `apps/api/src/config/env.ts`; the API refuses to boot with an invalid configuration.

| Variable | Default | Purpose |
| --- | --- | --- |
| `EMAIL_PROVIDER` | `log` | `log` \| `smtp` \| `resend` \| `sendgrid`. Production forbids `log`. |
| `EMAIL_FROM` | `NEXUS ERP <no-reply@nexus.local>` | Sender identity; must contain a valid address. Production rejects `.local`. |
| `EMAIL_REPLY_TO` | empty | Optional Reply-To header. |
| `EMAIL_API_KEY` | empty | Required for `resend` / `sendgrid`. Never sent to the browser. |
| `EMAIL_API_URL` | provider default | Optional API base URL override (self-hosted gateways/tests). |
| `EMAIL_TIMEOUT_MS` | `10000` | Per-delivery timeout (1000–60000 ms). |
| `EMAIL_MAX_ATTEMPTS` | `3` | Attempts for transient failures (1–5). |
| `SMTP_HOST` | empty | Required for `smtp`. |
| `SMTP_PORT` | `587` | SMTP port. |
| `SMTP_SECURE` | `false` | `true` for implicit TLS (typically 465). |
| `SMTP_REQUIRE_TLS` | `true` | Require STARTTLS upgrade (typically 587). |
| `SMTP_USER` | empty | SMTP username (required in production). |
| `SMTP_PASSWORD` | empty | SMTP password (required in production). |

Production validation additions:

- `EMAIL_PROVIDER` must not be `log`;
- `EMAIL_FROM` must use a real domain (no `.local`) and a valid address;
- `smtp` requires `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`;
- `resend`/`sendgrid` require an `EMAIL_API_KEY` of at least 8 characters;
- `EMAIL_REPLY_TO`, when set, must be a valid address;
- timeout and retry bounds are enforced.

`.env.example` documents every variable with development-safe placeholders and **no real credentials**.

---

## 4. Registration and verification workflow

1. `POST /auth/register` creates the user, company, owner role, trial subscription and a verification token in one transaction.
2. The raw token is `randomBytes(32).toString("base64url")`; only its SHA-256 hash is stored, with a 24-hour expiry.
3. The verification e-mail is rendered in the registration locale (`input.defaultLocale ?? company.defaultLocale`) and sent **after** the transaction commits.
4. If the provider fails, registration still succeeds (the account exists; the user can request a new link) and the failure is logged without provider details.
5. `POST /auth/verify-email` looks up an unused, unexpired hash, atomically marks it used (`updateMany` guarded by `usedAt: null` and `expiresAt > now`) and sets `emailVerifiedAt`. A second use fails with HTTP 400.
6. `POST /auth/verification/resend` (new, throttled to 3/min):
   - returns `{ "status": "if_account_exists" }` for unknown, deleted **and already verified** accounts;
   - for an unverified account, invalidates all outstanding unused tokens, issues a new 24-hour token and sends a new e-mail in `user.locale`.
7. `developmentVerificationUrl` is only included when `NODE_ENV !== "production"`.

Login remains blocked until `emailVerifiedAt` is set.

---

## 5. Password reset workflow

1. `POST /auth/password-reset/request` normalises the e-mail and looks up a non-deleted, verified user.
2. Unknown/unverified accounts receive the identical generic `{ "status": "if_account_exists" }` response; no token is generated and no mail is sent.
3. For a valid account: a 32-byte token is generated, only its SHA-256 hash is stored with a 30-minute expiry, and a reset e-mail is sent in `user.locale`.
4. Provider failure is logged and still returns the generic response — it cannot be used to discover account existence.
5. `POST /auth/password-reset/confirm` atomically consumes the token, updates the password hash, sets `passwordChangedAt`, revokes every active session and expires all remaining reset tokens. Reuse returns HTTP 400.
6. Both request and confirm endpoints are throttled to 5 requests/minute (existing behaviour preserved).
7. `developmentResetUrl` is only included when `NODE_ENV !== "production"`.

---

## 6. Localization

- Supported languages: **English, French, Arabic, German**.
- `normalizeEmailLocale()` maps stored values such as `fr-MA`, `ar_MA`, `de-DE` to their base language. Missing or unsupported values fall back to **English**.
- Locale selection:
  - registration → requested `defaultLocale`, else the company default;
  - resend verification and password reset → the persisted `User.locale` (schema default `"en"`).
- Each template provides a localised subject, responsive HTML (table layout, inline styles, hidden preview text, plain-text fallback link) and a plain-text alternative.
- Arabic renders `<html lang="ar" dir="rtl">`, right-aligned content and RTL button alignment, while token URLs are wrapped in `dir="ltr"` / `text-align:left` so links remain copyable.
- User-controlled values (name, company) are HTML-escaped before rendering.

No welcome e-mail was added: registration already sends the verification e-mail, and an extra message would add noise without changing the workflow.

---

## 7. Security measures

| Requirement | Implementation |
| --- | --- |
| No raw tokens at rest | Only `sha256(token)` is persisted, in the existing columns. |
| One-time use | Conditional `updateMany({ usedAt: null, expiresAt: { gt: now } })`; count must be `1`. |
| Expiry | Verification 24 h, reset 30 min, checked in both lookup and consumption. |
| Token/user binding | Tokens reference `userId`; the update targets the token's own `userId`. |
| Anti-enumeration | Registration conflict is the only explicit branch; reset and resend are always generic; provider errors never change the response. |
| No sensitive logs | `EmailService` logs only template, provider, masked recipient (`o***@example.test`), attempt, message id and provider status. Bodies, URLs and tokens are never logged. |
| SMTP error hygiene | Nodemailer errors are reduced to a status code (`ETIMEDOUT`, `EAUTH`, …); server response text is discarded because it can contain recipient data. |
| Credential exposure | SMTP/API credentials live only in the API environment; no endpoint returns them. |
| Production safety | `EMAIL_PROVIDER=log` and `.local` senders are rejected in production; HTTPS `WEB_ORIGIN` is enforced by Task 1 validation. |
| Retry safety | Only timeouts, connection failures, HTTP 429 and 5xx retry; 4xx/auth failures fail immediately. A rejected message is never reported as delivered. |
| Rate limiting | Resend 3/min; reset request/confirm 5/min; existing register/login/verify limits unchanged. |
| TLS links | Links derive from `WEB_ORIGIN`, which production validation requires to be HTTPS. |

---

## 8. Tests executed

All commands were run from the repository root on 2026-11-10.

| Command | Actual result |
| --- | --- |
| `pnpm --filter @nexus/api typecheck` | **PASS** (no output, exit 0) |
| `pnpm --filter @nexus/api test` | **PASS — 6 suites, 67 tests** |
| `pnpm --filter @nexus/api test:integration` | **PASS — 7 suites, 14 tests** |
| `pnpm --filter @nexus/api build` | **PASS** (`nest build`, exit 0) |
| Production e-mail config smoke (`validateEnv` against built output) | **PASS** — rejected `smtp` without `SMTP_HOST`, `log` in production and `resend` without `EMAIL_API_KEY` with explicit messages |

### Unit coverage added or updated

| File | Coverage |
| --- | --- |
| `src/email/email.templates.spec.ts` | All four languages, localised subjects/greetings, English fallback, Arabic RTL + LTR URLs, HTML escaping, reset templates. |
| `src/email/email.service.spec.ts` | Successful delivery, metadata-only logging, token/URL/full-address absence from logs, retry then success, retry exhaustion, permanent failure without retry, unexpected-error wrapping, `maskEmail`. |
| `src/email/email.transports.spec.ts` | Log transport (no network), Resend request shape/success, retryable 429/5xx, permanent 4xx, timeout classification, SendGrid payload, SMTP success, SMTP timeout classification without leaking server text, SMTP auth failure, unsupported provider. |
| `src/auth/auth.service.spec.ts` | Registration sends a localised verification e-mail; expired/invalid/reused verification tokens; generic reset for unknown accounts; localised reset e-mail with hashed token; provider failure still generic; expired/reused reset tokens; resend rotation + generic unknown/verified handling. |
| `src/config/env.spec.ts` | Production e-mail requirements: no `log`, SMTP host/user/password, hosted API key, `.local` rejection, malformed sender/reply-to, timeout/retry bounds, development defaults. |

### Integration coverage added

`test/email-auth.e2e-spec.ts` (new):

- expired verification token rejected (HTTP 400);
- resend rotates the token and sends a new link; old token remains invalid;
- successful verification, then token reuse rejected;
- invalid verification token rejected;
- generic resend responses for unknown and already verified accounts;
- generic reset request for unknown account;
- reset success, token reuse rejected, invalid token rejected, and login with the new password;
- rate limiting: resend `201, 201, 201, 429`; reset request `201 ×5, 429`.

`test/auth-lifecycle.e2e-spec.ts` continues to pass unchanged.

---

## 9. Remaining limitations

1. **Compose does not yet pass e-mail secrets.** `docker-compose.yml` was intentionally left untouched for Task 3; operators using Compose must add `EMAIL_*`/`SMTP_*` variables themselves until then.
2. **Delivery is best-effort.** A provider outage during registration does not fail the request; the user must use resend. Recovery depends on the provider, not on a persistent outbox.
3. **No bounce/complaint webhooks.** Provider delivery events are not ingested yet.
4. **No HTML visual regression tests.** Rendering is asserted structurally (RTL attributes, URLs, localised strings), not pixel-tested across clients.
5. **In-memory retry only.** Retries happen inside the request; a crashed process does not retry queued mail.
6. **In-memory rate limiting.** Existing throttler storage is per process; multi-instance deployments should move to shared storage (Redis) before horizontal scaling.
7. **Provider coverage.** SMTP, Resend and SendGrid are implemented and unit-tested against mocks; no live provider account was used in verification.
8. **Task 1 items remain.** TLS/reverse-proxy deployment and the Compose migration/web-URL fixes are still Task 3.

---

## 10. Rollback

All Task 2 changes are additive and require no migration. To roll back:

1. Set `EMAIL_PROVIDER=log` (development/test) — the API returns to the previous non-delivering behaviour.
2. Revert `apps/api/src/email/`, the auth wiring, and the spec files.

Existing verification/reset tokens remain valid and hashed; no data is lost.
