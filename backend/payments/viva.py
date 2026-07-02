"""Minimal async client for Viva Smart Checkout and recurring payments."""

import os
from typing import Any

import httpx


PLAN_AMOUNTS = {"pro": 2_900, "agency": 9_900}


class VivaConfigurationError(RuntimeError):
    pass


class VivaAPIError(RuntimeError):
    pass


def _required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise VivaConfigurationError(f"{name} is not configured")
    return value


def _demo() -> bool:
    return os.environ.get("VIVA_ENVIRONMENT", "demo").lower() != "live"


def _api_base() -> str:
    return "https://demo-api.vivapayments.com" if _demo() else "https://api.vivapayments.com"


def _web_base() -> str:
    return "https://demo.vivapayments.com" if _demo() else "https://www.vivapayments.com"


def _accounts_base() -> str:
    return (
        "https://demo-accounts.vivapayments.com"
        if _demo()
        else "https://accounts.vivapayments.com"
    )


def _value(payload: dict[str, Any], name: str) -> Any:
    return payload.get(name, payload.get(name[:1].upper() + name[1:]))


async def _json(response: httpx.Response) -> dict[str, Any]:
    try:
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        detail = response.text[:500] if response.text else str(exc)
        raise VivaAPIError(f"Viva API request failed: {detail}") from exc
    if not isinstance(payload, dict):
        raise VivaAPIError("Viva API returned an invalid response")
    return payload


async def _request(method: str, url: str, *, timeout: int = 20, **kwargs: Any) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.request(method, url, **kwargs)
    except httpx.HTTPError as exc:
        raise VivaAPIError(f"Viva API request failed: {exc}") from exc
    return await _json(response)


async def access_token() -> str:
    payload = await _request(
        "POST",
        f"{_accounts_base()}/connect/token",
        auth=(_required("VIVA_CLIENT_ID"), _required("VIVA_CLIENT_SECRET")),
        data={"grant_type": "client_credentials"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    token = _value(payload, "access_token")
    if not token:
        raise VivaAPIError("Viva API did not return an access token")
    return str(token)


async def create_payment_order(*, tenant_id: str, email: str | None, plan: str) -> int:
    amount = PLAN_AMOUNTS[plan]
    token = await access_token()
    payload: dict[str, Any] = {
        "amount": amount,
        "allowRecurring": True,
        "sourceCode": _required("VIVA_SOURCE_CODE"),
        "customerTrns": f"PriceVault {plan.capitalize()} - monatliches Abonnement",
        "merchantTrns": f"pricevault:{tenant_id}:{plan}",
        "tags": ["pricevault", tenant_id, plan],
        "paymentTimeout": 3_600,
    }
    if email:
        payload["customer"] = {"email": email, "requestLang": "de-DE"}
    order = await _request(
        "POST",
        f"{_api_base()}/checkout/v2/orders",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    order_code = _value(order, "orderCode")
    if not order_code:
        raise VivaAPIError("Viva API did not return an order code")
    return int(order_code)


def checkout_url(order_code: int) -> str:
    return f"{_web_base()}/web/checkout?ref={order_code}"


async def retrieve_transaction(transaction_id: str) -> dict[str, Any]:
    token = await access_token()
    return await _request(
        "GET",
        f"{_api_base()}/checkout/v2/transactions/{transaction_id}",
        headers={"Authorization": f"Bearer {token}"},
    )


async def webhook_verification_key() -> dict[str, Any]:
    payload = await _request(
        "GET",
        f"{_web_base()}/api/messages/config/token",
        auth=(_required("VIVA_MERCHANT_ID"), _required("VIVA_API_KEY")),
    )
    key = _value(payload, "key")
    if not key:
        raise VivaAPIError("Viva API did not return a webhook key")
    return {"Key": key}


async def create_recurring_payment(
    *, initial_transaction_id: str, amount_cents: int, source_code: str, idempotency_key: str
) -> str:
    payload = {
        "amount": amount_cents,
        "sourceCode": source_code,
        "currencyCode": "978",
        "customerTrns": "PriceVault monatliches Abonnement",
        "merchantTrns": idempotency_key,
        "idempotencyKey": idempotency_key,
    }
    result = await _request(
        "POST",
        f"{_web_base()}/api/transactions/{initial_transaction_id}",
        timeout=30,
        auth=(_required("VIVA_MERCHANT_ID"), _required("VIVA_API_KEY")),
        json=payload,
    )
    if _value(result, "success") is False or _value(result, "errorCode") not in (None, 0):
        raise VivaAPIError(str(_value(result, "errorText") or "Recurring payment failed"))
    transaction_id = _value(result, "transactionId")
    if not transaction_id:
        raise VivaAPIError("Viva API did not return a recurring transaction ID")
    return str(transaction_id)
