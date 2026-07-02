# AGENTS.md — PriceVault

Multi-tenant competitor price tracking SaaS for DACH e-commerce operators.
Read this file fully before touching code. It replaces re-deriving context from the repo tree.

## Stack

- `backend/`: Python 3.12, FastAPI, Playwright (stealth-enabled scraping), APScheduler, Supabase (Postgres + Auth), Resend (email), Anthropic API
- `dashboard/`: Next.js 16 (App Router), React 19, Tailwind CSS, Supabase Auth — German-language UI
- `infra/`: database policy reference + Phase 2 deployment placeholder (no IaC yet, don't invent Terraform/Docker unless asked)

## Non-negotiable invariants

- **Multi-tenancy**: every query, scrape job, and API route must be scoped by `tenant_id`. Never write a query that reads across tenants. If a Supabase RLS policy already enforces this, don't duplicate the check redundantly in application code — say which layer is responsible.
- **Schema is source of truth, not migrations**: Phase 1 has no migration system. Schema changes go directly into `backend/db/schema.sql`, run once via Supabase SQL editor. Don't generate Alembic/migration files unless the roadmap has explicitly moved to Phase 2+.
- **Dashboard copy is German**: all user-facing strings in `dashboard/` are German. Code, comments, commit messages stay English.
- **Onboarding flow owns tenant creation**: new tenant + first product + first price source are created in-app after sign-in, not via seed scripts or admin tooling.

## Conventions

- Backend: type-hinted Python, FastAPI dependency injection for auth/tenant context, Playwright scraping logic isolated from route handlers so it can be scheduled independently via APScheduler.
- Dashboard: App Router conventions (route groups, server components by default, client components only where interactivity requires it), Tailwind utility classes only — no ad hoc CSS files unless a component genuinely needs it.
- Keep scraper logic and API/business logic in separate modules — scrapers change often (site layout drift), routes shouldn't.

## Verify before calling anything done

```
cd dashboard && npm run lint && npm run build
cd ../backend && .venv/bin/python -m compileall -q .
```
Run exactly these two checks — don't add extra test scaffolding or CI steps unless asked.

## Scope discipline

- If a task is backend-only, don't read or touch `dashboard/`, and vice versa.
- Prefer minimal diffs/patches over full-file rewrites.
- If a task implies a new dependency, name it and ask before adding it to `requirements.txt` / `package.json`.
- Don't invent features outside the current phase of the roadmap (see `CODEX_MASTERPROMPT.md`) — flag scope creep instead of silently building ahead.
