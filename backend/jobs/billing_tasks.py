"""Viva subscription renewal jobs."""

from datetime import datetime, timezone

from arq import Retry

from db import queries
from db.client import supabase_context
from payments import viva
from webhooks.viva_handler import next_month


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
    try:
        transaction_id = await viva.create_recurring_payment(
            initial_transaction_id=initial_transaction_id,
            amount_cents=viva.PLAN_AMOUNTS[plan],
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
        if attempt >= 3:
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
            raise
        with supabase_context(admin=True):
            await queries.update_tenant(
                tenant_id,
                {
                    "failed_payment_count": attempt,
                    "last_payment_error": str(exc)[:1000],
                    "next_payment_retry_at": retry_iso,
                },
            )
        raise Retry(defer=60 * (5 ** (attempt - 1))) from exc

    now = datetime.now(timezone.utc)
    with supabase_context(admin=True):
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
    return {"transaction_id": transaction_id}
