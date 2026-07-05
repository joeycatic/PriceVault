"""ARQ worker settings and task registry."""

import os

from arq import create_pool
from arq.connections import RedisSettings

from jobs.alert_tasks import deliver_alert
from jobs.billing_tasks import enqueue_due_viva_renewals, reconcile_viva_day, renew_viva_subscription
from jobs.capacity_tasks import evaluate_capacity
from jobs.connector_tasks import sync_connector_run
from jobs.cost_tasks import summarize_operational_costs
from jobs.digest_tasks import enqueue_due_alert_digests, send_alert_digest
from jobs.email_tasks import send_email
from jobs.insight_tasks import generate_product_insight
from jobs.privacy_tasks import execute_due_privacy_deletions
from jobs.report_tasks import enqueue_due_reports, send_report_run
from jobs.repricing_tasks import generate_reprice_suggestions
from jobs.retry import send_to_dlq
from jobs.scrape_tasks import scrape_all, scrape_product, scrape_target
from logging_config import configure_logging


configure_logging()


def redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(os.environ.get("REDIS_URL", "redis://localhost:6379"))


async def startup(ctx: dict) -> None:
    ctx["redis"] = await create_pool(redis_settings())


async def shutdown(ctx: dict) -> None:
    redis = ctx.get("redis")
    if redis:
        await redis.aclose()


class WorkerSettings:
    functions = [
        scrape_target,
        scrape_product,
        scrape_all,
        send_to_dlq,
        send_email,
        deliver_alert,
        enqueue_due_viva_renewals,
        renew_viva_subscription,
        reconcile_viva_day,
        enqueue_due_reports,
        send_report_run,
        sync_connector_run,
        enqueue_due_alert_digests,
        send_alert_digest,
        generate_product_insight,
        generate_reprice_suggestions,
        execute_due_privacy_deletions,
        summarize_operational_costs,
        evaluate_capacity,
    ]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = redis_settings()
    max_jobs = int(os.environ.get("ARQ_MAX_JOBS", "10"))
    job_timeout = int(os.environ.get("ARQ_JOB_TIMEOUT", "120"))
    keep_result = 3600
    retry_jobs = True
    max_tries = int(os.environ.get("SCRAPE_MAX_ATTEMPTS", "3"))
