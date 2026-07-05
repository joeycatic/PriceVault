# Release checklist

Owner: release commander. Evidence links belong in the release record; do not place secrets here.

## Before deployment

- Confirm `backend/db/schema.sql` matches the application commit and review every tenant/RLS policy change.
- Apply reviewed schema additions in the Supabase SQL editor; record project, commit, operator, time, and result.
- Confirm API, worker, and scheduler share Supabase, Redis, encryption, Browserless, Resend, Viva, Sentry, and safety variables.
- Keep `ENABLE_AUTOMATIC_REPRICING=false` and `AUTOMATIC_REPRICING_KILL_SWITCH=true`.
- Keep EU checkout unavailable until DE VAT, non-DE reverse charge, VIES outage, webhook idempotency, invoice, adjustment, and reconciliation acceptance cases pass.
- Verify daily Supabase backups are enabled for the production plan and a current restore drill exists.

## Deployment order

1. Apply additive database schema and verify PostgREST reload.
2. Deploy the ARQ worker, then the API, then APScheduler, then the Vercel dashboard.
3. Verify `/health`, `/health/worker`, one policy-approved scrape, one email, and the previous-day reconciliation surface.
4. Confirm no source was re-enabled and no automatic price was written during deployment.

## Rollback

- Set the repricing kill switch first. Suspend affected tenant automation if the issue is tenant-specific.
- Stop the scheduler before workers when preventing new work; drain or discard reconstructible Redis jobs by job ID.
- Roll application services back to the prior artifact. Do not destructively reverse accounting or snapshot columns.
- Restore Supabase only under the disaster-recovery runbook; reconcile Viva and webhooks after restoration.

## Required verification

```sh
cd dashboard && npm run lint && npm run build
cd ../backend && .venv/bin/python -m compileall -q .
```
