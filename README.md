# PriceVault

PriceVault is a multi-tenant competitor price tracking SaaS for DACH e-commerce operators. A FastAPI service captures price snapshots with stealth-enabled Playwright, while a German-language Next.js dashboard presents price deltas and alert configuration.

## Architecture

- `backend/`: Python 3.12, FastAPI, Playwright, APScheduler, Supabase, Resend
- `dashboard/`: Next.js 16 App Router, React 19, Tailwind CSS, Supabase Auth
- `infra/`: database policy reference and a Phase 2 deployment placeholder

## Local setup

### Prerequisites
- Python 3.12+
- Node.js 20+
- Playwright browsers: `playwright install chromium`
- A Supabase project (free tier is fine)

### Backend
```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
cp .env.example .env
# Fill in .env with your Supabase + Resend + Anthropic keys
uvicorn main:app --reload --port 8000
```

### Database
```bash
# Run backend/db/schema.sql in the Supabase SQL editor
# No migrations needed for Phase 1 — schema.sql is run once
```

In Supabase Auth, add `http://localhost:3000/api/auth/callback` as a redirect URL. New users create their tenant, first product, and first price source through the in-app onboarding flow after signing in.

### Dashboard
```bash
cd dashboard
npm ci
cp .env.local.example .env.local
# Fill in .env.local with your Supabase anon key + backend URL
npm run dev
```

### Verify
- Backend: http://localhost:8000/docs (FastAPI auto-docs)
- Dashboard: http://localhost:3000

Run the local checks before deploying:

```bash
cd dashboard && npm run lint && npm run build
cd ../backend && .venv/bin/python -m compileall -q .
```
