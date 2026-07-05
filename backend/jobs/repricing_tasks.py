"""Idempotent background repricing generation after fresh market data."""

from agents.repricing_agent import RepricingAgent
from db.client import supabase_context
from utils.logger import get_logger


logger = get_logger("jobs.repricing")


async def generate_reprice_suggestions(ctx: dict, *, tenant_id: str) -> dict[str, int]:
    job_id = str(ctx.get("job_id") or "")
    with supabase_context(admin=True):
        result = await RepricingAgent().generate(tenant_id)
    logger.info(
        "repricing_generation_complete",
        action="repricing_generation_complete",
        tenant_id=tenant_id,
        job_id=job_id,
        result=result,
    )
    return result
