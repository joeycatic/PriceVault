# Agent Instructions

Before starting any task in this repo, read these SecondBrain notes:

1. `/Users/jojiarmani/development/Obsidian/SecondBrain/Dashboard.md`
2. `/Users/jojiarmani/development/Obsidian/SecondBrain/00_System/Agent Memory Protocol.md`
3. `/Users/jojiarmani/development/Obsidian/SecondBrain/01_Profile/Persistent Behavior.md`
4. `/Users/jojiarmani/development/Obsidian/SecondBrain/01_Profile/Mistakes and Habits to Avoid.md`
5. `/Users/jojiarmani/development/Obsidian/SecondBrain/02_Projects/PriceVault.md`

Then inspect this repo's current instructions and relevant docs before editing:

- `README.md`
- `CODEX_MASTERPROMPT_GROWTH.md` when working on growth phases
- `docs/operations/` when working on launch, production readiness, billing, deletion, or operational flows

## Operating Rules

- Check `git status --short --branch` before editing.
- Do not revert unrelated user changes.
- Do not make architecture calls mid-implementation when a masterprompt or project decision is required first.
- For growth-roadmap work, load `CODEX_MASTERPROMPT_GROWTH.md` and only the relevant phase section.
- Every query, job, and route must be scoped by `tenant_id`.
- `backend/db/schema.sql` is authoritative. Do not use `backend/db/migrations/` for new schema work.
- Dashboard user-facing copy is German. Code, comments, commits, and internal docs are English unless stated otherwise.
- Use Viva billing, not Stripe.
- Browser automation must use Browserless for deployed workflows.
- Do not commit secrets, `.env` files, API keys, or webhook secrets.
- Production deployments or externally visible actions require explicit confirmation.

## Verification

- Dashboard: `cd dashboard && npm audit --audit-level=moderate && npm run lint && npm run test && npm run build`
- Backend: `cd backend && .venv/bin/python -m compileall -q . && .venv/bin/python -m pip_audit -r requirements.txt --progress-spinner off && .venv/bin/python -m pytest -q`
- For growth roadmap changes, also run targeted tests from the relevant masterprompt phase.

## Closeout

In final responses, state:

- which SecondBrain notes were read
- which repo instructions or masterprompts were followed
- what verification ran
- whether the SecondBrain vault was updated

