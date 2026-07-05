# Operator runbook

- Source repair owner: scraping operations. Paid-plan broken sources are triaged within two business days.
- Billing exception and reconciliation owner: finance operations. Respond within one business day.
- Privacy request owner: privacy operations. Review failures and exceptions each business day.
- Security incident owner: on-call incident commander. Security reports receive a response within one business day.
- General support owner: customer operations. Respond within two business days.

Capacity warning is sustained 70% utilization; critical is 90%. Watch queue latency/saturation, scrape success, browser seconds, LLM use, email/report volume, snapshot growth, and estimated cost by tenant/plan. Hard plan enforcement stays disabled until at least 30 days of representative production measurements are reviewed.

Monthly review: signup-to-onboarding funnel, validated scrape within 24 hours (activation), 7/30-day retention by plan, source reliability, support volume, reconciliation exceptions, and estimated gross margin. Do not change plan limits from a single short-term spike.
