# Local dashboard troubleshooting and startup

## Canonical local URLs

- Web development server: `http://localhost:3000`
- Signed-in ERP dashboard: `http://localhost:3000/app`
- API base: `http://localhost:4000/api/v1`
- API health: `http://localhost:4000/api/v1/health`
- Dashboard summary: `http://localhost:4000/api/v1/dashboard/summary` (requires the authenticated session cookie and a selected active company)

The dashboard is a private page. Sign in first, then open `/app`; the public landing page at `/` is not the dashboard.

## Start from the repository root

After dependencies are installed and the database has been migrated/seeded, run the API and web in separate terminals:

```sh
pnpm dev:api
pnpm dev:web
```

The web package explicitly binds Next.js to port 3000, matching the documented browser URL, `WEB_ORIGIN`, and the default browser API URL. The API defaults to port 4000. `.env.example` uses the same values. If an environment variable overrides these settings, use the configured ports instead.

For Docker Compose, `docker compose --profile app up --build` publishes the web and API on the ports configured by `WEB_PORT` and `API_PORT` (3000 and 4000 by default). Do not use the Docker service and a separately running local development server on the same host ports at the same time.

## If the old page is still shown

1. Confirm the local checkout includes the dashboard commit and the current `apps/web/src/app/app/page.tsx` imports `./dashboard-view`.
2. Confirm `pnpm dev:web` reports that Next.js is listening on port 3000; open `/app` after signing in, not `/`.
3. Check that the browser's page origin is `localhost:3000`. If another app owns that port, stop that app or use a deliberate port override and update `WEB_ORIGIN` and `NEXT_PUBLIC_API_URL` consistently.
4. Check the Next.js terminal for compile/runtime errors. Only after stopping the server, remove the configured Next build directory (`apps/web/.next-sales` by default) if an obsolete local build is suspected, then restart `pnpm dev:web`.
5. Check API readiness at `/api/v1/health`. Dashboard data requires the authenticated cookie, an active company membership, the `company.read` grant and business-specific read permissions. An unauthenticated direct browser request to the summary endpoint is expected to be rejected.
