"""EU B2B VAT treatment and VIES validation using the existing HTTP client."""

import hashlib
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from xml.etree import ElementTree

import httpx


EU_COUNTRIES = frozenset({
    "AT", "BE", "BG", "HR", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR",
    "GR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE",
    "SI", "SK",
})
VIES_URL = "https://ec.europa.eu/taxation_customs/vies/services/checkVatService"


class VATValidationError(RuntimeError):
    pass


class VIESUnavailable(VATValidationError):
    pass


@dataclass(frozen=True)
class VATDecision:
    country: str
    normalized_vat_id: str | None
    valid: bool
    tax_treatment: str
    vat_rate: int
    validated_at: datetime
    reference: str


def normalize_vat_id(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", value.upper())


def cached_vies_decision(tenant: dict, country: str, vat_id: str) -> VATDecision | None:
    if tenant.get("vat_validation_status") != "valid":
        return None
    if tenant.get("normalized_vat_id") != vat_id or tenant.get("billing_country") != country:
        return None
    checked_value = tenant.get("vat_validated_at")
    if not checked_value:
        return None
    checked = datetime.fromisoformat(str(checked_value).replace("Z", "+00:00"))
    if checked + timedelta(hours=24) <= datetime.now(timezone.utc):
        return None
    return VATDecision(country, vat_id, True, "eu_reverse_charge", 0, checked, str(tenant.get("vat_validation_reference") or "cached"))


async def determine_vat(tenant: dict, country_value: str | None, vat_value: str | None) -> VATDecision:
    country = (country_value or tenant.get("billing_country") or tenant.get("headquarters_country") or "").upper()
    now = datetime.now(timezone.utc)
    if country not in EU_COUNTRIES:
        raise VATValidationError("Bezahlte Pläne sind derzeit nur für Unternehmen in der EU verfügbar")
    if country == "DE":
        return VATDecision("DE", normalize_vat_id(vat_value) if vat_value else None, True, "de_19", 19, now, f"DE-{now.date().isoformat()}")

    vat_id = normalize_vat_id(vat_value or tenant.get("vat_id") or "")
    vies_country = "EL" if country == "GR" else country
    if not vat_id.startswith(vies_country) or len(vat_id) <= 2:
        raise VATValidationError("Für EU-Unternehmen außerhalb Deutschlands ist eine passende USt-IdNr. erforderlich")
    cached = cached_vies_decision(tenant, country, vat_id)
    if cached:
        return cached

    number = vat_id[2:]
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" '
        'xmlns:urn="urn:ec.europa.eu:taxud:vies:services:checkVat:types">'
        f'<soap:Body><urn:checkVat><urn:countryCode>{vies_country}</urn:countryCode>'
        f'<urn:vatNumber>{number}</urn:vatNumber></urn:checkVat></soap:Body></soap:Envelope>'
    )
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(VIES_URL, content=body, headers={"Content-Type": "text/xml; charset=utf-8"})
        response.raise_for_status()
        root = ElementTree.fromstring(response.content)
    except (httpx.HTTPError, ElementTree.ParseError) as exc:
        raise VIESUnavailable("VIES ist derzeit nicht erreichbar; der Checkout wurde sicherheitshalber blockiert") from exc

    values = {element.tag.rsplit("}", 1)[-1]: (element.text or "").strip() for element in root.iter()}
    if values.get("valid", "false").lower() != "true":
        raise VATValidationError("Die USt-IdNr. konnte durch VIES nicht bestätigt werden")
    reference_source = f"{vat_id}|{values.get('requestDate', '')}|{values.get('name', '')}"
    reference = hashlib.sha256(reference_source.encode()).hexdigest()[:24]
    return VATDecision(country, vat_id, True, "eu_reverse_charge", 0, now, reference)
