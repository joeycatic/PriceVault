# PriceVault — Codex Masterprompt (Phases 1–4)

Use this as the standing brief for SaaS-readiness work. Paste only the relevant phase section
into a session — not the whole file — once Phase 1 is done, to keep context lean.
Assumes `AGENTS.md` has already been loaded in the same session.

---

## Phase 1 — Production infrastructure

**Goal:** PriceVault runs reliably outside localhost with correct tenant isolation.

- Deployment target: Vercel (dashboard) + a long-running host for the FastAPI + APScheduler backend (Playwright needs a persistent process, not serverless functions — flag if asked to deploy backend to Vercel/serverless).
- Environment config: confirm `.env` / `.env.local` parity between local and prod, no secrets committed, Supabase service-role key only used server-side.
- Add basic structured logging (request id, tenant id, scrape job id) so failures are traceable per tenant.
- Add a health-check endpoint (`/health`) that checks DB connectivity and scheduler liveness.
- Confirm Supabase RLS policies match `infra/` policy reference exactly — this is a security review task, not a feature task. Report any drift, don't silently "fix" policy semantics.

**Definition of done:** backend and dashboard both deployable from a clean checkout using only `README.md` + `.env.example`, health check green, logs show tenant-scoped context.

---

## Phase 2 — Monetization (Viva Wallet)

**Goal:** tenants can subscribe, get billed, and get gated by plan.

Viva Wallet has no Stripe-style Subscription/Customer-Portal object model — subscription
logic lives in our own schema, Viva only handles the payment/tokenization side. Don't
assume Stripe-shaped primitives exist; design the state machine explicitly.

- **Auth**: OAuth2 client-credentials flow against Viva's Accounts API to get an access
  token for server-to-server calls (Checkout creation, webhook verification lookups).
- **Initial subscribe**: Viva Smart Checkout for the first payment, with card tokenization
  enabled so the token can be reused for recurring charges. Don't build a custom card form —
  use hosted Smart Checkout to stay out of PCI scope.
- **Recurring billing**: no built-in subscription object, so implement it ourselves —
  a `subscriptions` table (tenant_id, plan, status, current_period_end, viva_card_token)
  and a scheduled job (reuse APScheduler, same pattern as scrape jobs) that charges the
  saved token via Viva's recurring/token-charge endpoint on each billing cycle.
- **Webhooks**: register an endpoint for Viva's transaction webhooks (payment success,
  payment failed, refund); verify using Viva's webhook verification key, and treat
  processing as idempotent (Viva can redeliver) — key on Viva's transaction id, not just
  event type.
- **Failed payment handling**: define a dunning flow — retry N times over some window,
  then downgrade/suspend the tenant. State the exact retry schedule as an assumption if
  the roadmap hasn't fixed one.
- **Self-serve plan changes/cancellation**: since there's no Customer Portal equivalent,
  this is dashboard UI we build ourselves against our own `subscriptions` table — a task
  Codex should treat as a first-class feature, not an afterthought.
- Plan gating: define limits per plan (number of tracked products, scrape frequency,
  alert channels) and enforce at the API layer, not just in the UI.
- Trial handling if applicable — state assumption explicitly if the roadmap hasn't fixed
  trial length yet.

**Definition of done:** a new tenant can subscribe via Smart Checkout, gets correctly
gated by plan limits, gets billed automatically each cycle via the stored token, and can
cancel/downgrade in-dashboard without leaving orphaned Viva or DB state.

---

## Phase 3 — Reliability

**Goal:** scraping and alerting keep working unattended, and failures are visible before customers notice.

- Retry/backoff for transient Playwright failures (network, timeout) vs. permanent failures (selector no longer matches — site layout changed).
- Per-source health tracking: flag a price source as "broken" after N consecutive failures instead of silently retrying forever; surface this in the dashboard so the tenant knows a source needs attention.
- Alert delivery reliability: confirm Resend failures are retried/logged, not silently dropped.
- Add monitoring/alerting for the operator (you) — e.g. a daily summary of scrape success rate — separate from tenant-facing alerts.

**Definition of done:** a broken scraper degrades gracefully and is visible in-dashboard within one scrape cycle, not discovered via a support ticket.

---

## Phase 4 — Growth features

**Goal:** features that make PriceVault stickier for DACH e-commerce operators, without violating Phase 1–3 invariants.

- Shopify/WooCommerce connector groundwork (GrowVault.de is the anchor proof-of-concept customer — build against its actual catalog structure, not a generic mock store).
- Historical price-trend charts per product (this is a data-viz task — check for an existing charting choice in `dashboard/package.json` before adding a new library).
- Configurable alert rules beyond simple price-drop (e.g. % threshold, back-in-stock, competitor undercut by X%).
- Multi-source comparison view (same product tracked across multiple competitor URLs).

**Definition of done:** each growth feature ships behind the existing plan-gating from Phase 2 — don't make growth features universally free without confirming that's intended.

---

## How to work each phase in Codex

1. Load `AGENTS.md` + this phase's section only.
2. State the plan in 3–5 bullets before writing code — catches scope drift early and cheaply.
3. Patch, don't rewrite, existing files.
4. Run the two verify commands from `AGENTS.md` before declaring the task done.
5. If a task touches both `backend/` and `dashboard/`, do them as two explicit sub-steps, not one blended diff.
