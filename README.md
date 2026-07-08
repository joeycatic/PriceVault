# PriceVault

PriceVault is a multi-tenant competitor price tracking SaaS for DACH e-commerce operators. A FastAPI service captures price snapshots with stealth-enabled Playwright, while a German-language Next.js dashboard presents price deltas and alert configuration.

## Architecture

- `backend/`: Python 3.12, FastAPI, ARQ + Redis, Browserless Playwright, Supabase, Resend, Viva billing
- `dashboard/`: Next.js 16 App Router, React 19, Tailwind CSS, Supabase Auth
- `infra/`: CI/CD workflow copies, Railway runtime config, and local Redis compose files

## Local setup

### Prerequisites
- Python 3.12+
- Node.js 20+
- Browserless.io token for remote Playwright sessions
- Redis for ARQ jobs
- A Supabase project (free tier is fine)

### Backend
```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Fill in the local-required values: Supabase, Redis, Browserless, and CONNECTOR_ENCRYPTION_KEY.
# Resend, Viva, and Sentry can stay blank until you test those integrations.
dotenv -f .env run -- uvicorn main:app --reload --port 8000
```

Run the worker in a second shell:

```bash
cd backend
source .venv/bin/activate
dotenv -f .env run -- arq jobs.worker.WorkerSettings
```

Run APScheduler in a third shell. It checks due price sources every minute and dispatches billing and report jobs at their configured UTC times:

```bash
cd backend
source .venv/bin/activate
dotenv -f .env run -- python scheduler.py
```

### Database
```bash
# Fresh project: run backend/db/schema.sql in the Supabase SQL editor
# Existing project: review and apply the idempotent additions in backend/db/schema.sql via the SQL editor
```

`backend/db/schema.sql` is authoritative. The legacy Alembic directory is historical and is not a
complete upgrade path. Record the applied schema commit and SQL-editor execution evidence in the
release checklist.

In Supabase Auth, add `http://localhost:3000/api/auth/callback` as a redirect URL. New users create their tenant, first product, and first price source through the in-app onboarding flow after signing in.

### Dashboard
```bash
cd dashboard
npm ci
cp .env.local.example .env.local
# Fill in .env.local with your Supabase anon key + backend URL
npm run dev
```

### Local verify
- Backend: http://localhost:8000/docs (FastAPI auto-docs)
- Dashboard: http://localhost:3000
- Health: `GET /health` checks Supabase connectivity, ARQ/Redis queue visibility, and the APScheduler heartbeat; `GET /health/worker` returns the queue saturation signal used by the worker service.
- Logs are JSON via structlog. API requests include `request_id`, `tenant_id` when `X-Tenant-ID` is present, method/path/status, and duration. Scrape jobs bind `tenant_id`, `competitor_product_id`, and `scrape_job_id` when a job-history row is created.

Check that the local app is reachable:

```bash
cd backend
dotenv -f .env run -- python -m verification.local_readiness
```

Run the local quality checks:

```bash
cd dashboard && npm audit --audit-level=moderate && npm run lint && npm run test && npm run build
cd ../backend && .venv/bin/python -m compileall -q . && .venv/bin/python -m pip_audit -r requirements.txt --progress-spinner off && .venv/bin/python -m pytest -q
.venv/bin/python -m pytest --cov=. --cov-report=term-missing --cov-report=json -q
.venv/bin/python -m verification.coverage_targets coverage.json
```

Production readiness is separate. `verification.live_readiness` and
`verification.deployment_readiness` intentionally require verified Resend/Viva
credentials and remote GitHub/Railway/Vercel setup.

## Railway services

Deploy the repository as three Railway services sharing the same Redis and backend
environment variables:

- `pricevault-backend` uses `infra/railway.toml` and serves FastAPI.
- `pricevault-worker` uses `infra/railway.worker.toml` and runs the ARQ worker.
- `pricevault-scheduler` uses `infra/railway.scheduler.toml` and dispatches recurring work.

The backend workflow deploys the configured services after tests pass on `main`.

## Launch controls

- Price snapshots retain extraction evidence; only `validation_state=valid` data feeds alerts, insights, and repricing.
- Robots policy and approved-host checks run before scraping. Redis enforces shared domain concurrency and request limits.
- Automatic repricing defaults off and the kill switch defaults on. Suggestions and manual approvals remain available.
- Paid checkout is limited to EU businesses. German invoices use 19% VAT; other EU businesses require a current VIES-confirmed VAT ID.
- Deletion requests have a 14-day cancellation period. Operational data is purged at execution while restricted accounting records remain.
- Operational runbooks and launch evidence requirements are in `docs/operations/`.
