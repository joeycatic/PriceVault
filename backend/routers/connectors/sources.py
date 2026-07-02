"""Connector source management endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth.plan_guard import require_plan_admin
from db import queries
from models.schemas import ConnectorSourceCreate, ConnectorSyncRequest
from routers.audit import record_audit_event


router = APIRouter(prefix="/connectors", tags=["connectors"])


def _public_source(source: dict) -> dict:
    config = source.get("config") or {}
    safe_config = {
        key: value
        for key, value in config.items()
            if key
            not in {
                "access_token",
                "access_token_ciphertext",
                "consumer_secret",
                "consumer_secret_ciphertext",
                "api_secret",
            }
    }
    return {**source, "config": safe_config}


@router.get("")
async def list_sources(tenant: dict = Depends(require_plan_admin("pro"))) -> list[dict]:
    return [_public_source(source) for source in await queries.list_connector_sources(tenant["id"])]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_source(
    body: ConnectorSourceCreate, tenant: dict = Depends(require_plan_admin("pro"))
) -> dict:
    source = await queries.create_connector_source(tenant["id"], body.model_dump(mode="json"))
    await record_audit_event(
        tenant,
        action="connector.created",
        resource_type="connector_source",
        resource_id=source.get("id"),
        metadata={"type": body.type, "name": body.name},
    )
    return _public_source(source)


@router.post("/{connector_id}/disconnect")
async def disconnect(connector_id: str, tenant: dict = Depends(require_plan_admin("pro"))) -> dict:
    source = await queries.update_connector_source(tenant["id"], connector_id, {"active": False})
    if not source:
        raise HTTPException(status_code=404, detail="Connector nicht gefunden")
    await record_audit_event(
        tenant,
        action="connector.disconnected",
        resource_type="connector_source",
        resource_id=connector_id,
    )
    return _public_source(source)


@router.post("/{connector_id}/reconnect")
async def reconnect(connector_id: str, tenant: dict = Depends(require_plan_admin("pro"))) -> dict:
    source = await queries.update_connector_source(tenant["id"], connector_id, {"active": True})
    if not source:
        raise HTTPException(status_code=404, detail="Connector nicht gefunden")
    await record_audit_event(
        tenant,
        action="connector.reconnected",
        resource_type="connector_source",
        resource_id=connector_id,
    )
    return _public_source(source)


@router.get("/sync-runs")
async def list_sync_runs(
    limit: int = Query(default=100, ge=1, le=500),
    tenant: dict = Depends(require_plan_admin("pro")),
) -> list[dict]:
    return await queries.list_connector_sync_runs(tenant["id"], limit)


@router.post("/sync-runs", status_code=status.HTTP_201_CREATED)
async def create_sync_run(
    body: ConnectorSyncRequest, tenant: dict = Depends(require_plan_admin("pro"))
) -> dict:
    source = await queries.get_connector_source(tenant["id"], body.connector_id)
    if not source:
        raise HTTPException(status_code=404, detail="Connector nicht gefunden")
    run = await queries.create_connector_sync_run(
        tenant["id"],
        {
            "connector_id": body.connector_id,
            "status": "queued",
        },
    )
    await queries.update_connector_source(
        tenant["id"],
        body.connector_id,
        {
            "last_sync_at": datetime.now(timezone.utc).isoformat(),
            "last_sync_status": "queued",
        },
    )
    await record_audit_event(
        tenant,
        action="connector_sync.queued",
        resource_type="connector_sync_run",
        resource_id=run.get("id"),
        metadata={"connector_id": body.connector_id, "type": source.get("type")},
    )
    return run
