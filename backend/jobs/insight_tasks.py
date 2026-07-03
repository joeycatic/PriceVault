"""Background product insight generation."""

from agents.insight_agent import InsightAgent
from db.client import supabase_context
from utils.logger import get_logger


logger = get_logger("jobs.insights")


async def generate_product_insight(
    ctx: dict, *, tenant_id: str, competitor_product_id: str
) -> dict[str, str]:
    job_id = str(ctx.get("job_id") or "")
    with supabase_context(admin=True):
        result = await InsightAgent().generate_for_source(tenant_id, competitor_product_id)
    logger.info(
        "product_insight_complete",
        action="product_insight_complete",
        tenant_id=tenant_id,
        job_id=job_id,
        result=result,
    )
    return result
