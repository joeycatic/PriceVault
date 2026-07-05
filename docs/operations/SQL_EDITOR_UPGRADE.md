# Customer-readiness SQL editor upgrade

This is an additive upgrade for existing Supabase environments. `backend/db/schema.sql` remains the authoritative fresh-install schema. Do not run the legacy migration directory as an upgrade chain.

## Preflight

Run read-only checks and save their output with the release evidence:

```sql
select current_database(), now();
select count(*) as invoices_before, coalesce(sum(gross_amount_cents), 0) as invoice_gross_before from public.billing_invoices;
select count(*) as snapshots_before from public.price_snapshots;
select policyname, tablename from pg_policies where schemaname = 'public' order by tablename, policyname;
```

Confirm a current Supabase backup and a successful quarterly non-production restore drill before continuing.

## Execution order

1. Put automatic repricing behind `ENABLE_AUTOMATIC_REPRICING=false` and `AUTOMATIC_REPRICING_KILL_SWITCH=true`.
2. Stop the scheduler; let in-flight billing webhooks finish.
3. Run `backend/db/upgrade_customer_readiness.sql` in the Supabase SQL editor.
4. Execute `notify pgrst, 'reload schema';` again if PostgREST does not expose the additions within one minute.
5. Deploy worker, API, scheduler, then dashboard.

## Validation

```sql
select count(*) filter (where validation_state = 'unknown') as historical_unknown,
       count(*) as snapshots_after from public.price_snapshots;
select count(*) as invoices_after, coalesce(sum(gross_amount_cents), 0) as invoice_gross_after from public.billing_invoices;
select to_regclass('public.billing_refund_requests'), to_regclass('public.privacy_deletion_receipts'), to_regclass('public.public_incidents');
select relname, relrowsecurity from pg_class where relname in ('billing_refund_requests','public_incidents','csp_violation_reports');
```

Invoice counts and totals must match preflight. Historical snapshots must be `unknown`, never inferred as valid.

## Non-destructive rollback

Roll back application services and leave additive columns/tables in place. Do not drop accounting, receipt, evidence, or snapshot fields and do not restore the database merely to remove unused schema. Keep the scheduler stopped, reconcile Viva/webhook state, and document any partially processed refund or deletion before resuming.
