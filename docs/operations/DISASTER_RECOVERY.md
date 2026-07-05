# Disaster recovery

- Target RPO: 24 hours. Target RTO: 4 hours.
- Recovery owner: incident commander. Database owner: Supabase operator. Runtime owner: Railway/Vercel operator. Billing owner: finance operator.
- Escalation contacts are the on-call entries in the private operations directory; public repositories must not contain personal phone numbers.
- Supabase is authoritative. Redis/ARQ is reconstructible and must never be restored as authoritative state.

Restoration order: Supabase database and Auth, secrets, Redis, Railway worker, Railway API, Railway scheduler, Vercel dashboard, Viva/Resend webhooks. Keep the scheduler stopped until database integrity and credentials are verified. Recreate only idempotent due jobs, using persisted job/run records; do not replay successful billing or repricing work. Then reconcile Viva transactions, invoices, connector state, alerts, and processor deletion requests.

Daily backups must be enabled and checked against the selected production Supabase plan. Run a non-production restore drill quarterly. Record start/end times, achieved RPO/RTO, evidence location, reconciliation result, owner, and findings in `recovery_drills`; never restore production data into an uncontrolled project.
