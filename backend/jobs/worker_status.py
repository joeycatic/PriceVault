"""Worker queue health and autoscaling signal helpers."""

from arq.constants import default_queue_name


def _scale_hint(queued_jobs: int, max_jobs: int) -> str:
    if queued_jobs > max_jobs * 2:
        return "scale_out"
    if queued_jobs == 0:
        return "idle"
    return "steady"


async def worker_autoscaling_signals(
    redis,
    *,
    max_jobs: int,
    queue_name: str = default_queue_name,
) -> dict[str, float | int | str]:
    queued_jobs = int(await redis.zcard(queue_name))
    capacity = max(1, max_jobs)
    return {
        "queue": queue_name,
        "queued_jobs": queued_jobs,
        "max_jobs": capacity,
        "queue_saturation": round(queued_jobs / capacity, 2),
        "scale_hint": _scale_hint(queued_jobs, capacity),
    }
