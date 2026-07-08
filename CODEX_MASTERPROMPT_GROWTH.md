# PriceVault — Codex Masterprompt (Growth Phases 5–10)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining product gaps between "working price tracker" and "fully viable SaaS": deeper repricing strategies, promo detection, MAP compliance monitoring, agency multi-client workspace, a signed outbound integration surface, and a catalog-wide benchmark view.

**Architecture:** Every phase extends an existing subsystem (repricing agent, alert agent, alert channels, dashboard App Router) rather than adding new infrastructure. All new tables go into `backend/db/schema.sql` (authoritative, no Alembic). All new API surface is plan-gated via `backend/auth/plan_guard.py`. All dashboard copy is German.

**Tech Stack:** FastAPI + Supabase (Python 3.12), ARQ/Redis workers, Next.js 16 App Router + Tailwind, Resend. No new dependencies in any phase.

## Global Constraints

- Every query, job, and route is scoped by `tenant_id` (AGENTS.md invariant). Supabase RLS is the enforcement layer for direct table access; API routes enforce via `Depends(get_tenant)` / `require_tenant_admin_from_header`.
- `backend/db/schema.sql` is the source of truth. New DDL is added in two places: (a) inline in the relevant `create table` block for fresh installs, (b) as an idempotent `alter table` block appended near the existing alters (around line 815+) for existing environments. Never touch `backend/db/migrations/`.
- Dashboard user-facing strings are German. Code, comments, commits are English.
- Automatic repricing flags (`ENABLE_AUTOMATIC_REPRICING`, `AUTOMATIC_REPRICING_KILL_SWITCH`) are never changed by these phases.
- Growth features ship behind existing plan gating (`PLAN_LIMITS` / `require_plan` in `backend/auth/plan_guard.py`). Gates per phase are stated explicitly below.
- No new pip/npm dependencies. Charting uses the existing custom SVG component pattern (`dashboard/components/ui/PriceTrendChart.tsx`) — do not add recharts/d3.
- Verify before calling any task done:
  ```
  cd dashboard && npm run lint && npm run build
  cd ../backend && .venv/bin/python -m compileall -q .
  ```
  Plus targeted pytest for new backend tests: `cd backend && .venv/bin/python -m pytest tests/test_growth_features.py -q`
- Work each phase in a separate Codex session. Load `AGENTS.md` + one phase section only.

## Already shipped — do NOT rebuild

Recon on 2026-07-06 confirmed these exist; any task that appears to require them should reuse them:

- **Catalog connectors**: Shopify, WooCommerce, CSV feed, and Google Merchant sync all exist (`backend/jobs/connector_tasks.py`, `backend/routers/connectors/`, `connector_sources` table with all four types).
- **Repricing basics**: `match_lowest` and `beat_percent` strategies with `min_margin_pct` floor, `max_change_pct` clamp, manual/automatic approval, rollback (`backend/agents/repricing_agent.py`, `repricing_rules` table).
- **Stock alerts**: `out_of_stock` / `back_in_stock` conditions with `previous_in_stock` transition detection (`backend/agents/alert_agent.py:27-30`); `price_snapshots.in_stock` and `price_type in ('regular','sale',…)` are already captured.
- **Alert channels**: email, webhook, Slack with encrypted config (`backend/routers/alert_channels.py`, `backend/jobs/alert_tasks.py`).
- **Team roles**: owner/admin/analyst/viewer/billing/member with cross-tenant membership (`team_members` table, `dashboard/lib/backend.ts:currentTenant()`).
- **API keys** (`backend/routers/api_keys.py`, `backend/auth/api_key_middleware.py`).

---

## Phase 5 — Repricing strategy depth

**Goal:** Support premium positioning ("stay X% above the cheapest competitor") and per-rule competitor scoping ("only react to these competitors"), turning the repricer from a race-to-the-bottom tool into a positioning engine.

**Use case:** A DACH shop selling branded goods doesn't want to be cheapest — it wants to sit 3% above the discounter but never lose more than that gap. A second shop wants rules that ignore marketplace resellers and only track two serious rivals.

**Plan gate:** unchanged — rules stay available on all plans; `automatic` approval stays agency-only.

**Files:**
- Modify: `backend/db/schema.sql` (repricing_rules: strategy check, `competitor_ids` column)
- Modify: `backend/models/schemas.py:127-147` (`RepricingRuleCreate` / `RepricingRuleUpdate`)
- Modify: `backend/agents/repricing_agent.py:46-64` (`calculate_suggested_price`) and `generate()` competitor filtering
- Modify: `backend/routers/repricing.py:44-47,64-66` (beat_by_pct normalization)
- Modify: `dashboard/app/dashboard/repricing/` (strategy select + competitor multi-select)
- Test: `backend/tests/test_growth_features.py` (new file)

**Interfaces:**
- Consumes: existing `queries.get_latest_prices(tenant_id)` rows (contain `competitor_id`, `competitor_price`, `variant_id`, `health_status`, `snapshot_id`).
- Produces: `calculate_suggested_price(*, lowest_competitor_price: float, cost_price: float, strategy: str, beat_by_pct: float, min_margin_pct: float) -> tuple[float, float]` now accepting `strategy="stay_above_percent"`. `repricing_rules.competitor_ids: uuid[] | null` (null = all competitors).

### Task 5.1: Schema — new strategy + competitor scoping

- [ ] **Step 1: Update the inline `create table public.repricing_rules` block** (`backend/db/schema.sql:217-234`):

```sql
  strategy        text not null check (strategy in ('match_lowest','beat_percent','stay_above_percent')),
  beat_by_pct     numeric(6,2) not null default 0 check (beat_by_pct between 0 and 50),
  competitor_ids  uuid[],
  ...
  check (strategy in ('beat_percent','stay_above_percent') or beat_by_pct = 0)
```

- [ ] **Step 2: Append the idempotent block for existing environments** (next to the other `alter table` statements around line 815):

```sql
alter table public.repricing_rules
  add column if not exists competitor_ids uuid[];
alter table public.repricing_rules
  drop constraint if exists repricing_rules_strategy_check;
alter table public.repricing_rules
  add constraint repricing_rules_strategy_check
  check (strategy in ('match_lowest','beat_percent','stay_above_percent'));
alter table public.repricing_rules
  drop constraint if exists repricing_rules_check;
alter table public.repricing_rules
  add constraint repricing_rules_check
  check (strategy in ('beat_percent','stay_above_percent') or beat_by_pct = 0);
```

Verify the actual constraint names first with `\d public.repricing_rules` semantics: grep schema.sql for how other check-constraint rewrites name themselves and match that pattern.

- [ ] **Step 3: Commit** — `git commit -m "feat: add stay_above_percent strategy and competitor scoping to repricing schema"`

### Task 5.2: Price calculation for stay_above_percent

- [ ] **Step 1: Write the failing tests** in new `backend/tests/test_growth_features.py`:

```python
from agents.repricing_agent import calculate_suggested_price


def test_stay_above_percent_prices_above_lowest():
    suggested, floor = calculate_suggested_price(
        lowest_competitor_price=100.0,
        cost_price=50.0,
        strategy="stay_above_percent",
        beat_by_pct=3.0,
        min_margin_pct=20.0,
    )
    assert suggested == 103.0
    assert floor == 60.0


def test_stay_above_percent_respects_margin_floor():
    suggested, _ = calculate_suggested_price(
        lowest_competitor_price=10.0,
        cost_price=50.0,
        strategy="stay_above_percent",
        beat_by_pct=3.0,
        min_margin_pct=20.0,
    )
    assert suggested == 60.0
```

- [ ] **Step 2: Run to verify failure** — `cd backend && .venv/bin/python -m pytest tests/test_growth_features.py -q` → both FAIL (suggested equals lowest because strategy is unknown).

- [ ] **Step 3: Implement** in `calculate_suggested_price` (`backend/agents/repricing_agent.py`), directly after the `beat_percent` branch:

```python
    if strategy == "stay_above_percent":
        target = lowest * (Decimal("1") + Decimal(str(beat_by_pct)) / Decimal("100"))
```

- [ ] **Step 4: Run tests** → PASS. **Step 5: Commit.**

### Task 5.3: Competitor scoping in generate()

- [ ] **Step 1: Write the failing test** — exercise `RepricingAgent.generate()` scoping via the pure filtering helper. Extract the per-rule price selection into a testable function in `repricing_agent.py`:

```python
def scoped_competitor_prices(
    rows: list[dict], competitor_ids: list[str] | None
) -> list[float]:
    """Prices eligible for a rule; None/empty scope means all competitors."""
    return [
        float(row["competitor_price"])
        for row in rows
        if row.get("competitor_price") is not None
        and (not competitor_ids or row.get("competitor_id") in competitor_ids)
    ]
```

Test:

```python
from agents.repricing_agent import scoped_competitor_prices


def test_scoped_competitor_prices_filters_by_rule_scope():
    rows = [
        {"competitor_id": "a", "competitor_price": 10.0},
        {"competitor_id": "b", "competitor_price": 8.0},
        {"competitor_id": "c", "competitor_price": None},
    ]
    assert scoped_competitor_prices(rows, ["a"]) == [10.0]
    assert scoped_competitor_prices(rows, None) == [10.0, 8.0]
    assert scoped_competitor_prices(rows, ["missing"]) == []
```

- [ ] **Step 2: Run → FAIL (import error). Step 3: Implement the helper, then rewire `generate()`** — replace the pre-computed `price_by_variant` lookup with a per-rule call: after the rule is matched for a variant, compute `competitor_prices = scoped_competitor_prices(evidence_by_variant.get(variant["id"], []), rule.get("competitor_ids"))`. Keep `skipped_no_price` counting behavior. Also filter `evidence_snapshot_ids` with the same scope so evidence matches the prices used.

- [ ] **Step 4: Run full backend tests** — `.venv/bin/python -m pytest -q` → no regressions. **Step 5: Commit.**

### Task 5.4: API surface

- [ ] **Step 1: Extend models** (`backend/models/schemas.py`):

```python
class RepricingRuleCreate(APIModel):
    ...
    strategy: Literal["match_lowest", "beat_percent", "stay_above_percent"]
    competitor_ids: list[str] | None = None
```

Mirror in `RepricingRuleUpdate` (`strategy: Literal[...] | None = None`, `competitor_ids: list[str] | None = None`).

- [ ] **Step 2: Router validation** (`backend/routers/repricing.py`) — the existing `if body.strategy == "match_lowest": values["beat_by_pct"] = 0` stays; additionally validate that every id in `competitor_ids` belongs to the tenant:

```python
    if body.competitor_ids:
        known = {c["id"] for c in await queries.list_competitors(tenant_id)}
        unknown = set(body.competitor_ids) - known
        if unknown:
            raise HTTPException(status_code=404, detail="Mitbewerber nicht gefunden")
```

(Check `queries.py` for the actual list function name — grep `def list_competitors`.)

- [ ] **Step 3: Run backend tests + compileall. Step 4: Commit.**

### Task 5.5: Dashboard rule form

- [ ] **Step 1: Extend the rule create/edit form** in `dashboard/app/dashboard/repricing/` — add the third strategy option and a competitor multi-select (checkbox list fed from the existing competitors fetch). German copy:
  - Strategy label: `Über dem günstigsten Preis bleiben (+X %)`
  - Existing options keep their current labels.
  - Competitor scope: `Nur diese Mitbewerber berücksichtigen` with helper text `Leer lassen, um alle Mitbewerber einzubeziehen.`
  - When `stay_above_percent` is chosen, reuse the existing percent input, labeled `Abstand über dem günstigsten Preis (%)`.

- [ ] **Step 2: Verify** — `cd dashboard && npm run lint && npm run build`. **Step 3: Commit.**

**Definition of done:** a rule can target a subset of competitors and price above the cheapest of them; margin floor still wins; existing rules keep working unchanged.

---

## Phase 6 — Promo/sale detection alerts

**Goal:** Alert tenants when a competitor starts (or ends) a sale, using the `price_type` transition already captured on snapshots.

**Use case:** "Mitbewerber X hat gerade eine Rabattaktion gestartet" is the moment a shop wants to react — before the weekly report.

**Plan gate:** none beyond existing alert limits (`PLAN_LIMITS[plan]["alerts"]`).

**Files:**
- Modify: `backend/db/schema.sql:314` (alerts condition check) + idempotent alter block
- Modify: `backend/models/schemas.py` (`AlertCondition` literal)
- Modify: `backend/agents/alert_agent.py:26-61` (`evaluate`) and the row feed (add `previous_price_type` next to `previous_in_stock` — same query, one more column)
- Modify: `backend/agents/alert_agent.py:81-117` (`_send_email` German copy for the new conditions)
- Modify: `dashboard/app/dashboard/alerts/` (condition dropdown options)
- Test: `backend/tests/test_growth_features.py`

**Interfaces:**
- Consumes: snapshot rows with `price_type` / `previous_price_type` (feed query must emit both — find where `previous_in_stock` is selected in `backend/db/queries.py` and add `price_type` analogously).
- Produces: alert conditions `sale_started`, `sale_ended` (threshold must be null, like the stock conditions).

### Task 6.1: Schema + model

- [ ] **Step 1: Extend the condition check** in the inline `create table public.alerts` block and add the idempotent alter:

```sql
alter table public.alerts drop constraint if exists alerts_condition_check;
alter table public.alerts add constraint alerts_condition_check
  check (condition in ('below_pct','above_pct','below_abs','above_abs',
    'out_of_stock','back_in_stock','undercut_abs','price_drop','price_rise',
    'source_broken','sale_started','sale_ended'));
alter table public.alerts drop constraint if exists alerts_check;
alter table public.alerts add constraint alerts_check
  check (
    (condition in ('out_of_stock','back_in_stock','sale_started','sale_ended') and threshold is null)
    or (condition not in ('out_of_stock','back_in_stock','sale_started','sale_ended') and threshold > 0)
  );
```

Update the inline block to match. Extend `AlertCondition` in `schemas.py` with `"sale_started", "sale_ended"`.

- [ ] **Step 2: Commit.**

### Task 6.2: Evaluation logic (TDD)

- [ ] **Step 1: Failing tests** in `backend/tests/test_growth_features.py`:

```python
from agents.alert_agent import AlertAgent


def test_sale_started_triggers_on_transition_to_sale():
    alert = {"condition": "sale_started"}
    row = {"price_type": "sale", "previous_price_type": "regular"}
    assert AlertAgent.evaluate(alert, row) is True


def test_sale_started_ignores_ongoing_sale():
    alert = {"condition": "sale_started"}
    row = {"price_type": "sale", "previous_price_type": "sale"}
    assert AlertAgent.evaluate(alert, row) is False


def test_sale_ended_triggers_on_transition_back():
    alert = {"condition": "sale_ended"}
    row = {"price_type": "regular", "previous_price_type": "sale"}
    assert AlertAgent.evaluate(alert, row) is True


def test_sale_started_ignores_unknown_previous():
    alert = {"condition": "sale_started"}
    row = {"price_type": "sale", "previous_price_type": None}
    assert AlertAgent.evaluate(alert, row) is False
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement** in `AlertAgent.evaluate`, after the `back_in_stock` branch:

```python
        if alert["condition"] == "sale_started":
            return (
                row.get("price_type") == "sale"
                and row.get("previous_price_type") is not None
                and row.get("previous_price_type") != "sale"
            )
        if alert["condition"] == "sale_ended":
            return (
                row.get("previous_price_type") == "sale"
                and row.get("price_type") is not None
                and row.get("price_type") != "sale"
            )
```

- [ ] **Step 4: Extend the row feed** — locate the query in `backend/db/queries.py` that produces `previous_in_stock` for the alert run and select `price_type` + `previous_price_type` the same way (lag over `scraped_at` per `competitor_product_id`, restricted to `validation_state = 'valid'` like the rest of the feed).

- [ ] **Step 5: Email copy** in `_send_email` — after the `source_broken` detail branch:

```python
        if alert.get("condition") in {"sale_started", "sale_ended"}:
            details.append(
                "Aktionsstart beim Mitbewerber erkannt."
                if alert["condition"] == "sale_started"
                else "Aktionsende beim Mitbewerber erkannt."
            )
```

And subject stays the existing `Preisalarm: …` pattern.

- [ ] **Step 6: Run tests → PASS. Commit.**

### Task 6.3: Dashboard condition options

- [ ] **Step 1:** Add the two options to the alert-condition select in `dashboard/app/dashboard/alerts/`:
  - `sale_started` → `Aktion gestartet (Mitbewerber reduziert)`
  - `sale_ended` → `Aktion beendet`
  Hide the threshold input for these two conditions (same behavior as the stock conditions — reuse the existing conditional).

- [ ] **Step 2: Lint + build. Commit.**

**Definition of done:** a tenant sets "Aktion gestartet" on a product and receives one alert on the regular→sale transition, none while the sale continues, respecting cooldown.

---

## Phase 7 — MAP compliance monitoring (Mindestwerbepreis)

**Goal:** Let brands/distributors define a minimum advertised price per variant and get a persistent, exportable violations register when a tracked reseller advertises below it. Same scraping pipeline, new ICP (brand compliance instead of retailer-vs-retailer).

**Use case:** A DACH manufacturer tracks 30 resellers. When one lists a SKU below the agreed MAP, compliance needs dated evidence (price, URL, snapshot) for an enforcement letter — not just an email.

**Plan gate:** `require_plan("pro")` for all MAP endpoints; page hidden below pro.

**Files:**
- Modify: `backend/db/schema.sql` (`product_variants.map_price`, new `map_violations` table, alerts condition, grants + RLS following neighboring tables)
- Create: `backend/routers/map_compliance.py`
- Modify: `backend/main.py` (include router — follow how other routers are included)
- Modify: `backend/agents/alert_agent.py` (violation detection during run)
- Modify: `backend/models/schemas.py` (`MapPriceUpdate`, `AlertCondition` +`map_violation`)
- Modify: `dashboard/app/dashboard/products/[id]/` (MAP price field)
- Create: `dashboard/app/dashboard/map/page.tsx` (violations register)
- Test: `backend/tests/test_growth_features.py`

**Interfaces:**
- Produces: `map_violations` rows `{id, tenant_id, product_id, variant_id, competitor_product_id, snapshot_id, map_price, advertised_price, status ('open','acknowledged','resolved'), detected_at, resolved_at}`; endpoints `GET /map/violations?status=`, `PATCH /map/violations/{id}` (status), `GET /map/violations/export` (CSV); `PATCH /products/{id}/variants/{variant_id}` accepts `map_price`.
- Consumes: `evaluate()` rows (which carry `competitor_price`, `snapshot_id`), existing CSV export pattern in `backend/routers/export.py`.

### Task 7.1: Schema

- [ ] **Step 1: DDL** — inline plus idempotent block:

```sql
alter table public.product_variants
  add column if not exists map_price numeric(10,2) check (map_price is null or map_price >= 0);

create table if not exists public.map_violations (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  product_id            uuid not null references public.products(id) on delete cascade,
  variant_id            uuid not null references public.product_variants(id) on delete cascade,
  competitor_product_id uuid not null references public.competitor_products(id) on delete cascade,
  snapshot_id           uuid references public.price_snapshots(id) on delete set null,
  map_price             numeric(10,2) not null,
  advertised_price      numeric(10,2) not null,
  status                text not null default 'open'
                          check (status in ('open','acknowledged','resolved')),
  detected_at           timestamptz not null default now(),
  resolved_at           timestamptz
);

create index if not exists idx_map_violations_tenant_status
  on public.map_violations(tenant_id, status, detected_at desc);
```

Add RLS policy and `grant all … to service_role` following exactly what neighboring tenant-scoped tables do (copy the `alert_events` policy shape). Add `public.map_violations` to the big service_role grant list at the end of schema.sql.

- [ ] **Step 2: Commit.**

### Task 7.2: Violation detection (TDD)

- [ ] **Step 1: Failing test** for the pure detection predicate:

```python
from agents.alert_agent import is_map_violation


def test_map_violation_below_map():
    assert is_map_violation(map_price=49.99, advertised_price=44.90) is True


def test_map_violation_at_or_above_map():
    assert is_map_violation(map_price=49.99, advertised_price=49.99) is False


def test_map_violation_missing_data():
    assert is_map_violation(map_price=None, advertised_price=44.90) is False
    assert is_map_violation(map_price=49.99, advertised_price=None) is False
```

- [ ] **Step 2: Implement** in `alert_agent.py`:

```python
def is_map_violation(*, map_price: float | None, advertised_price: float | None) -> bool:
    if map_price is None or advertised_price is None:
        return False
    return float(advertised_price) < float(map_price)
```

- [ ] **Step 3: Wire into `AlertAgent.run()`** — for each valid row where the variant has `map_price` set and `is_map_violation(...)`, insert a `map_violations` row **only if no open violation already exists** for the same `(variant_id, competitor_product_id)` (dedupe query in `queries.py`: `get_open_map_violation(tenant_id, variant_id, competitor_product_id)`). Add `create_map_violation`, `list_map_violations(tenant_id, status)`, `update_map_violation(tenant_id, violation_id, values)` to `queries.py` following the `list_team_members` Supabase-builder style. The alert condition `map_violation` (threshold null) then flows through the normal `evaluate`/email path:

```python
        if alert["condition"] == "map_violation":
            return is_map_violation(
                map_price=row.get("map_price"),
                advertised_price=row.get("competitor_price"),
            )
```

The row feed must include `map_price` (join `product_variants.map_price` into the feed query). Extend the alerts condition check constraint (same drop/add pattern as Phase 6, adding `map_violation` to both lists — threshold-null group).

- [ ] **Step 4: Email copy** — detail line: `f"Mindestwerbepreis (MAP): {float(row['map_price']):.2f} € — beworbener Preis: {float(row['competitor_price']):.2f} €"`.

- [ ] **Step 5: Run tests, commit.**

### Task 7.3: Router

- [ ] **Step 1: Create `backend/routers/map_compliance.py`:**

```python
"""MAP (minimum advertised price) violation register."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse

from auth.plan_guard import require_plan, require_tenant_admin_from_header
from db import queries
from models.schemas import MapViolationUpdate
from routers import get_tenant
from routers.audit import record_audit_event


router = APIRouter(prefix="/map", tags=["map"], dependencies=[Depends(require_plan("pro"))])


@router.get("/violations")
async def list_violations(
    violation_status: str = Query(default="open", alias="status", pattern="^(open|acknowledged|resolved|all)$"),
    tenant_id: str = Depends(get_tenant),
) -> list[dict]:
    return await queries.list_map_violations(tenant_id, violation_status)


@router.patch("/violations/{violation_id}")
async def update_violation(
    violation_id: str,
    body: MapViolationUpdate,
    tenant: dict = Depends(require_tenant_admin_from_header),
) -> dict:
    values: dict = {"status": body.status}
    if body.status == "resolved":
        values["resolved_at"] = datetime.now(timezone.utc).isoformat()
    updated = await queries.update_map_violation(tenant["id"], violation_id, values)
    if not updated:
        raise HTTPException(status_code=404, detail="MAP-Verstoß nicht gefunden")
    await record_audit_event(
        tenant, action="map_violation.updated",
        resource_type="map_violation", resource_id=violation_id,
        metadata={"status": body.status},
    )
    return updated
```

Schema model:

```python
class MapViolationUpdate(APIModel):
    status: Literal["acknowledged", "resolved"]
```

- [ ] **Step 2: CSV export** — add `GET /map/violations/export` returning `text/csv` built with `csv.DictWriter` (comma-delimited, snake_case English headers — the convention in `backend/routers/export.py:124`): fieldnames `detected_at, product, variant, competitor, url, map_price, advertised_price, status`. Reuse the `StreamingResponse`/`media_type="text/csv"` pattern from `export_csv` in that file.

- [ ] **Step 3: Include router in `main.py`, run compileall + tests, commit.**

### Task 7.4: Dashboard

- [ ] **Step 1: Variant MAP field** — in the product detail page (`dashboard/app/dashboard/products/[id]/`), add an optional `Mindestwerbepreis (MAP) €` input per variant, wired to the existing variant PATCH call.

- [ ] **Step 2: Create `dashboard/app/dashboard/map/page.tsx`** — server component listing violations via `backendFetch('/map/violations?status=open', tenant.id)`. Table columns: `Erkannt am`, `Produkt`, `Mitbewerber`, `MAP-Preis`, `Beworbener Preis`, `Status`, actions `Bestätigen` / `Erledigt`. Empty state: `Keine offenen MAP-Verstöße.` CSV button: `Als CSV exportieren`. Add nav entry `MAP-Überwachung` in the dashboard sidebar (find where `source-health` is registered and add alongside), visible only when `tenant.plan` is pro or agency.

- [ ] **Step 3: Lint + build, commit.**

**Definition of done:** setting a MAP on a variant creates an open violation row (with snapshot evidence id) on the next scrape below MAP, exactly once until resolved; the register is filterable, auditable, and CSV-exportable; everything gated to pro+.

---

## Phase 8 — Agency workspace (multi-client)

**Goal:** Let one user manage multiple tenants (client shops) without logging out: a tenant switcher plus a portfolio overview page. This makes the existing `agency` plan actually usable for agencies.

**Use case:** A DACH marketing agency runs pricing for five client shops. Today `currentTenant()` silently picks the first tenant; the agency needs to switch clients and see all five at a glance.

**Plan gate:** the switcher is available to anyone with ≥2 memberships (it's a navigation primitive); the portfolio page requires `plan === 'agency'` on the *selected* tenant.

**Scope note:** dashboard-only phase — no backend changes. `X-Tenant-ID` + membership checks already authorize any tenant the user belongs to.

**Files:**
- Modify: `dashboard/lib/backend.ts` (`currentTenant()` honors a selection cookie; new `listTenantsForUser()`)
- Create: `dashboard/components/ui/TenantSwitcher.tsx` (client component)
- Create: `dashboard/app/dashboard/portfolio/page.tsx`
- Create: `dashboard/app/api/tenant/select/route.ts` (sets the cookie server-side)
- Test: `dashboard/__tests__/tenant-switcher.test.tsx` (follow the existing test setup in `dashboard/__tests__/`)

**Interfaces:**
- Produces: cookie `pv-tenant` (uuid, `httpOnly`, `sameSite=lax`, path `/`); `listTenantsForUser(): Promise<Tenant[]>` returning every tenant the user owns or is an accepted member of, each with `membership_role`.
- Consumes: existing Supabase queries from `currentTenant()` (`dashboard/lib/backend.ts:4-37`).

### Task 8.1: Tenant listing + cookie-aware currentTenant

- [ ] **Step 1: Refactor `dashboard/lib/backend.ts`** — extract the membership walk in `currentTenant()` into:

```typescript
export async function listTenantsForUser(): Promise<Tenant[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data: tenants } = await supabase
    .from('tenants').select('*').order('created_at', { ascending: true })
  if (!tenants?.length) return []
  const result: Tenant[] = []
  for (const tenant of tenants) {
    if (tenant.user_id === user.id) {
      result.push({ ...tenant, membership_role: 'owner' } as Tenant)
      continue
    }
    const { data: membership } = await supabase
      .from('team_members').select('role,accepted')
      .eq('tenant_id', tenant.id).eq('user_id', user.id).maybeSingle()
    if (membership?.accepted) result.push({ ...tenant, membership_role: membership.role } as Tenant)
  }
  return result
}
```

Then `currentTenant()` becomes: read `pv-tenant` via `cookies()` from `next/headers`; if set and present in `listTenantsForUser()`, return that tenant; otherwise fall back to the current first-match behavior (keep the pending-invite auto-accept logic where it is today).

- [ ] **Step 2: Cookie route** — `dashboard/app/api/tenant/select/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { listTenantsForUser } from '@/lib/backend'

export async function POST(request: Request) {
  const { tenantId } = await request.json()
  const tenants = await listTenantsForUser()
  if (!tenants.some((t) => t.id === tenantId)) {
    return NextResponse.json({ error: 'Kein Zugriff auf diesen Mandanten' }, { status: 403 })
  }
  const response = NextResponse.json({ ok: true })
  response.cookies.set('pv-tenant', tenantId, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365,
  })
  return response
}
```

- [ ] **Step 3: Lint + build, commit.**

### Task 8.2: Switcher UI

- [ ] **Step 1: `TenantSwitcher.tsx`** — client component rendered in the dashboard header/sidebar (find the layout in `dashboard/app/dashboard/layout.tsx`); receives `tenants` and `currentTenantId` as props from the server layout. Renders nothing when `tenants.length < 2`. Dropdown listing tenant names with the active one checked; on select: `await fetch('/api/tenant/select', { method: 'POST', body: JSON.stringify({ tenantId }) })` then `router.refresh()`. German copy: trigger label = current tenant name, list heading `Mandant wechseln`.

- [ ] **Step 2: Test** (`dashboard/__tests__/tenant-switcher.test.tsx`): renders nothing with one tenant; shows both names with two; calls fetch with the picked id. Run `npm run test`.

- [ ] **Step 3: Lint + build + test, commit.**

### Task 8.3: Portfolio page

- [ ] **Step 1: `dashboard/app/dashboard/portfolio/page.tsx`** — server component. If selected tenant's plan ≠ `agency`, render upsell card: `Die Portfolio-Übersicht ist im Agency-Plan verfügbar.` Otherwise, for each tenant from `listTenantsForUser()` where the user's role is in `{owner, admin, analyst}`, fetch in parallel (`Promise.all`) the existing usage endpoint (`backendFetch('/usage', t.id)`) and open alerts/source-health summaries the dashboard already consumes elsewhere (grep `dashboard/app/dashboard/usage/page.tsx` and `source-health/page.tsx` for the exact endpoints and reuse them). Render one card per client: name, plan, `Produkte`, `Aktive Alarme`, `Defekte Quellen`, and a `Öffnen` button that POSTs the tenant selection and navigates to `/dashboard`.

- [ ] **Step 2: Nav entry** `Portfolio` (agency plan only). **Step 3: Lint + build, commit.**

**Definition of done:** a user in two tenants can switch between them without sign-out, the choice persists across sessions, all existing pages respect the selection (they already read `currentTenant()`), and an agency-plan user sees a cross-client portfolio page.

---

## Phase 9 — Outbound integration surface (Teams + signed webhooks)

**Goal:** Make PriceVault embeddable in tenants' own tooling: add Microsoft Teams as an alert channel (DACH B2B standard) and HMAC-sign all webhook deliveries so recipients (including Zapier/Make custom apps) can verify authenticity.

**Use case:** An ops team lives in MS Teams; their ERP consumes price alerts via webhook but currently can't verify the sender.

**Plan gate:** unchanged — alert channels are already gated `require_plan_admin("pro")`.

**Files:**
- Modify: `backend/db/schema.sql:385` (alert_channels type check + idempotent alter)
- Modify: `backend/models/schemas.py:300-307` (`AlertChannelCreate.type` literal)
- Modify: `backend/routers/alert_channels.py` (config key/validation for `teams`, secret generation for `webhook`)
- Modify: `backend/jobs/alert_tasks.py` (teams payload, HMAC signature header)
- Modify: `backend/security/urls.py` only if `validate_delivery_url` needs a teams flag (inspect first — plain https validation likely suffices)
- Modify: `dashboard/app/dashboard/alerts/channels/` (Teams option, secret display-once UI)
- Test: `backend/tests/test_growth_features.py`

**Interfaces:**
- Produces: channel type `teams` (config key `webhook_url`, encrypted like Slack); webhook deliveries carry headers `X-PriceVault-Signature: sha256=<hex hmac>` and `X-PriceVault-Timestamp: <unix>`; signing helper `sign_webhook_payload(secret: str, timestamp: str, body: bytes) -> str` in `backend/security/crypto.py`.
- Consumes: existing `encrypt_secret`/`decrypt_secret` (`backend/security/crypto.py`), `deliver_alert` payload dict.

### Task 9.1: HMAC signing (TDD)

- [ ] **Step 1: Failing test:**

```python
from security.crypto import sign_webhook_payload


def test_webhook_signature_is_deterministic_hmac():
    sig = sign_webhook_payload("secret", "1720000000", b'{"a":1}')
    assert sig == sign_webhook_payload("secret", "1720000000", b'{"a":1}')
    assert sig != sign_webhook_payload("other", "1720000000", b'{"a":1}')
    assert len(sig) == 64  # sha256 hex
```

- [ ] **Step 2: Implement** in `backend/security/crypto.py`:

```python
import hashlib
import hmac


def sign_webhook_payload(secret: str, timestamp: str, body: bytes) -> str:
    message = timestamp.encode() + b"." + body
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
```

- [ ] **Step 3: Wire into `deliver_alert`** (`backend/jobs/alert_tasks.py`) for `type == "webhook"`: serialize the payload once (`body = json.dumps(payload).encode()`), compute timestamp + signature from the channel's stored `signing_secret` (decrypted from `config`), send with `content=body`, `headers={"Content-Type": "application/json", "X-PriceVault-Timestamp": ts, "X-PriceVault-Signature": f"sha256={sig}"}`. Channels without a secret (legacy) send unsigned — no breakage.

- [ ] **Step 4: Secret lifecycle** in `alert_channels.py`: on webhook-channel creation, generate `secrets.token_hex(32)`, store encrypted as `config.signing_secret_ciphertext`, and return the plaintext secret **once** in the creation response under `signing_secret` (document: shown only once). `_public_channel` must never include it afterwards.

- [ ] **Step 5: Run tests, commit.**

### Task 9.2: Teams channel

- [ ] **Step 1: Schema + model** — idempotent alter:

```sql
alter table public.alert_channels drop constraint if exists alert_channels_type_check;
alter table public.alert_channels add constraint alert_channels_type_check
  check (type in ('email','webhook','slack','teams'));
```

`AlertChannelCreate.type: Literal["webhook", "slack", "teams"]`. In `alert_channels.py`, `_config_key`/`_validate_config`/`_public_channel` treat `teams` like `slack` (key `webhook_url`; call `validate_delivery_url(value)` without the slack host restriction — inspect `security/urls.py` first and follow its shape). German error copy: `Teams-Webhook fehlt`.

- [ ] **Step 2: Delivery** in `alert_tasks.py`:

```python
        elif channel["type"] == "teams":
            url = _channel_url(channel)
            validate_delivery_url(url)
            card = {
                "@type": "MessageCard",
                "@context": "https://schema.org/extensions",
                "summary": f"Preisalarm: {payload['product_name']}",
                "themeColor": "0B6E4F",
                "title": f"Preisalarm: {payload['product_name']}",
                "text": (
                    f"Preisänderung: {payload['old_price']:.2f} EUR → {payload['new_price']:.2f} EUR "
                    f"({payload['delta_pct']:+.1f} %)\n\n[Produkt öffnen]({payload['product_url']})"
                ),
            }
            response = await client.post(url, json=card, timeout=10)
```

Mirror the status/`alert_channel_deliveries` bookkeeping the slack branch does.

- [ ] **Step 3: Test** — evaluate the card builder as a pure function if the branch grows; otherwise cover via the existing channel-delivery test pattern (grep `deliver_alert` in `backend/tests/` and extend it for teams + signature headers).

- [ ] **Step 4: Dashboard** (`dashboard/app/dashboard/alerts/channels/`): add `Microsoft Teams` to the channel-type select; on webhook creation show the one-time secret in a copy-to-clipboard box with copy `Signatur-Secret — wird nur einmal angezeigt. Verifiziere eingehende Webhooks mit HMAC-SHA256 über "timestamp.body".`

- [ ] **Step 5: Lint + build + tests, commit.**

**Definition of done:** a Teams webhook receives a formatted MessageCard on alert; webhook recipients can verify `sha256=HMAC(secret, timestamp + "." + body)`; legacy webhook channels keep working unsigned.

---

## Phase 10 — Catalog price-position benchmark

**Goal:** A single view answering "where does my whole catalog sit versus the market": per-variant price rank against latest valid competitor prices, aggregated into position buckets.

**Use case:** The shop owner (or their boss) wants one screen — "you are cheapest on 12 products, within 5 % on 30, overpriced on 8" — instead of clicking through 50 product pages.

**Plan gate:** `require_plan("pro")`.

**Files:**
- Create: `backend/routers/benchmark.py` (+ include in `main.py`)
- Modify: `backend/db/queries.py` (reuse `get_latest_prices`; add nothing unless a column is missing)
- Create: `dashboard/app/dashboard/benchmark/page.tsx`
- Create: `dashboard/components/ui/BenchmarkBar.tsx` (SVG, PriceTrendChart pattern)
- Test: `backend/tests/test_growth_features.py`

**Interfaces:**
- Produces: `GET /benchmark` →

```json
{
  "summary": {"cheapest": 12, "within_5_pct": 30, "mid": 5, "most_expensive": 8, "no_data": 3},
  "rows": [
    {"product_id": "…", "variant_id": "…", "product_name": "…", "our_price": 19.99,
     "lowest": 18.5, "highest": 24.0, "rank": 2, "of": 5, "delta_to_lowest_pct": 8.1,
     "position": "within_5_pct"}
  ]
}
```

- Consumes: `queries.get_latest_prices(tenant_id)` rows (valid snapshots only) + `queries.list_product_variants(tenant_id, active_only=True)`.

### Task 10.1: Position computation (TDD)

- [ ] **Step 1: Failing tests:**

```python
from routers.benchmark import classify_position, compute_rank


def test_rank_counts_cheaper_competitors():
    assert compute_rank(our_price=19.99, competitor_prices=[18.5, 21.0, 24.0]) == (2, 4)


def test_cheapest_position():
    assert classify_position(our_price=17.0, lowest=18.5) == "cheapest"


def test_within_5_pct():
    assert classify_position(our_price=19.0, lowest=18.5) == "within_5_pct"


def test_most_expensive_when_above_all():
    # our 25.0 vs lowest 18.5 → +35 %
    assert classify_position(our_price=25.0, lowest=18.5) == "most_expensive"
```

- [ ] **Step 2: Implement** in `backend/routers/benchmark.py`:

```python
"""Catalog-wide price position benchmark."""

from fastapi import APIRouter, Depends

from auth.plan_guard import require_plan
from db import queries
from routers import get_tenant


router = APIRouter(prefix="/benchmark", tags=["benchmark"], dependencies=[Depends(require_plan("pro"))])


def compute_rank(*, our_price: float, competitor_prices: list[float]) -> tuple[int, int]:
    cheaper = sum(1 for price in competitor_prices if price < our_price)
    return cheaper + 1, len(competitor_prices) + 1


def classify_position(*, our_price: float, lowest: float) -> str:
    if our_price <= lowest:
        return "cheapest"
    delta_pct = (our_price - lowest) / lowest * 100
    if delta_pct <= 5:
        return "within_5_pct"
    if delta_pct <= 15:
        return "mid"
    return "most_expensive"


@router.get("")
async def benchmark(tenant_id: str = Depends(get_tenant)) -> dict:
    variants = await queries.list_product_variants(tenant_id, active_only=True)
    prices = await queries.get_latest_prices(tenant_id)
    by_variant: dict[str, list[float]] = {}
    for row in prices:
        if row.get("competitor_price") is not None:
            by_variant.setdefault(row["variant_id"], []).append(float(row["competitor_price"]))
    summary = {"cheapest": 0, "within_5_pct": 0, "mid": 0, "most_expensive": 0, "no_data": 0}
    rows = []
    for variant in variants:
        our_price = variant.get("our_price")
        competitor_prices = by_variant.get(variant["id"], [])
        if our_price is None or not competitor_prices:
            summary["no_data"] += 1
            continue
        our = float(our_price)
        lowest, highest = min(competitor_prices), max(competitor_prices)
        rank, of = compute_rank(our_price=our, competitor_prices=competitor_prices)
        position = classify_position(our_price=our, lowest=lowest)
        summary[position] += 1
        rows.append({
            "product_id": variant["product_id"],
            "variant_id": variant["id"],
            "product_name": variant.get("product_name") or variant.get("name"),
            "our_price": our, "lowest": lowest, "highest": highest,
            "rank": rank, "of": of,
            "delta_to_lowest_pct": round((our - lowest) / lowest * 100, 1) if lowest else None,
            "position": position,
        })
    rows.sort(key=lambda r: -(r["delta_to_lowest_pct"] or 0))
    return {"summary": summary, "rows": rows}
```

Note: `queries.list_product_variants` (`backend/db/queries.py:401`) selects `*` from `product_variants` only — the product name is **not** joined. Extend its select to `"*, products(name)"` (Supabase embedded resource syntax, as used elsewhere in `queries.py` — grep `products(` for an example) and read it via `variant.get("products", {}).get("name")`, rather than issuing a second query per variant.

- [ ] **Step 3: Include router in `main.py`. Run tests → PASS. Commit.**

### Task 10.2: Dashboard page

- [ ] **Step 1: `dashboard/app/dashboard/benchmark/page.tsx`** — server component fetching `/benchmark`. Layout: four stat tiles (`Günstigster Anbieter`, `Innerhalb 5 %`, `Mittelfeld`, `Teuerster Anbieter`) + `Ohne Vergleichsdaten` as muted footnote; below, a table sorted by worst position first: `Produkt`, `Dein Preis`, `Günstigster Mitbewerber`, `Abstand`, `Rang` (rendered `2 von 5`), plus a per-row `BenchmarkBar` — a horizontal SVG range bar showing lowest→highest with a marker for our price (build it in the style of `dashboard/components/ui/PriceTrendChart.tsx`; no chart library). Row links to `/dashboard/products/[id]`. Non-pro tenants see the upsell card: `Der Markt-Benchmark ist ab dem Pro-Plan verfügbar.`

- [ ] **Step 2: Nav entry** `Benchmark`. **Step 3: Lint + build, commit.**

**Definition of done:** a pro tenant sees their whole catalog's market position on one page with correct bucket counts, worst offenders first, driven only by `validation_state='valid'` snapshot data.

---

## Suggested order & why

1. **Phase 5** (repricing depth) — highest leverage, smallest risk, pure extension of a tested engine.
2. **Phase 6** (promo alerts) — smallest phase; data is already captured.
3. **Phase 10** (benchmark) — read-only, no schema risk, big demo value for sales.
4. **Phase 9** (Teams + signing) — unlocks ERP/Zapier stories; independent of the rest.
5. **Phase 8** (agency workspace) — dashboard-only, but touches the tenant-resolution path every page uses, so do it when there's attention for regression testing.
6. **Phase 7** (MAP) — biggest build and a new ICP; do it last, ideally after validating demand with one brand/distributor prospect.

Phases are mutually independent — any can be dropped or reordered except that both 6 and 7 rewrite the `alerts` condition check constraint; whichever ships second must include the first's condition values in its `drop/add constraint` block.
