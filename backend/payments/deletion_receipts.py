"""Restricted German deletion receipt PDF."""

import io

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


def render_deletion_receipt_pdf(receipt: dict) -> bytes:
    output = io.BytesIO()
    pdf = canvas.Canvas(output, pagesize=A4)
    _, height = A4
    audit = receipt.get("audit_receipt") or {}
    pdf.setTitle("PriceVault Löschbestätigung")
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(48, height - 60, "LÖSCHBESTÄTIGUNG")
    pdf.setFont("Helvetica", 10)
    lines = [
        f"Vorgang: {receipt.get('request_reference')}",
        f"Ausgeführt am: {str(receipt.get('completed_at'))[:10]}",
        f"Prüfsumme: {audit.get('audit_digest', '-')}",
        "Operative Mandantendaten und Zugangsdaten wurden gelöscht.",
        "Rechnungen und Buchungsbelege bleiben im gesetzlich erforderlichen Umfang zugriffsbeschränkt erhalten.",
        "Sicherungskopien laufen nach dem dokumentierten Backup-Zyklus aus; eine sofortige physische Löschung wird nicht zugesagt.",
    ]
    y = height - 110
    for line in lines:
        for chunk in [line[i:i + 95] for i in range(0, len(line), 95)]:
            pdf.drawString(48, y, chunk)
            y -= 16
        y -= 6
    pdf.save()
    return output.getvalue()
