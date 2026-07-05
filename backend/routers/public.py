"""Public-safe status and sanitized CSP reporting."""

from urllib.parse import urlsplit

from fastapi import APIRouter, Request, status

from db import queries
from db.client import supabase_context


router = APIRouter(tags=["public"])


def _origin(value: object) -> str | None:
    if not isinstance(value, str) or not value or value in {"inline", "eval", "data"}:
        return value if value in {"inline", "eval", "data"} else None
    try:
        parsed = urlsplit(value)
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return None
    port = f":{parsed.port}" if parsed.port else ""
    return f"{parsed.scheme}://{parsed.hostname}{port}"[:500]


@router.get("/public/status")
async def public_status() -> dict:
    with supabase_context(admin=True):
        incidents = await queries.list_public_incidents()
    active = [incident for incident in incidents if incident["status"] != "resolved"]
    return {
        "status": "operational" if not active else "degraded",
        "services": ["Dashboard", "API", "Preisabrufe", "Benachrichtigungen", "Abrechnung"],
        "incidents": incidents,
    }


@router.post("/csp-report", status_code=status.HTTP_204_NO_CONTENT)
async def csp_report(request: Request) -> None:
    try:
        payload = await request.json()
    except ValueError:
        return None
    report = payload.get("csp-report", payload.get("body", payload)) if isinstance(payload, dict) else {}
    if not isinstance(report, dict):
        return None
    directive = str(report.get("violated-directive") or report.get("effectiveDirective") or "")[:200]
    if not directive:
        return None
    values = {
        "document_origin": _origin(report.get("document-uri") or report.get("documentURL")),
        "violated_directive": directive,
        "effective_directive": str(report.get("effective-directive") or report.get("effectiveDirective") or "")[:200] or None,
        "blocked_origin": _origin(report.get("blocked-uri") or report.get("blockedURL")),
        "source_origin": _origin(report.get("source-file") or report.get("sourceFile")),
        "disposition": str(report.get("disposition") or "report") if str(report.get("disposition") or "report") in {"report", "enforce"} else None,
        "status_code": int(report.get("status-code") or report.get("statusCode") or 0) or None,
    }
    with supabase_context(admin=True):
        await queries.insert_csp_violation(values)
    return None
