"""PriceVault FastAPI application entry point."""

import asyncio
import os
import time
from datetime import datetime, timezone
from uuid import uuid4

import sentry_sdk
import structlog.contextvars
from arq import create_pool
from arq.connections import RedisSettings
from fastapi import FastAPI, HTTPException, Request, status
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from db.client import check_supabase_admin_connection
from jobs.worker_status import worker_autoscaling_signals
from middleware.rate_limit import TenantPlanRateLimitMiddleware, limiter
from routers import admin, alert_channels, alerts, api_keys, benchmark, billing, competitors, export, integrations, map_compliance, onboarding, privacy, products, public, repricing, reports, scrape, settings, snapshots, sources as source_validation, team, usage, webhooks
from routers.connectors import shopify, sources
from utils.logger import configure_logging, get_logger


configure_logging()
logger = get_logger("api")

sentry_sdk.init(
    dsn=os.environ.get("SENTRY_DSN_BACKEND"),
    environment=os.environ.get("ENV", "development"),
    traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.2")),
)

app = FastAPI(
    title="PriceVault API",
    version="1.0.0",
    description="Competitor price tracking for DACH e-commerce operators.",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(TenantPlanRateLimitMiddleware)

app.include_router(scrape.router)
app.include_router(competitors.router)
app.include_router(products.router)
app.include_router(repricing.router)
app.include_router(benchmark.router)
app.include_router(map_compliance.router)
app.include_router(snapshots.router)
app.include_router(alerts.router)
app.include_router(onboarding.router)
app.include_router(billing.router)
app.include_router(webhooks.router)
app.include_router(api_keys.router)
app.include_router(alert_channels.router)
app.include_router(export.router)
app.include_router(team.router)
app.include_router(sources.router)
app.include_router(source_validation.router)
app.include_router(shopify.router)
app.include_router(integrations.router)
app.include_router(settings.router)
app.include_router(reports.router)
app.include_router(privacy.router)
app.include_router(admin.router)
app.include_router(usage.router)
app.include_router(public.router)


@app.middleware("http")
async def request_logging_context(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid4())
    tenant_id = request.headers.get("X-Tenant-ID")
    scrape_job_id = request.headers.get("X-Scrape-Job-ID")
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(
        request_id=request_id,
        tenant_id=tenant_id,
        scrape_job_id=scrape_job_id,
        method=request.method,
        path=request.url.path,
    )
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception(
            "request_failed",
            action="request_failed",
            duration_ms=round((time.perf_counter() - started) * 1000, 2),
        )
        structlog.contextvars.clear_contextvars()
        raise

    response.headers["X-Request-ID"] = request_id
    logger.info(
        "request_complete",
        action="request_complete",
        status_code=response.status_code,
        user_id=getattr(request.state, "user_id", None),
        duration_ms=round((time.perf_counter() - started) * 1000, 2),
    )
    structlog.contextvars.clear_contextvars()
    return response


async def _check_database() -> dict[str, str]:
    await asyncio.to_thread(check_supabase_admin_connection)
    return {"target": "supabase"}


async def _check_worker_queue() -> dict[str, float | int | str]:
    redis_url = os.environ.get("REDIS_URL")
    if not redis_url:
        raise RuntimeError("REDIS_URL is not configured")
    redis = await create_pool(RedisSettings.from_dsn(redis_url))
    try:
        return await worker_autoscaling_signals(
            redis,
            max_jobs=int(os.environ.get("ARQ_MAX_JOBS", "10")),
        )
    finally:
        await redis.aclose()


async def _check_scheduler_liveness() -> dict[str, str | float]:
    redis_url = os.environ.get("REDIS_URL")
    if not redis_url:
        raise RuntimeError("REDIS_URL is not configured")
    redis = await create_pool(RedisSettings.from_dsn(redis_url))
    try:
        value = await redis.get("pricevault:scheduler:heartbeat")
        if not value:
            raise RuntimeError("scheduler heartbeat is missing")
        observed = value.decode() if isinstance(value, bytes) else str(value)
        observed_at = datetime.fromisoformat(observed.replace("Z", "+00:00"))
        age_seconds = (datetime.now(timezone.utc) - observed_at).total_seconds()
        max_age = int(os.environ.get("SCHEDULER_HEARTBEAT_MAX_AGE_SECONDS", "180"))
        if age_seconds > max_age:
            raise RuntimeError("scheduler heartbeat is stale")
        return {"last_seen_at": observed, "age_seconds": round(age_seconds, 1)}
    finally:
        await redis.aclose()


@app.get("/health", tags=["system"])
async def health() -> dict[str, object]:
    checks: dict[str, object] = {}
    healthy = True
    for name, probe in (
        ("database", _check_database),
        ("worker_queue", _check_worker_queue),
        ("scheduler", _check_scheduler_liveness),
    ):
        try:
            result = await probe()
            checks[name] = {"status": "ok", **result}
        except Exception as exc:
            healthy = False
            checks[name] = {"status": "error", "error": type(exc).__name__}

    if not healthy:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"status": "unhealthy", "checks": checks},
        )
    return {"status": "ok", "checks": checks}


@app.get("/health/worker", tags=["system"])
async def worker_health() -> dict[str, float | int | str]:
    try:
        return await _check_worker_queue()
    except RuntimeError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="REDIS_URL ist nicht konfiguriert",
        )
