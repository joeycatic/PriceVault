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
        if attempt >= 3:
            with supabase_context(admin=True):
                await queries.update_tenant(
                    tenant_id,
                    {"plan": "free", "subscription_status": "past_due"},
                )
            raise
        raise Retry(defer=60 * (5 ** (attempt - 1))) from exc

    now = datetime.now(timezone.utc)
    with supabase_context(admin=True):
        await queries.update_tenant(
            tenant_id,
            {
                "plan": plan,
                "subscription_status": "active",
                "subscription_current_period_end": next_month(now).isoformat(),
            },
        )
    return {"transaction_id": transaction_id}
