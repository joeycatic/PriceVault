# Security operations

## Threat model

- Tenant isolation: composite tenant foreign keys plus RLS are the primary browser boundary; service-role queries and every job must carry `tenant_id`.
- Service role: server and worker only, least-distributed secret, audited admin callers, never exposed to dashboard code.
- SSRF and scraping: public URL validation, robots checks, approved-host redirect blocking, identifiable user agent, and shared domain limits.
- Connector secrets: encrypted at rest, redacted from API responses, rotated after exposure, and never copied into audit metadata.
- Billing webhooks: provider lookup verification, amount/order/status comparison, and transaction idempotency.
- Repricing: validated fresh evidence, cost floor, currency/variant match, manual threshold, daily cap, tenant suspension, feature flag, and kill switch.

## Incident response

- SEV1: confirmed cross-tenant exposure, credential compromise, unsafe repricing, or material billing corruption. Page immediately.
- SEV2: contained security weakness or major customer-impacting outage. Respond within one hour.
- SEV3: limited degradation. Respond within one business day. SEV4: routine defect.
- Roles: incident commander, technical lead, communications lead, privacy/legal lead, and scribe.
- Preserve logs, request/job IDs, immutable billing records, affected commits, and timestamps before cleanup. Contain by stopping scheduler/workers, rotating secrets, blocking sources, suspending tenants, or enabling the kill switch as applicable.
- Privacy/legal assesses authority and customer/regulator notification deadlines. Communications must state verified facts and backup limitations.
- Complete a post-incident review with cause, detection gap, timeline, corrective owners, and due dates.

Secrets have named owners in the private inventory, rotate at least every 90 days, and rotate immediately after suspected exposure. Review production access quarterly. Patch critical dependency vulnerabilities within 24 hours, high within 7 days, medium within 30 days. CSP is report-only until violations are reviewed and required origins are explicit.
