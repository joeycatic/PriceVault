"""Onboarding workflow endpoints."""

import os

from arq import create_pool
from arq.connections import RedisSettings
from fastapi import APIRouter, Depends, HTTPException, status

from auth.plan_guard import require_owner
from db import queries
from emails.sequence import schedule_onboarding_sequence
from models.schemas import OnboardingSequenceRequest


router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.post("/sequence")
async def schedule_sequence(
    body: OnboardingSequenceRequest, tenant: dict = Depends(require_owner)
) -> dict[str, bool]:
    session_email = tenant.get("_email")
    if not session_email or str(body.email).casefold() != str(session_email).casefold():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Onboarding-E-Mails dürfen nur an deine eigene Adresse gesendet werden",
        )
    redis_url = os.environ.get("REDIS_URL")
    if not redis_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="REDIS_URL ist nicht konfiguriert",
        )
    redis = await create_pool(RedisSettings.from_dsn(redis_url))
    try:
        await schedule_onboarding_sequence(tenant["id"], str(session_email), redis)
        await queries.record_product_event(tenant["id"], "signup", tenant.get("plan"))
    finally:
        await redis.aclose()
    return {"scheduled": True}
