# PriceVault Production Verification

This checklist covers the items that require live services or credentials. Run it after
the local checks pass.

## Credential Placeholders

Copy `backend/.env.example` to `backend/.env` and
`dashboard/.env.local.example` to `dashboard/.env.local`. Required placeholders
are intentionally blank; optional settings include their defaults.

Required GitHub Actions secrets:

```text
TEST_DATABASE_URL=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
RAILWAY_TOKEN=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SENTRY_DSN=
VERCEL_TOKEN=
VERCEL_ORG_ID=
VERCEL_PROJECT_ID=
```

Required Railway service variables are every value marked `REQUIRED` in
`backend/.env.example`. Required Vercel variables are every value marked
`REQUIRED` in `dashboard/.env.local.example`.

Optional live-integration test values are tenant-specific and must not be added to
repository environment files:

```text
TEST_WEBHOOK_URL=       # Request-bin endpoint for webhook delivery verification
SLACK_WEBHOOK_URL=      # Slack incoming webhook for message verification
SHOPIFY_SHOP_DOMAIN=    # Test store, for example shop-name.myshopify.com
SHOPIFY_ACCESS_TOKEN=   # Scoped Admin API token; stored encrypted by the app
```

## Current External Status (2026-07-02)

- Local backend and dashboard checks pass: 162 backend tests and 18 dashboard
  tests. Overall backend coverage is 90%, and every module-specific coverage gate
  passes. Redis quota behavior is covered by tests.
- A disposable PostgreSQL 16 instance was verified through Podman on this host:
  upgrade to head, downgrade to `0008_team_member_access`, and re-upgrade to head
  all pass. The current head is `0015_viva_billing`.
- A disposable Redis 7 instance was verified through Podman. The ARQ worker starts,
  registers all ten functions, connects to Redis, and enqueues `scrape_target`.
- The production Next.js build was rendered at 1440x900 and 390x844. `/` redirects
  to the German login page with no browser console errors, framework overlay, blank
  content, or mobile horizontal overflow; invalid email submission remains focused
  and is rejected by native form validation.
- A live local FastAPI process returned `200` from `/health`, `/health/worker`, and
  `/openapi.json`. Worker health reported queue depth, saturation, and the `idle`
  scale hint without exposing Redis connection data.
- Supabase Python `2.31.0`, `playwright-stealth` `2.0.3`, and the compatible
  `websockets` `15.0.1` runtime pass all backend tests without the deprecated
  `gotrue` or `pkg_resources` startup warnings. A read-only query through the
  upgraded Supabase service client also succeeded against the configured project.
- Python `pip-audit 2.10.1` and `npm audit --audit-level=moderate` both report
  zero known vulnerabilities. Next `16.2.10` is forced onto PostCSS `8.5.16` to avoid
  GHSA-qx2v-qp2m-jg93 in Next's older nested PostCSS dependency. Both audits are
  enforced by the local CI workflows before tests and deployment.
- A fresh Python 3.12 virtualenv built only from `backend/requirements.txt` passes
  `pip check` and all backend tests. Pydantic's email extra is declared explicitly so
  production `EmailStr` schemas do not depend on packages left over in a developer
  environment.
- The existing Supabase baseline was verified before adoption, stamped at
  `0001_initial`, and upgraded successfully through `0015_viva_billing`.
  The database version and every REST table, view, and billing-column probe pass.
- Browserless is connected through its current CDP endpoint with Playwright `1.61.0`.
  A live ARQ scrape extracted a price successfully and increased the selected
  mapping's Supabase snapshot count from 6 to 7.
- Runtime constraint tests reject local Playwright browser launches or
  `playwright install` commands in backend/deployment code; scraping must connect
  to Browserless over CDP.
- Runtime constraint tests also reject `print()` calls in backend agent modules;
  agent diagnostics go through structured logging.
- Customer-facing scrape job messages are German, with a regression test blocking
  the previous English fallback strings from returning in job/API payloads.
- Required backend and dashboard env-template sections are tested against the live
  readiness key lists so required placeholders cannot drift from readiness checks.
- Shopify tokens and alert-channel webhook URLs are encrypted before storage.
  Connector and alert-channel API responses are contract-tested to return only
  non-secret config or masked destination hosts.
- Service-role Supabase usage is statically allowlisted to trusted server paths
  only: background jobs, scheduler, webhook handling, API-key lookup, and team
  invite admin API.
- A controlled backend Sentry event was accepted. Both backend and dashboard Sentry
  DSNs are configured.
- Resend API authentication is configured. The readiness probe now rejects the
  testing `resend.dev` sender for production. The account currently has only
  `smokeify.de` verified; `pricevault.de` is not registered. Production
  onboarding and ops delivery require a verified PriceVault sender domain and
  valid recipient addresses.
- Onboarding, alert, and DLQ email jobs use `RESEND_FROM_EMAIL`; onboarding and
  alert links use `APP_URL`. Contract tests cover those configured values.
- Viva Smart Checkout, verified payment webhooks, cancellations, and recurring
  renewal jobs are implemented. Shared demo OAuth credentials and source code from
  GrowVault/Smokeify create demo orders successfully, but their demo Merchant API
  key returns `401` from Viva's webhook-key endpoint. The shared production pair
  passes both read-only credential checks but is not enabled for PriceVault.
- Runtime/config/docs reference Viva as the billing provider; tests reject stale
  legacy billing-provider references outside historical migrations.
- The configured dashboard backend URL points to a healthy local API, not a verified
  Railway deployment.
- The GitHub repository currently has no remote `.github/workflows` directory, no
  Actions runs, and no Actions secrets. The local workflows must be reviewed,
  committed, and pushed, and the listed deployment secrets must be added before
  their main-branch triggers and Railway/Vercel deploy steps can be verified.
- The local backend workflow uses pinned Railway CLI `5.23.3`; both service commands
  and flags were checked against the installed CLI help. Backend and dashboard
  workflows support manual dispatch after secrets are added. Regression tests
  reject the nonexistent `railwayapp/railway-action` reference and keep workflow
  copies in sync.
- The deployment readiness probe confirms local workflow integrity, but reports
  missing GitHub Actions secrets, missing remote workflow files/runs, and no local
  Railway/Vercel project links.
- The connected Vercel team contains `growvault` and `smokeify`, but no PriceVault
  project. Railway is not linked locally, so neither production target currently
  exists in a form that can be safely deployed by this repository.

## Local Checks

```bash
cd backend
.venv/bin/python -m compileall -q .
.venv/bin/python -m pip_audit -r requirements.txt --progress-spinner off
.venv/bin/python -m alembic -c db/alembic.ini heads
.venv/bin/python -m verification.local_readiness
.venv/bin/python -m pytest -q
.venv/bin/python -m pytest --cov=. --cov-report=term-missing --cov-report=json -q
.venv/bin/python -m verification.coverage_targets coverage.json
.venv/bin/python -m verification.deployment_readiness

# Against a disposable Postgres database with DATABASE_URL set:
.venv/bin/python -m verification.migration_smoke

cd ../dashboard
npm audit --audit-level=moderate
npm run lint
npm run test
npm run build
```

Expected evidence:
- Alembic head is `0015_viva_billing`.
- Migration smoke prints `migration_smoke_ok` after upgrade, downgrade to
  `0008_team_member_access`, and re-upgrade to head.
- Backend tests pass.
- Runtime constraint tests prove scraper code uses Browserless CDP and no
  backend/deployment code installs or launches local Playwright browsers.
- Coverage target check passes for scrape tasks, billing webhooks, plan guard,
  API-key auth, export routes, and team invite modules.
- Deployment readiness reports local workflow integrity, configured Actions
  secrets, remote workflow files, at least one Actions run, and linked Vercel and
  Railway projects.
- Dashboard tests pass.
- Dashboard build lists the dashboard, usage, billing, API-key, team, connector, and alert-channel routes.

## Live Readiness Probe

```bash
cd backend
.venv/bin/python -m verification.live_readiness
```

Expected evidence:
- Output contains no secret values, only presence booleans and schema status.
- When `DATABASE_URL` is configured, `database_migration.current` matches the
  current Alembic head.
- `ready` is `true` only when all required backend/dashboard credentials are
  configured, Viva OAuth and webhook-key authentication succeed, the Resend sender
  domain is verified with sending enabled, the Supabase schema exposes every
  implemented phase table and column, and the database reports the current Alembic
  head.

## Redis And ARQ

```bash
docker compose -f infra/docker/redis.yml up -d
cd backend
REDIS_URL=redis://localhost:6379 arq jobs.worker.WorkerSettings
```

In another shell, trigger a scrape from the dashboard or:

```bash
curl -X POST "$BACKEND_URL/scrape/run" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "X-Tenant-ID: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":"'"$TENANT_ID"'","competitor_product_ids":null}'
```

Expected evidence:
- API returns `queued > 0`.
- Worker logs show `scrape_target` jobs.
- `GET /health/worker` returns `queued_jobs`, `queue_saturation`, and
  `scale_hint` without exposing the Redis URL.

## Supabase Migrations

```bash
cd backend
DATABASE_URL="$DATABASE_URL" .venv/bin/python -m alembic -c db/alembic.ini upgrade head
```

Expected evidence:
- Migration completes without error.
- Tables exist: `scrape_failures`, `api_keys`, `alert_channels`, `team_members`, `connector_sources`.
- RLS is enabled on all tenant tables.
- Invited team members can read their tenant, while only owners/admins can manage seats.
- Authenticated invitees can update only `team_members.accepted`, not their role.
- Related products, competitors, mappings, snapshots, alerts, events, and failures
  cannot reference records belonging to another tenant.

## Browserless Scraping

Required env: `BROWSERLESS_TOKEN`, `REDIS_URL`, Supabase credentials, at least one active price source.

Expected evidence:
- Worker completes a scrape without launching local Chromium.
- `price_snapshots` receives a new row with `scrape_ok = true`.

## Viva

Required setup in the Viva banking app:

1. Under **Settings > API Access**, copy the Smart Checkout Client ID/secret and
   Merchant ID/API key into the matching `VIVA_*` variables.
2. Under **Sales > Online payments > Websites/Apps**, create a payment source and
   put its code in `VIVA_SOURCE_CODE`. Configure the success path as
   `/dashboard/settings/billing?upgraded=1` and the failure path as
   `/dashboard/settings/billing`.
3. Enable **Allow recurring payments and pre-auth captures via API**.
4. Under **Settings > API Access > Webhooks**, create an active Transaction Payment
   Created webhook targeting `https://<backend-domain>/webhooks/viva`.
5. Keep `VIVA_ENVIRONMENT=demo` for test credentials; use `live` only after the
   production source and webhook are configured.

Create a Transaction Payment Created webhook (`EventTypeId` 1796) in Viva and
point it to `/webhooks/viva`. The same endpoint responds to Viva's GET
verification request.

Expected evidence:
- Checkout redirects to Viva Smart Checkout with recurring consent enabled.
- A provider-verified webhook updates the tenant plan and Viva subscription state.
- The daily worker creates idempotent monthly renewals; owners can cancel in-app.

## Sentry

Trigger a controlled backend and dashboard exception in a non-production test environment.

Expected evidence:
- Backend event appears under `SENTRY_DSN_BACKEND`.
- Dashboard event appears under `NEXT_PUBLIC_SENTRY_DSN`.

## Alert Channels

Create a webhook channel pointed at a request bin and a Slack channel pointed at a Slack incoming webhook.

Expected evidence:
- Price alert creates an `alert_events` row.
- Webhook target receives JSON payload.
- Slack target receives the price-change message.
- Channel management responses mask secret webhook URL paths.

## API Keys

Create an API key in `/dashboard/settings/api-keys`, then call:

```bash
curl "$BACKEND_URL/integrations/prices/latest" -H "X-API-Key: $PRICEVAULT_API_KEY"
```

Expected evidence:
- Response contains latest prices for that key's tenant.
- `api_keys.last_used` is updated.
- Free-plan tenants get `403` when creating keys.

## CSV And PDF Export

Open `/dashboard/products`, then download both history exports for a mapped
competitor product.

Expected evidence:
- CSV download contains the selected date range and snapshot columns.
- PDF download opens as a valid, multipage `application/pdf` report containing
  every snapshot in the selected date range.
- Requests are tenant-scoped and fail for users without access to the tenant.

## Shopify

Use a test Shopify store and a scoped Admin API token.

Expected evidence:
- `/dashboard/settings/connectors` imports products.
- `connector_sources.config` stores `access_token_ciphertext`, not plaintext.
- Imported products appear in `/dashboard/products`.
