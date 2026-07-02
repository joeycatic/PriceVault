"""Viva client and recurring billing behavior."""

import asyncio

import pytest


def test_create_payment_order_uses_recurring_smart_checkout(monkeypatch):
    from payments import viva

    captured = {}

    async def fake_token():
        return "token"

    async def fake_request(method, url, **kwargs):
        captured.update({"method": method, "url": url, **kwargs})
        return {"orderCode": 1234567890123456}

    monkeypatch.setenv("VIVA_ENVIRONMENT", "demo")
    monkeypatch.setenv("VIVA_SOURCE_CODE", "1234")
    monkeypatch.setattr(viva, "access_token", fake_token)
    monkeypatch.setattr(viva, "_request", fake_request)

    code = asyncio.run(
        viva.create_payment_order(tenant_id="tenant-1", email="owner@example.com", plan="pro")
    )

    assert code == 1234567890123456
    assert captured["url"] == "https://demo-api.vivapayments.com/checkout/v2/orders"
    assert captured["json"]["amount"] == 2900
    assert captured["json"]["allowRecurring"] is True
    assert captured["json"]["sourceCode"] == "1234"
    assert captured["json"]["customer"] == {
        "email": "owner@example.com",
        "requestLang": "de-DE",
    }


def test_create_recurring_payment_uses_idempotency_key(monkeypatch):
    from payments import viva

    captured = {}

    async def fake_request(method, url, **kwargs):
        captured.update({"method": method, "url": url, **kwargs})
        return {"Success": True, "ErrorCode": 0, "TransactionId": "renewal-1"}

    monkeypatch.setenv("VIVA_ENVIRONMENT", "live")
    monkeypatch.setenv("VIVA_MERCHANT_ID", "merchant")
    monkeypatch.setenv("VIVA_API_KEY", "api-key")
    monkeypatch.setattr(viva, "_request", fake_request)

    transaction_id = asyncio.run(
        viva.create_recurring_payment(
            initial_transaction_id="initial-1",
            amount_cents=9900,
            source_code="1234",
            idempotency_key="pricevault:tenant-1:2026-08-01",
        )
    )

    assert transaction_id == "renewal-1"
    assert captured["url"] == "https://www.vivapayments.com/api/transactions/initial-1"
    assert captured["json"]["idempotencyKey"] == "pricevault:tenant-1:2026-08-01"
    assert captured["json"]["amount"] == 9900


def test_enqueue_due_renewals_expires_canceled_plans(monkeypatch):
    from db import queries
    from jobs import billing_tasks

    updates = []

    async def fake_due(_now):
        return [
            {
                "id": "tenant-active",
                "subscription_plan": "pro",
                "viva_initial_transaction_id": "initial-1",
                "viva_source_code": "1234",
                "subscription_current_period_end": "2026-07-01T00:00:00Z",
            }
        ]

    async def fake_ended(_now):
        return [{"id": "tenant-canceled"}]

    async def fake_update(tenant_id, values):
        updates.append((tenant_id, values))
        return values

    class FakeRedis:
        async def enqueue_job(self, *args, **kwargs):
            self.call = (args, kwargs)
            return object()

    redis = FakeRedis()
    monkeypatch.setattr(queries, "list_due_viva_subscriptions", fake_due)
    monkeypatch.setattr(queries, "list_ended_viva_subscriptions", fake_ended)
    monkeypatch.setattr(queries, "update_tenant", fake_update)

    queued = asyncio.run(billing_tasks.enqueue_due_viva_renewals({"redis": redis}))

    assert queued == 1
    assert redis.call[0][0] == "renew_viva_subscription"
    assert redis.call[1]["_job_id"] == "viva-renew-tenant-active-2026-07-01"
    assert updates == [
        (
            "tenant-canceled",
            {
                "plan": "free",
                "subscription_plan": None,
                "subscription_current_period_end": None,
                "subscription_cancel_at_period_end": False,
                "cancellation_effective_at": None,
                "subscription_status": "canceled",
            },
        )
    ]


def test_renewal_marks_past_due_after_final_attempt(monkeypatch):
    from db import queries
    from jobs import billing_tasks

    updates = []

    async def fail_payment(**_kwargs):
        raise billing_tasks.viva.VivaAPIError("declined")

    async def fake_update(tenant_id, values):
        updates.append((tenant_id, values))
        return values

    monkeypatch.setattr(billing_tasks.viva, "create_recurring_payment", fail_payment)
    monkeypatch.setattr(queries, "update_tenant", fake_update)

    with pytest.raises(billing_tasks.viva.VivaAPIError):
        asyncio.run(
            billing_tasks.renew_viva_subscription(
                {"job_try": 3},
                tenant_id="tenant-1",
                plan="pro",
                initial_transaction_id="initial-1",
                source_code="1234",
                period="2026-07-01",
            )
        )

    assert updates == [
        (
            "tenant-1",
            {
                "subscription_status": "past_due",
                "failed_payment_count": 3,
                "last_payment_error": "declined",
                "next_payment_retry_at": None,
            },
        )
    ]


def test_renewal_defers_provider_failure_before_final_attempt(monkeypatch):
    from arq import Retry
    from db import queries
    from jobs import billing_tasks

    async def fail_payment(**_kwargs):
        raise billing_tasks.viva.VivaAPIError("temporary failure")

    updates = []

    async def fake_update(tenant_id, values):
        updates.append((tenant_id, values))
        return values

    monkeypatch.setattr(billing_tasks.viva, "create_recurring_payment", fail_payment)
    monkeypatch.setattr(queries, "update_tenant", fake_update)

    with pytest.raises(Retry) as caught:
        asyncio.run(
            billing_tasks.renew_viva_subscription(
                {"job_try": 2},
                tenant_id="tenant-1",
                plan="pro",
                initial_transaction_id="initial-1",
                source_code="1234",
                period="2026-07-01",
            )
        )

    assert caught.value.defer_score == 300_000
    assert updates[0][0] == "tenant-1"
    assert updates[0][1]["failed_payment_count"] == 2
    assert updates[0][1]["last_payment_error"] == "temporary failure"
    assert updates[0][1]["next_payment_retry_at"] is not None
