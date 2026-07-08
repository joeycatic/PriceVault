"""Viva subscription renewal jobs."""

from datetime import datetime, timedelta, timezone

from arq import Retry

from db import queries
from db.client import supabase_context
from payments import viva
from payments.invoices import create_paid_invoice
from webhooks.viva_handler import next_month


async def reconcile_viva_day(ctx: dict) -> dict[str, int | str]:
    del ctx
    today = datetime.now(timezone.utc).date()
    target_date = today - timedelta(days=1)
    since = datetime.combine(target_date, datetime.min.time(), tzinfo=timezone.utc)
    until = since + timedelta(days=1)
    with supabase_context(admin=True):
        orders = [
            order
            for order in await queries.list_paid_billing_orders_since(since.isoformat())
            if order.get("paid_at") and datetime.fromisoformat(str(order["paid_at"]).replace("Z", "+00:00")) < until
        ]
        await queries.upsert_billing_reconciliation(
            {"reconciliation_date": target_date.isoformat(), "status": "running"}
        )
    database_total = sum(int(order["amount_cents"]) for order in orders)
    provider_total = 0
    mismatches: list[str] = []
    try:
        for order in orders:
            transaction_id = order.get("transaction_id")
            if not transaction_id:
                mismatches.append(str(order["id"]))
                continue
            transaction = await viva.retrieve_transaction(str(transaction_id))
            amount = transaction.get("amount", transaction.get("Amount", 0))
            status_id = transaction.get("statusId", transaction.get("StatusId"))
            amount_cents = round(float(amount or 0) * 100)
            provider_total += amount_cents
            if status_id != "F" or amount_cents != int(order["amount_cents"]):
                mismatches.append(str(order["id"]))
        status_value = "matched" if not mismatches and provider_total == database_total else "mismatch"
    except viva.VivaAPIError as exc:
        status_value = "failed"
        mismatches.append(type(exc).__name__)
    with supabase_context(admin=True):
        await queries.upsert_billing_reconciliation(
            {
                "reconciliation_date": target_date.isoformat(),
                "status": status_value,
                "provider_total_cents": provider_total,
                "database_total_cents": database_total,
                "evidence": {"order_count": len(orders), "mismatches": mismatches},
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
        )
    return {"status": status_value, "orders": len(orders)}


async def enqueue_due_viva_renewals(ctx: dict) -> int:
    now = datetime.now(timezone.utc)
    with supabase_context(admin=True):
        subscriptions = await queries.list_due_viva_subscriptions(now.isoformat())
        ended = await queries.list_ended_viva_subscriptions(now.isoformat())
        for subscription in ended:
            await queries.update_tenant(
                subscription["id"],
                {
                    "plan": "free",
                    "subscription_plan": None,
                    "subscription_current_period_end": None,
                    "subscription_cancel_at_period_end": False,
                    "cancellation_effective_at": None,
                    "subscription_status": "canceled",
                },
            )
            await queries.upsert_subscription(
                subscription["id"],
                {
                    "plan": None,
                    "status": "canceled",
                    "current_period_end": None,
                    "cancel_at_period_end": False,
                    "cancellation_effective_at": None,
                },
            )
    queued = 0
    for subscription in subscriptions:
        period = str(subscription["subscription_current_period_end"])[:10]
        job = await ctx["redis"].enqueue_job(
            "renew_viva_subscription",
            tenant_id=subscription["id"],
            plan=subscription["subscription_plan"],
            initial_transaction_id=str(subscription["viva_initial_transaction_id"]),
            source_code=subscription["viva_source_code"] or "Default",
            period=period,
            _job_id=f"viva-renew-{subscription['id']}-{period}",
        )
        if job:
            queued += 1
    return queued


async def renew_viva_subscription(
    ctx: dict,
    *,
    tenant_id: str,
    plan: str,
    initial_transaction_id: str,
    source_code: str,
    period: str,
) -> dict[str, str]:
    idempotency_key = f"pricevault:{tenant_id}:{period}"
    billing_tenant = None
    if ctx.get("redis"):
        with supabase_context(admin=True):
            billing_tenant = await queries.get_tenant_by_id(tenant_id)
    amount_cents = (
        viva.PLAN_NET_AMOUNTS[plan]
        if billing_tenant and billing_tenant.get("tax_treatment") == "eu_reverse_charge"
        else viva.PLAN_AMOUNTS[plan]
    )
    try:
        transaction_id = await viva.create_recurring_payment(
            initial_transaction_id=initial_transaction_id,
            amount_cents=amount_cents,
            source_code=source_code,
            idempotency_key=idempotency_key,
        )
    except viva.VivaConfigurationError:
        raise
    except viva.VivaAPIError as exc:
        attempt = int(ctx.get("job_try", 1))
        retry_at = None if attempt >= 3 else datetime.now(timezone.utc).timestamp() + 60 * (5 ** (attempt - 1))
        retry_iso = (
            datetime.fromtimestamp(retry_at, tz=timezone.utc).isoformat()
            if retry_at
            else None
        )
        tenant = None
        final_attempt = attempt >= 3
        if final_attempt:
            with supabase_context(admin=True):
                await queries.update_tenant(
                    tenant_id,
                    {
                        "subscription_status": "past_due",
                        "failed_payment_count": attempt,
                        "last_payment_error": str(exc)[:1000],
                        "next_payment_retry_at": None,
                    },
                )
                await queries.upsert_subscription(
                    tenant_id,
                    {
                        "plan": plan,
                        "status": "past_due",
                        "current_period_end": period,
                        "viva_card_token": initial_transaction_id,
                        "viva_source_code": source_code,
                        "failed_payment_count": attempt,
                        "last_payment_error": str(exc)[:1000],
                        "next_payment_retry_at": None,
                    },
                )
        else:
            with supabase_context(admin=True):
                await queries.update_tenant(
                    tenant_id,
                    {
                        "failed_payment_count": attempt,
                        "last_payment_error": str(exc)[:1000],
                        "next_payment_retry_at": retry_iso,
                    },
                )
                await queries.upsert_subscription(
                    tenant_id,
                    {
                        "plan": plan,
                        "status": "active",
                        "current_period_end": period,
                        "viva_card_token": initial_transaction_id,
                        "viva_source_code": source_code,
                        "failed_payment_count": attempt,
                        "last_payment_error": str(exc)[:1000],
                        "next_payment_retry_at": retry_iso,
                    },
                )
        if ctx.get("redis"):
            with supabase_context(admin=True):
                tenant = await queries.get_tenant_by_id(tenant_id)
            email = (tenant or {}).get("invoice_email")
        else:
            email = None
        if email:
            await ctx["redis"].enqueue_job(
                "send_email",
                tenant_id=tenant_id,
                to=email,
                template="payment_failed",
                _job_id=f"dunning-{tenant_id}-{period}-{attempt}",
            )
        if final_attempt:
            raise
        raise Retry(defer=60 * (5 ** (attempt - 1))) from exc

    now = datetime.now(timezone.utc)
    with supabase_context(admin=True):
        tenant = await queries.get_tenant_by_id(tenant_id)
        if not tenant:
            return {"status": "missing"}
        await create_paid_invoice(
            tenant=tenant,
            plan=plan,
            transaction_id=transaction_id,
            paid_at=now.isoformat(),
        )
        await queries.update_tenant(
            tenant_id,
            {
                "plan": plan,
                "subscription_status": "active",
                "subscription_current_period_end": next_month(now).isoformat(),
                "subscription_cancel_at_period_end": False,
                "cancellation_effective_at": None,
                "failed_payment_count": 0,
                "last_payment_error": None,
                "next_payment_retry_at": None,
            },
        )
        await queries.upsert_subscription(
            tenant_id,
            {
                "plan": plan,
                "status": "active",
                "current_period_end": next_month(now).isoformat(),
                "viva_card_token": initial_transaction_id,
                "viva_source_code": source_code,
                "cancel_at_period_end": False,
                "cancellation_effective_at": None,
                "failed_payment_count": 0,
                "last_payment_error": None,
                "next_payment_retry_at": None,
                "metadata": {"provider": "viva", "renewal_transaction_id": transaction_id},
            },
        )
    return {"transaction_id": transaction_id}
