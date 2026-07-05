"""German VAT invoice records and PDF rendering."""

import io
import os
from datetime import datetime
from typing import Any

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from db import queries
from payments.viva import PLAN_AMOUNTS, PLAN_NET_AMOUNTS, VAT_RATE


def _seller_snapshot() -> dict[str, str]:
    return {
        "name": os.getenv("INVOICE_SELLER_NAME", "PriceVault"),
        "address": os.getenv("INVOICE_SELLER_ADDRESS", ""),
        "vat_id": os.getenv("INVOICE_SELLER_VAT_ID", ""),
        "email": os.getenv("INVOICE_SELLER_EMAIL", ""),
    }


async def create_paid_invoice(
    *,
    tenant: dict[str, Any],
    plan: str,
    transaction_id: str,
    paid_at: str,
    billing_order_id: str | None = None,
) -> dict[str, Any]:
    existing = await queries.get_billing_invoice_by_transaction(tenant["id"], transaction_id)
    if existing:
        return existing
    net = PLAN_NET_AMOUNTS[plan]
    reverse_charge = tenant.get("tax_treatment") == "eu_reverse_charge"
    gross = net if reverse_charge else PLAN_AMOUNTS[plan]
    invoice_number = await queries.next_billing_invoice_number()
    return await queries.create_billing_invoice(
        {
            "tenant_id": tenant["id"],
            "tenant_reference": tenant["id"],
            "billing_order_id": billing_order_id,
            "invoice_number": invoice_number,
            "transaction_id": transaction_id,
            "plan": plan,
            "net_amount_cents": net,
            "vat_rate": 0 if reverse_charge else VAT_RATE,
            "vat_amount_cents": gross - net,
            "gross_amount_cents": gross,
            "seller_snapshot": _seller_snapshot(),
            "customer_snapshot": {
                "name": tenant.get("shop_name"),
                "email": tenant.get("invoice_email"),
                "vat_id": tenant.get("vat_id"),
                "normalized_vat_id": tenant.get("normalized_vat_id"),
                "billing_country": tenant.get("billing_country"),
                "address": tenant.get("billing_address") or {},
            },
            "tax_evidence": {
                "tax_treatment": tenant.get("tax_treatment"),
                "vat_validation_reference": tenant.get("vat_validation_reference"),
                "vat_validated_at": tenant.get("vat_validated_at"),
            },
            "issued_at": paid_at,
            "paid_at": paid_at,
        }
    )


def render_invoice_pdf(invoice: dict[str, Any]) -> bytes:
    output = io.BytesIO()
    pdf = canvas.Canvas(output, pagesize=A4)
    width, height = A4
    seller = invoice.get("seller_snapshot") or {}
    customer = invoice.get("customer_snapshot") or {}
    address = customer.get("address") or {}
    pdf.setTitle(f"Rechnung {invoice['invoice_number']}")
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(48, height - 60, "RECHNUNG")
    pdf.setFont("Helvetica", 9)
    pdf.drawRightString(width - 48, height - 55, seller.get("name") or "PriceVault")
    pdf.drawRightString(width - 48, height - 68, seller.get("address") or "")
    pdf.drawRightString(width - 48, height - 81, f"USt-IdNr.: {seller.get('vat_id') or '-'}")
    y = height - 130
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(48, y, customer.get("name") or "Kunde")
    pdf.setFont("Helvetica", 10)
    for line in [address.get("street"), f"{address.get('postal_code', '')} {address.get('city', '')}".strip(), address.get("country", "Deutschland")]:
        if line:
            y -= 14
            pdf.drawString(48, y, str(line))
    if customer.get("vat_id"):
        y -= 14
        pdf.drawString(48, y, f"USt-IdNr.: {customer['vat_id']}")
    y -= 45
    pdf.drawString(48, y, f"Rechnungsnummer: {invoice['invoice_number']}")
    pdf.drawString(300, y, f"Rechnungsdatum: {str(invoice['issued_at'])[:10]}")
    y -= 35
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(48, y, "Leistung")
    pdf.drawRightString(width - 48, y, "Betrag")
    pdf.line(48, y - 5, width - 48, y - 5)
    y -= 25
    pdf.setFont("Helvetica", 10)
    pdf.drawString(48, y, f"PriceVault {invoice['plan'].capitalize()} · monatliches Abonnement")
    pdf.drawRightString(width - 48, y, f"{invoice['net_amount_cents'] / 100:.2f} EUR")
    y -= 35
    pdf.drawRightString(width - 48, y, f"Netto: {invoice['net_amount_cents'] / 100:.2f} EUR")
    y -= 16
    pdf.drawRightString(width - 48, y, f"{invoice['vat_rate']} % USt.: {invoice['vat_amount_cents'] / 100:.2f} EUR")
    y -= 18
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawRightString(width - 48, y, f"Gesamt: {invoice['gross_amount_cents'] / 100:.2f} EUR")
    if (invoice.get("tax_evidence") or {}).get("tax_treatment") == "eu_reverse_charge":
        y -= 24
        pdf.setFont("Helvetica", 9)
        pdf.drawRightString(width - 48, y, "Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge).")
    pdf.setFont("Helvetica", 8)
    pdf.drawString(48, 55, "Der Rechnungsbetrag wurde über Viva Wallet bezahlt.")
    pdf.save()
    return output.getvalue()


def render_adjustment_pdf(adjustment: dict[str, Any]) -> bytes:
    output = io.BytesIO()
    pdf = canvas.Canvas(output, pagesize=A4)
    _, height = A4
    kind = {"refund": "ERSTATTUNGSBELEG", "credit_note": "GUTSCHRIFT", "correction": "KORREKTUR"}.get(adjustment["type"], "BELEG")
    pdf.setTitle(f"{kind} {adjustment['adjustment_number']}")
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(48, height - 60, kind)
    pdf.setFont("Helvetica", 10)
    invoice = adjustment.get("billing_invoices") or {}
    lines = [
        f"Belegnummer: {adjustment['adjustment_number']}",
        f"Originalrechnung: {invoice.get('invoice_number', '-')}",
        f"Datum: {str(adjustment['created_at'])[:10]}",
        f"Betrag: {adjustment['amount_cents'] / 100:.2f} EUR",
        f"Grund: {adjustment['reason']}",
    ]
    y = height - 115
    for line in lines:
        pdf.drawString(48, y, line[:100])
        y -= 20
    pdf.drawString(48, 55, "Die Originalrechnung bleibt unverändert erhalten.")
    pdf.save()
    return output.getvalue()
