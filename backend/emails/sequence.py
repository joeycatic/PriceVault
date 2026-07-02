"""Onboarding sequence scheduling."""

from datetime import timedelta


async def schedule_onboarding_sequence(tenant_id: str, email: str, redis_pool) -> None:
    delays = [0, 3, 7]
    templates = ["onboarding_day0", "onboarding_day3", "onboarding_day7"]
    for delay, template in zip(delays, templates, strict=True):
        await redis_pool.enqueue_job(
            "send_email",
            tenant_id=tenant_id,
            to=email,
            template=template,
            _defer_by=timedelta(days=delay),
        )
