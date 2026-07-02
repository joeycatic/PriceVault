"""CSV and PDF export endpoints."""

import csv
import io
from datetime import datetime, timedelta, timezone
from textwrap import shorten

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from auth.dependencies import get_current_tenant
from db import queries


router = APIRouter(prefix="/export", tags=["export"])


async def _history_rows(tenant_id: str, competitor_product_id: str, days: int) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    return await queries.get_snapshot_history(tenant_id, competitor_product_id, since)


def _safe_cell(value: object) -> str:
    if value is None:
        return ""
    return str(value)


def _filename(stem: str, competitor_product_id: str, extension: str) -> str:
    return f"{stem}_{competitor_product_id[:8]}.{extension}"


def _escape_pdf_text(value: object) -> str:
    text = _safe_cell(value).encode("latin-1", errors="replace").decode("latin-1")
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _build_history_pdf(competitor_product_id: str, rows: list[dict]) -> bytes:
    header_lines = [
        "PriceVault Preisverlauf",
        f"Quelle: {competitor_product_id}",
        "",
        "Zeitpunkt | Preis | Waeh. | Bestand | Status | Fehler",
    ]
    row_lines = []
    for row in rows:
        line = " | ".join(
            [
                _safe_cell(row.get("scraped_at")),
                _safe_cell(row.get("price")),
                _safe_cell(row.get("currency")),
                _safe_cell(row.get("in_stock")),
                _safe_cell(row.get("scrape_ok")),
                _safe_cell(row.get("error_msg")),
            ]
        )
        row_lines.append(shorten(line, width=110, placeholder="..."))

    rows_per_page = 48
    page_rows = [row_lines[index : index + rows_per_page] for index in range(0, len(row_lines), rows_per_page)]
    if not page_rows:
        page_rows = [[]]

    page_ids = [4 + (index * 2) for index in range(len(page_rows))]
    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids).encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [" + kids + b"] /Count " + str(len(page_rows)).encode("ascii") + b" >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    for index, report_rows in enumerate(page_rows):
        text_commands = ["BT", "/F1 10 Tf", "40 800 Td", "14 TL"]
        for line in [*header_lines, *report_rows]:
            text_commands.append(f"({_escape_pdf_text(line)}) Tj")
            text_commands.append("T*")
        text_commands.append("ET")
        content = "\n".join(text_commands).encode("latin-1")
        content_id = page_ids[index] + 1
        objects.extend(
            [
                (
                    b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
                    b"/Resources << /Font << /F1 3 0 R >> >> /Contents "
                    + str(content_id).encode("ascii")
                    + b" 0 R >>"
                ),
                b"<< /Length "
                + str(len(content)).encode("ascii")
                + b" >>\nstream\n"
                + content
                + b"\nendstream",
            ]
        )
    pdf = io.BytesIO()
    pdf.write(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(pdf.tell())
        pdf.write(f"{index} 0 obj\n".encode("ascii"))
        pdf.write(obj)
        pdf.write(b"\nendobj\n")
    xref_offset = pdf.tell()
    pdf.write(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    pdf.write(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.write(f"{offset:010d} 00000 n \n".encode("ascii"))
    pdf.write(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        ).encode("ascii")
    )
    return pdf.getvalue()


@router.get("/csv")
async def export_csv(
    competitor_product_id: str,
    days: int = Query(default=30, ge=1, le=365),
    tenant: dict = Depends(get_current_tenant),
) -> StreamingResponse:
    rows = await _history_rows(tenant["id"], competitor_product_id, days)
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["scraped_at", "price", "currency", "in_stock", "scrape_ok", "error_msg"])
    writer.writeheader()
    writer.writerows(
        {
            "scraped_at": row.get("scraped_at"),
            "price": row.get("price"),
            "currency": row.get("currency"),
            "in_stock": row.get("in_stock"),
            "scrape_ok": row.get("scrape_ok"),
            "error_msg": row.get("error_msg"),
        }
        for row in rows
    )
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={_filename('preisverlauf', competitor_product_id, 'csv')}"
        },
    )


@router.get("/pdf")
async def export_pdf(
    competitor_product_id: str,
    days: int = Query(default=30, ge=1, le=365),
    tenant: dict = Depends(get_current_tenant),
) -> StreamingResponse:
    rows = await _history_rows(tenant["id"], competitor_product_id, days)
    pdf = _build_history_pdf(competitor_product_id, rows)
    return StreamingResponse(
        iter([pdf]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={_filename('preisverlauf', competitor_product_id, 'pdf')}"
        },
    )
