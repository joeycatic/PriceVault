"""PriceVault FastAPI application entry point."""

import os

import sentry_sdk
from arq import create_pool
from arq.connections import RedisSettings
from fastapi import FastAPI, HTTPException, status
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from jobs.worker_status import worker_autoscaling_signals
from middleware.rate_limit import TenantPlanRateLimitMiddleware, limiter
from routers import admin, alert_channels, alerts, api_keys, billing, competitors, export, integrations, onboarding, products, reports, scrape, settings, snapshots, team, webhooks
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
app.include_router(shopify.router)
app.include_router(integrations.router)
app.include_router(settings.router)
app.include_router(reports.router)
app.include_router(admin.router)


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok", "queue": "arq"}


@app.get("/health/worker", tags=["system"])
async def worker_health() -> dict[str, float | int | str]:
    redis_url = os.environ.get("REDIS_URL")
    if not redis_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="REDIS_URL ist nicht konfiguriert",
        )
    redis = await create_pool(RedisSettings.from_dsn(redis_url))
    try:
        return await worker_autoscaling_signals(
            redis,
            max_jobs=int(os.environ.get("ARQ_MAX_JOBS", "10")),
        )
    finally:
        await redis.aclose()
