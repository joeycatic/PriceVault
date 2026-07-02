"""Connector source management endpoints."""

import os
from datetime import datetime, timezone

from arq import create_pool
from arq.connections import RedisSettings
from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth.plan_guard import require_plan_admin
from db import queries
from models.schemas import ConnectorSourceCreate, ConnectorSyncRequest
from routers.audit import record_audit_event
from security.crypto import encrypt_secret


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


def _source_values(body: ConnectorSourceCreate) -> dict:
    config = body.config
    if body.type == "woocommerce":
        required = ("base_url", "consumer_key", "consumer_secret")
        if any(not config.get(key) for key in required):
            raise HTTPException(status_code=400, detail="WooCommerce-Zugangsdaten fehlen")
        try:
            encrypted = encrypt_secret(str(config["consumer_secret"]))
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return {
            "type": body.type,
            "name": body.name,
            "config": {
                "base_url": str(config["base_url"]).rstrip("/"),
                "consumer_key": str(config["consumer_key"]),
                "consumer_secret_ciphertext": encrypted,
            },
            "credential_metadata": {"secret": "encrypted"},
        }
    if body.type in {"feed_csv", "google_merchant"}:
        url = config.get("url") or config.get("feed_url")
        if not url:
            raise HTTPException(status_code=400, detail="Feed-URL fehlt")
        return {
            "type": body.type,
            "name": body.name,
            "config": {"url": str(url)},
            "provider_details": {"mode": "feed_url"},
        }
    raise HTTPException(status_code=400, detail="Connector-Typ wird nicht unterstützt")


@router.get("")
async def list_sources(tenant: dict = Depends(require_plan_admin("pro"))) -> list[dict]:
    return [_public_source(source) for source in await queries.list_connector_sources(tenant["id"])]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_source(
    body: ConnectorSourceCreate, tenant: dict = Depends(require_plan_admin("pro"))
) -> dict:
    source = await queries.create_connector_source(tenant["id"], _source_values(body))
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
    redis_url = os.environ.get("REDIS_URL")
    if redis_url:
        redis = await create_pool(RedisSettings.from_dsn(redis_url))
        try:
            await redis.enqueue_job(
                "sync_connector_run",
                tenant_id=tenant["id"],
                connector_id=body.connector_id,
                run_id=run["id"],
                _job_id=f"connector-sync-{run['id']}",
            )
        finally:
            await redis.aclose()
    await record_audit_event(
        tenant,
        action="connector_sync.queued",
        resource_type="connector_sync_run",
        resource_id=run.get("id"),
        metadata={"connector_id": body.connector_id, "type": source.get("type")},
    )
    return run
