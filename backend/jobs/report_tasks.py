"""Report schedule and delivery jobs."""

import asyncio
import base64
import csv
import io
import os
from datetime import datetime, timedelta, timezone

import resend

from db import queries
from db.client import supabase_context
from emails.settings import app_url, resend_sender


def _next_run(cadence: str, now: datetime) -> datetime:
    if cadence == "monthly":
        return now + timedelta(days=30)
    return now + timedelta(days=7)


def _csv_payload(rows: list[dict]) -> str:
    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=[
            "product_name",
            "competitor_shop",
            "our_price",
            "competitor_price",
            "delta_pct",
            "in_stock",
            "scraped_at",
            "competitor_url",
        ],
    )
    writer.writeheader()
    for row in rows:
        writer.writerow({field: row.get(field) for field in writer.fieldnames})
    return output.getvalue()


def _summary(rows: list[dict]) -> str:
    found = [row for row in rows if row.get("competitor_price") is not None]
    undercut = [row for row in rows if float(row.get("delta_pct") or 0) < 0]
    unavailable = [row for row in rows if row.get("in_stock") is False]
    top_rows = sorted(
        found,
        key=lambda row: float(row.get("delta_pct") or 0),
    )[:10]
    lines = [
        "PriceVault Report",
        "",
        f"Preisquellen: {len(rows)}",
        f"Gefundene Preise: {len(found)}",
        f"Unterbotene Produkte: {len(undercut)}",
        f"Nicht verfügbare Quellen: {len(unavailable)}",
        "",
        "Wichtigste Abweichungen:",
    ]
    if not top_rows:
        lines.append("Noch keine verwertbaren Preiszeilen vorhanden.")
    for row in top_rows:
        delta_pct = float(row.get("delta_pct") or 0)
        lines.append(
            f"- {row['product_name']} bei {row['competitor_shop']}: "
            f"{row.get('competitor_price') or '-'} EUR "
            f"({delta_pct:+.2f} %)"
        )
    lines.extend(["", f"Dashboard: {app_url('/dashboard/reports')}"])
    return "\n".join(lines)


async def enqueue_due_reports(ctx: dict) -> dict[str, int]:
    now = datetime.now(timezone.utc)
    queued = 0
    with supabase_context(admin=True):
        schedules = await queries.list_due_report_schedules(now.isoformat())
        for schedule in schedules:
            run = await queries.create_report_run(
                schedule["tenant_id"],
                {
                    "schedule_id": schedule["id"],
                    "status": "queued",
                    "recipients": schedule.get("recipients") or [],
                    "include_csv": schedule.get("include_csv", False),
                    "filters": schedule.get("filters") or {},
                },
            )
            job = await ctx["redis"].enqueue_job(
                "send_report_run",
                tenant_id=schedule["tenant_id"],
                run_id=run["id"],
                _job_id=f"report-{run['id']}",
            )
            if job:
                queued += 1
            await queries.update_report_schedule(
                schedule["tenant_id"],
                schedule["id"],
                {"next_run_at": _next_run(schedule["cadence"], now).isoformat()},
            )
    return {"queued": queued}


async def send_report_run(ctx: dict, *, tenant_id: str, run_id: str) -> dict[str, str]:
    del ctx
    now = datetime.now(timezone.utc)
    with supabase_context(admin=True):
        run = await queries.get_report_run(tenant_id, run_id)
        if not run:
            return {"status": "missing"}
        await queries.update_report_run(
            tenant_id,
            run_id,
            {"status": "running", "started_at": now.isoformat()},
        )
        await queries.insert_usage_event(tenant_id, "report_generations")
        rows = await queries.get_latest_prices(tenant_id)
        schedule = None
        if run.get("schedule_id"):
            schedule = await queries.get_report_schedule(tenant_id, run["schedule_id"])

    summary = _summary(rows)
    recipients = run.get("recipients") or []
    attachments = []
    csv_text = ""
    if run.get("include_csv"):
        csv_text = _csv_payload(rows)
        attachments.append(
            {
                "filename": "pricevault-report.csv",
                "content": base64.b64encode(csv_text.encode("utf-8")).decode("ascii"),
            }
        )

    try:
        api_key = os.getenv("RESEND_API_KEY")
        if not api_key:
            raise RuntimeError("RESEND_API_KEY is not configured")
        resend.api_key = api_key
        payload = {
            "from": resend_sender(),
            "to": recipients,
            "subject": schedule.get("name", "PriceVault Report") if schedule else "PriceVault Report",
            "text": summary,
        }
        if attachments:
            payload["attachments"] = attachments
        await asyncio.to_thread(resend.Emails.send, payload)
    except Exception as exc:
        failed_at = datetime.now(timezone.utc).isoformat()
        with supabase_context(admin=True):
            await queries.update_report_run(
                tenant_id,
                run_id,
                {
                    "status": "failed",
                    "error": str(exc)[:1000],
                    "delivery_error": str(exc)[:1000],
                    "failed_at": failed_at,
                    "finished_at": failed_at,
                    "generated_summary": summary,
                    "artifact_metadata": {
                        "rows": len(rows),
                        "csv_included": bool(csv_text),
                    },
                },
            )
        raise

    sent_at = datetime.now(timezone.utc).isoformat()
    with supabase_context(admin=True):
        await queries.update_report_run(
            tenant_id,
            run_id,
            {
                "status": "sent",
                "sent_at": sent_at,
                "finished_at": sent_at,
                "delivery_error": None,
                "generated_summary": summary,
                "artifact_metadata": {
                    "rows": len(rows),
                    "csv_included": bool(csv_text),
                    "csv_bytes": len(csv_text.encode("utf-8")) if csv_text else 0,
                },
            },
        )
        if schedule:
            await queries.update_report_schedule(
                tenant_id,
                schedule["id"],
                {
                    "last_run_at": sent_at,
                    "next_run_at": _next_run(schedule["cadence"], datetime.now(timezone.utc)).isoformat(),
                },
            )
    return {"status": "sent"}
