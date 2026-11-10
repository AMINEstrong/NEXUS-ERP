# NEXUS ERP implementation status

Last updated: 2026-11-08

## Scope of this pass

This pass completed the executive dashboard and corrected the integration issues found while
connecting it to the existing modules. The architecture, authentication, authorization and
tenant-isolation model were preserved; no working feature was removed and no mock data was added.

- Web application: `http://localhost:3001`
- API: `http://localhost:4001/api/v1`
- Health check: `http://localhost:4001/api/v1/health`

## Completed

### Executive dashboard

- [x] Collapsible desktop sidebar with persisted collapsed/expanded state.
- [x] Mobile drawer navigation, backdrop and keyboard-accessible controls.
- [x] Top navigation with company selector, global search, notification center, theme toggle and
      profile menu.
- [x] Breadcrumbs generated from the active route.
- [x] Responsive layout and light/dark themes using the existing `erp-frame` design tokens.
- [x] Reporting period filters: last 7/30/90 days, 6 months, 12 months and year to date.
- [x] Permission-aware rendering: sections only render when the active role can read the module.
- [x] Loading skeletons, refresh state, empty states and retryable error state.
- [x] KPI cards for revenue, sales volume, orders, pending orders, outstanding invoices,
      customers, products, stock value, low stock and expenses.
- [x] Previous-period comparisons for revenue, sales volume, orders and customers.
- [x] Charts: revenue over time, sales performance (invoiced vs. collected), orders by status,
      monthly expenses, top products, inventory distribution by warehouse and customer growth.
- [x] Widgets: recent sales, recent orders, pending invoices, low-stock alerts, recent customers,
      upcoming CRM follow-ups, notifications and permission-filtered quick actions.
- [x] Global search over customers/prospects, inventory items, quotations, orders and invoices.
- [x] Notification center with unread count, severity styling, mark-one/mark-all read and
      per-company browser storage.
- [x] Expenses shown as "Not configured" instead of a synthetic zero when expense accounting is
      unavailable.
- [x] Net profit intentionally omitted until cost-of-goods-sold data is reliable.

### Backend dashboard API

- [x] `GET /api/v1/dashboard?range=...` returns company, period, access, KPIs, charts, widgets and
      notifications in one tenant-scoped response.
- [x] `GET /api/v1/dashboard/notifications` returns the same live alert feed independently.
- [x] `GET /api/v1/dashboard/search?q=...` searches only records the active role may read.
- [x] All dashboard routes require authentication plus `reports.read`.
- [x] Business aggregates are additionally gated by `sales.read`, `crm.read`, `inventory.read`
      and `finance.read`.
- [x] Every query runs through `withTenantContext`, so PostgreSQL row-level security applies.
- [x] Date-only business values are interpreted and rendered in UTC to avoid calendar-day drift.

### Centralized multilingual UI (EN / FR / AR / DE)

- [x] One global language provider (`apps/web/src/lib/i18n.tsx` + `i18n-core.mjs`) shared by the
      public site, auth screens and the private workspace. Switching language updates React
      context, `document.documentElement.lang` and `document.documentElement.dir` immediately
      without `router.refresh()`, so forms and page state are preserved.
- [x] Four complete dictionaries (`en`, `fr`, `ar`, `de`) at
      `apps/web/src/lib/locales/*.json`. Every dictionary has the same 1,047 keys, no empty values
      and matching `{placeholder}` sets; parity is enforced by an automated test.
- [x] Language preference persists in `localStorage` (`nexus-locale`) and is written back to the
      authenticated profile through `PATCH /auth/me/locale`, so refresh, logout and login keep the
      selected language.
- [x] Language switchers on the public landing page, auth cards, workspace topbar and settings.
      German is available alongside English, French and Arabic everywhere.
- [x] Every UI surface was migrated from hardcoded English to translation keys: public landing,
      login/register/forgot/reset/verify screens, shell navigation and breadcrumbs, global search
      groups, notification center, company selector, profile menu, dashboard KPI cards, charts,
      widgets, quick actions and notes, inventory, CRM, sales, companies, company settings, roles
      and permissions, sessions/security and pagination/empty/error states.
- [x] System enums (statuses, stages, activity types, movement types, payment methods, permission
      actions) are translated for display while the stored values remain unchanged.
- [x] Tenant-entered business data (names, SKUs, references, descriptions, cities) is never
      translated. Dates, numbers and currencies are formatted with the active UI language via
      `Intl`, independent of the company default locale.
- [x] Server dashboard labels, KPI captions and notifications carry optional `*Key`/`*Params`
      fields, so the client translates them while retaining English fallbacks.
- [x] Chart bucket labels are rebuilt client-side from the stable UTC `YYYY-MM-DD` key and the
      period granularity, using the UI language.
- [x] Arabic automatically switches the whole app to RTL: sidebar placement, navigation labels,
      icons that indicate direction, table alignment, numeric columns, form fields, dropdowns,
      modals, chart text and popovers. EN/FR/DE stay LTR.
- [x] Arabic typography uses a dedicated Arabic font stack (Noto Kufi Arabic / Tajawal / Cairo)
      with increased line-height, while Latin languages keep Inter.
- [x] Static API error messages are translated on the client with the stored language; dynamic
      server messages keep their English text until a message-code contract is added.

### Corrected issues

- [x] Development port fallbacks were inconsistent with the documented URLs. `app.module.ts`,
      `main.ts`, `auth.service.ts` and the web API client now fall back to API `4001` and web
      `3001`.
- [x] The dashboard route previously rendered a placeholder summary. It now uses a dedicated
      database-backed dashboard module and view.
- [x] Sales forms used hardcoded 2026 date defaults. They now derive dates from the current time.
- [x] Invoice creation is disabled until a due date exists.
- [x] CRM activity due dates now convert `datetime-local` values to UTC consistently.
- [x] Dashboard notification queries are permission-scoped, so restricted roles cannot infer
      sales or inventory activity from alert counts.
- [x] Notification read state is stored per company, preventing cross-tenant read-state leakage
      inside one browser profile.
- [x] The profile chip could overflow its 120px max-width, pushing the chevron past the viewport
      and creating horizontal scroll on narrower desktop windows. Its text now truncates with an
      ellipsis and the document no longer overflows horizontally.
- [x] Between 431px and 760px the full-width mobile search was still nested inside the
      non-wrapping `.topbar-tools` row, causing ~100px of horizontal overflow. The tools row now
      becomes `display: contents` at that breakpoint so the search spans its own topbar row, and
      focusing it no longer collapses the topbar or overlays the company selector.

## Data sources

| Indicator | Source |
| --- | --- |
| Revenue | Sum of non-void invoice `subtotal` issued in the period |
| Sales volume | Sum of non-cancelled order `total` created in the period |
| Orders | Count of non-cancelled orders created in the period |
| Pending orders | Orders in `OPEN`, `PARTIALLY_DELIVERED`, `DELIVERED` or `PARTIALLY_INVOICED` |
| Outstanding invoices | Sum of `total - paidAmount` for `OPEN` and `PARTIALLY_PAID` invoices |
| Customers | Active CRM records of type `CUSTOMER`, with active prospects in the caption |
| Products | Active inventory items |
| Stock value | On-hand quantity × current item unit cost |
| Low stock | Active items whose on-hand quantity is at or below their reorder point |
| Expenses | Net debit on posted journal lines for active `EXPENSE` accounts |
| Revenue chart | Non-void invoice subtotals grouped by period bucket |
| Sales performance | Invoice subtotals versus customer payments received |
| Orders by status | Non-cancelled orders grouped by status |
| Monthly expenses | Posted expense-account journal lines grouped by period bucket |
| Top products | Invoice-line revenue and quantity for the five best-selling items |
| Inventory distribution | Stock value grouped by active warehouse |
| Customer growth | New customers and prospects grouped by creation period |
| Notifications | Overdue invoices, low stock, pending orders and open/due-soon CRM activities |

Search results are limited to five records per group and are filtered by the caller's module
permissions. Tenant isolation is enforced both by explicit `companyId` predicates and by the
database RLS policies.

## Verification

Commands run from the repository root:

```powershell
pnpm typecheck
pnpm test
pnpm --filter @nexus/api test:integration
pnpm build
```

Results:

- `pnpm typecheck` — passed for `packages/shared`, `apps/api` and `apps/web`.
- `pnpm test` — API Jest suite (2 suites, 8 unit tests) and the new web i18n suite
  (`apps/web/test/i18n.test.mjs`, 8 tests) passed.
- `pnpm --filter @nexus/api test:integration` — 6 suites, 9 tests passed:
  - authentication lifecycle
  - inventory receipts, transfers and isolation
  - CRM customers, opportunities, activities and isolation
  - PostgreSQL tenant row-level security
  - dashboard KPIs, charts, widgets, notifications, search, period validation, restricted-role
    filtering and cross-company isolation
  - RBAC roles, effective permissions, multi-role unions, owner protection and locale persistence
- `pnpm build` — API build passed and Next.js produced 16 routes successfully.

The web i18n suite verifies dictionary key parity across EN/FR/AR/DE, absence of empty values,
placeholder parity, core vocabulary coverage, language normalization, RTL detection, `Intl`
locale selection and interpolation.

Language/RTL browser sweep against the running dev servers (Chromium):

- Public landing page: `ar` set `lang="ar"` and `dir="rtl"` with every visible string translated;
  `de`, `fr` and `en` set `lang`/`dir="ltr"` and rendered their own dictionaries. Only the NEXUS
  brand and the copyright line remain in Latin script on the Arabic page.
- Auth pages `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`:
  verified in German (LTR) and Arabic (RTL) with translated headings, no leftover English UI
  strings and no horizontal overflow.
- Workspace pages `/app`, `/app/inventory`, `/app/crm`, `/app/sales`, `/app/companies`,
  `/app/settings`, `/app/roles`, `/app/security`: verified in Arabic (RTL) and German (LTR), then
  spot-checked in French and English. Each page rendered its translated title and section
  headings, `documentElement.lang`/`dir` matched the selected language, the English UI probe words
  were absent from the Arabic pages, and `scrollWidth === clientWidth` on every page.
- Switching language with the workspace selector updates the view immediately without a reload.
  Reloading `/app` after selecting German restored German from the saved profile locale
  (`localStorage` also held `de`), confirming persistence across refresh. The demo profile was
  restored to French after the sweep.

Dashboard-specific browser checks (Chromium, 800px viewport):

- Signed in as the demo owner and loaded `/app`; the dashboard rendered 10 KPI cards, 4 SVG
  charts and the recent-sales table with live data.
- Sidebar collapse persisted in `localStorage` and reduced the sidebar to 78px.
- Theme toggle switched `data-theme` between `dark` and `light`, persisted `nexus-theme`, and
  survived a reload.
- Profile menu opened with Company settings, Roles & permissions, Sessions & security and
  Sign out.
- Global search for `atlas` returned the "Customers & prospects" group; `INV` returned the
  "Invoices" group with `INV-2026-00001` plus workspace page shortcuts.
- Period filters `7D` and `30D` updated both the active button and the period label
  ("Last 7 days" / "Last 30 days"); the dashboard re-fetched live data each time.
- Notification center showed 2 unread alerts.
- After the profile-chip fix, `documentElement.scrollWidth` equals `clientWidth` (785px) and no
  element extends past the viewport. No console errors and no failed API requests were recorded.
- Responsive layout was verified in a same-origin 390px iframe harness: the sidebar becomes a
  fixed off-canvas drawer, the mobile menu button opens the drawer and backdrop, the search takes
  its own full-width topbar row, and the KPI grid collapses to one column. The harness was
  removed after verification.
- A width sweep at 320, 360, 390, 414, 430, 600, 700, 760, 768, 900, 1024, 1280 and 1440px found
  no horizontal document overflow. The topbar stays 97–99px tall on mobile and 67px on desktop.
- Mobile notification and profile popovers open inside the viewport, and focusing the search does
  not cause a layout jump or overlap the company selector.

The dashboard integration test creates real customers, inventory receipts, quotations, orders,
deliveries, invoices, payments and CRM activities through the public API, then verifies the
dashboard response against those records. It also downgrades a membership to a custom
`reports.read` + `crm.read` role and confirms that sales, inventory and finance data are absent
from KPIs, charts, widgets, notifications and search.

## Known limitations

- No active `EXPENSE` accounting accounts exist in the seeded/demo data. The expenses KPI therefore
  reports "Not configured" and the monthly expenses chart shows an explanatory empty state. The
  aggregation is implemented and becomes active when expense accounts and posted journal entries
  exist.
- Net profit is not shown. Reliable profit requires cost-of-goods-sold tracking at invoice level,
  which the current schema does not yet store.
- Notification read state is stored in browser `localStorage`, scoped per company. It is not
  synchronized across devices or users, and notifications themselves are derived alerts rather
  than a persisted notification table.
- Snapshot indicators (outstanding invoices, pending orders, stock value, low stock) do not show
  previous-period deltas because no historical snapshot is stored.
- Charts are dependency-free SVG visualisations. They support hover titles and responsive
  scaling, but not zooming, drill-down or export.
- The public landing page and auth screens are fully translated, but there are no additional
  marketing routes beyond the implemented landing, sign-in, registration and account-recovery
  flows.
- Dynamic server exception text that embeds record identifiers (for example insufficient stock
  for a specific SKU) is not yet translatable client-side. Static API errors and all UI copy are
  translated; a future message-code contract would cover the interpolated server messages.
- Class-validator field messages (for example `email must be an email`) are returned by the API
  in English. The UI shell and custom business errors are localized; DTO-level validation
  messages still need server-side message keys for full coverage.

## Running locally

```powershell
pnpm infra:up
pnpm db:deploy
pnpm db:seed
pnpm dev
```

Then open `http://localhost:3001`, sign in with the demo owner configured through
`DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD`, and use the period filters in the dashboard header.
