"""Atomic daily scrape-slot reservations shared by API and cron enqueue paths."""

from datetime import datetime, timedelta, timezone

from db import queries
from auth.plan_guard import plan_limit


RESERVE_SCRIPT = """
local current = redis.call('GET', KEYS[1])
if not current then
  current = tonumber(ARGV[1])
else
  current = tonumber(current)
end
local limit = tonumber(ARGV[2])
local requested = tonumber(ARGV[3])
local available = math.max(0, limit - current)
local reserved = math.min(available, requested)
redis.call('SET', KEYS[1], current + reserved, 'EX', tonumber(ARGV[4]))
return reserved
"""

RELEASE_SCRIPT = """
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local released = tonumber(ARGV[1])
local updated = math.max(0, current - released)
redis.call('SET', KEYS[1], updated, 'KEEPTTL')
return updated
"""


def _utc_day() -> tuple[str, str, int]:
    now = datetime.now(timezone.utc)
    start = datetime.combine(now.date(), datetime.min.time(), tzinfo=timezone.utc)
    tomorrow = start + timedelta(days=1)
    return now.date().isoformat(), start.isoformat(), max(60, int((tomorrow - now).total_seconds()))


async def reserve_scrape_slots(
    redis, *, tenant_id: str, plan: str | None, requested: int
) -> int:
    if requested <= 0:
        return 0
    limit = plan_limit(plan, "scrapes_per_day")
    if limit is None:
        return requested
    day, since, ttl = _utc_day()
    persisted = await queries.count_snapshots_since(tenant_id, since)
    reserved = await redis.eval(
        RESERVE_SCRIPT,
        1,
        f"scrape-quota:{tenant_id}:{day}",
        persisted,
        limit,
        requested,
        ttl,
    )
    return int(reserved)


async def release_scrape_slots(redis, *, tenant_id: str, count: int) -> None:
    if count <= 0:
        return
    day, _, _ = _utc_day()
    await redis.eval(RELEASE_SCRIPT, 1, f"scrape-quota:{tenant_id}:{day}", count)
