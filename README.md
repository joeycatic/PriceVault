# PriceVault

PriceVault is a multi-tenant competitor price tracking SaaS for DACH e-commerce operators. A FastAPI service captures price snapshots with stealth-enabled Playwright, while a German-language Next.js dashboard presents price deltas and alert configuration.

## Architecture

- `backend/`: Python 3.12, FastAPI, Playwright, APScheduler, Supabase, Resend
- `dashboard/`: Next.js 14 App Router, Tailwind CSS, Supabase Auth
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
python -m venv venv
source venv/bin/activate
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

### Dashboard
```bash
cd dashboard
npm install
cp .env.local.example .env.local
# Fill in .env.local with your Supabase anon key + backend URL
npm run dev
```

### Verify
- Backend: http://localhost:8000/docs (FastAPI auto-docs)
- Dashboard: http://localhost:3000

