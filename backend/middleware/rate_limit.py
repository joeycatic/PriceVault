"""Per-tenant API rate limiting helpers."""

from datetime import datetime, timedelta, timezone
import os
from typing import Any

from fastapi import Request
from redis.asyncio import Redis
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response
from slowapi import Limiter
from slowapi.util import get_remote_address

from db import queries
from db.client import supabase_context

PLAN_LIMITS = {
    "free": 50,
    "trial": 50,
    "starter": 500,
    "pro": 500,
    "agency": 5000,
}


def get_tenant_id(request: Request) -> str:
    tenant_id = getattr(request.state, "tenant_id", None)
    if tenant_id:
        return str(tenant_id)
    header_value = request.headers.get("X-Tenant-ID")
    if header_value:
        return header_value
    return get_remote_address(request)


limiter = Limiter(key_func=get_tenant_id, default_limits=["5000/day"])


class TenantPlanRateLimitMiddleware(BaseHTTPMiddleware):
    """Daily plan guard for browser-backed scrape endpoints."""

    def __init__(self, app: Any) -> None:
        super().__init__(app)
        self._counts: dict[tuple[str, str], int] = {}
        self._redis_url = os.environ.get("REDIS_URL")

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        if not request.url.path.startswith("/scrape/"):
            return await call_next(request)

        tenant_id = request.headers.get("X-Tenant-ID")
        if not tenant_id:
            return await call_next(request)

        day = datetime.now(timezone.utc).date().isoformat()
        key = (tenant_id, day)
        plan = "free"
        auth_header = request.headers.get("Authorization")
        access_token = (
            auth_header.removeprefix("Bearer ").strip()
            if auth_header and auth_header.startswith("Bearer ")
            else None
        )
        if not access_token:
            return await call_next(request)
        try:
            with supabase_context(access_token=access_token):
                tenant = await queries.get_tenant_by_id(tenant_id)
                if tenant:
                    plan = tenant.get("plan", "free")
        except Exception:
            return await call_next(request)
        if not tenant:
            return await call_next(request)

        limit = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])
        current = await self._increment_count(key, day)
        if current > limit:
            return JSONResponse(
                {"detail": "Tageslimit für diesen Plan erreicht"},
                status_code=429,
            )
        request.state.tenant_id = tenant_id
        request.state.plan = plan
        return await call_next(request)

    async def _increment_count(self, key: tuple[str, str], day: str) -> int:
        if self._redis_url:
            try:
                redis = Redis.from_url(self._redis_url)
                redis_key = f"quota:{key[0]}:{day}"
                current = await redis.incr(redis_key)
                if current == 1:
                    await redis.expire(redis_key, _seconds_until_next_utc_day())
                await redis.aclose()
                return int(current)
            except Exception:
                pass
        current = self._counts.get(key, 0) + 1
        self._counts[key] = current
        return current


def _seconds_until_next_utc_day() -> int:
    now = datetime.now(timezone.utc)
    tomorrow = datetime.combine(
        now.date() + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc
    )
    return max(60, int(tomorrow.timestamp() - now.timestamp()))
