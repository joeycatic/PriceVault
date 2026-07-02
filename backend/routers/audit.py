"""Audit logging helpers for tenant and support mutations."""

from contextlib import suppress
from typing import Any

from db import queries


async def record_audit_event(
    tenant: dict | None,
    *,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    tenant_id = tenant.get("id") if tenant else None
    user_id = tenant.get("user_id") if tenant else None
    with suppress(Exception):
        await queries.insert_audit_event(
            {
                "tenant_id": tenant_id,
                "user_id": tenant.get("_actor_user_id", user_id) if tenant else None,
                "user_email": tenant.get("_email") if tenant else None,
                "action": action,
                "resource_type": resource_type,
                "resource_id": resource_id,
                "metadata": metadata or {},
            }
        )
