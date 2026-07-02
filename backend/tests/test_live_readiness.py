import io
import sys
from pathlib import Path
from urllib.error import HTTPError


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def test_readiness_report_masks_env_values_and_checks_presence(tmp_path, monkeypatch):
    from verification.live_readiness import (
        BACKEND_ENV_KEYS,
        DASHBOARD_ENV_KEYS,
        build_report,
    )

    for key in (*BACKEND_ENV_KEYS, *DASHBOARD_ENV_KEYS):
        monkeypatch.delenv(key, raising=False)

    backend_env = tmp_path / "backend.env"
    dashboard_env = tmp_path / "dashboard.env"
    backend_env.write_text(
        "\n".join(
            [
                "SUPABASE_URL=https://project.supabase.co",
                "SUPABASE_SERVICE_KEY=secret-service-key",
                "REDIS_URL=redis://localhost:6379",
            ]
        )
    )
    dashboard_env.write_text("NEXT_PUBLIC_SUPABASE_URL=https://project.supabase.co\n")

    report = build_report(
        backend_env_path=backend_env,
        dashboard_env_path=dashboard_env,
        skip_network=True,
    )

    assert report["ready"] is False
    assert report["env"]["backend"]["SUPABASE_URL"] is True
    assert report["env"]["backend"]["SUPABASE_SERVICE_KEY"] is True
    assert report["env"]["backend"]["DATABASE_URL"] is False
    assert report["env"]["dashboard"]["NEXT_PUBLIC_SUPABASE_URL"] is True
    assert "secret-service-key" not in repr(report)


def test_backend_readiness_keys_include_required_env_template_values():
    from verification.live_readiness import BACKEND_ENV_KEYS

    assert "APP_URL" in BACKEND_ENV_KEYS
    assert "RESEND_FROM_EMAIL" in BACKEND_ENV_KEYS
    assert "VIVA_ENVIRONMENT" in BACKEND_ENV_KEYS


def _required_template_keys(path: Path) -> set[str]:
    keys: set[str] = set()
    in_required = False
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if line.startswith("# REQUIRED"):
            in_required = True
            continue
        if line.startswith("# OPTIONAL"):
            in_required = False
            continue
        if in_required and line and not line.startswith("#") and "=" in line:
            keys.add(line.split("=", 1)[0].strip())
    return keys


def test_env_examples_required_sections_match_live_readiness_keys():
    from verification.live_readiness import BACKEND_ENV_KEYS, DASHBOARD_ENV_KEYS

    project_root = ROOT.parent

    assert _required_template_keys(project_root / "backend" / ".env.example") == set(
        BACKEND_ENV_KEYS
    )
    assert _required_template_keys(
        project_root / "dashboard" / ".env.local.example"
    ) == set(DASHBOARD_ENV_KEYS)


def test_resend_probe_requires_verified_sender_domain_without_exposing_api_key():
    from verification.live_readiness import probe_resend_domain

    requests = []

    def fake_fetch(request):
        requests.append(request)
        return (
            200,
            b"""{
              "object": "list",
              "data": [
                {
                  "name": "pricevault.de",
                  "status": "verified",
                  "capabilities": {"sending": "enabled"}
                }
              ]
            }""",
        )

    result = probe_resend_domain(
        values={
            "RESEND_API_KEY": "secret-resend-key",
            "RESEND_FROM_EMAIL": "PriceVault <alerts@pricevault.de>",
        },
        fetch=fake_fetch,
    )

    assert result == {
        "sender_domain": {
            "ok": True,
            "status": 200,
            "domain": "pricevault.de",
            "domain_status": "verified",
            "sending_enabled": True,
        }
    }
    assert requests[0].full_url == "https://api.resend.com/domains?limit=100"
    assert "secret-resend-key" not in repr(result)
    assert "secret-resend-key" not in requests[0].full_url


def test_resend_probe_rejects_testing_sender_for_production_readiness():
    from verification.live_readiness import probe_resend_domain

    result = probe_resend_domain(
        values={
            "RESEND_API_KEY": "secret-resend-key",
            "RESEND_FROM_EMAIL": "onboarding@resend.dev",
        },
        fetch=lambda _request: (_ for _ in ()).throw(AssertionError("no request")),
    )

    assert result == {
        "sender_domain": {
            "ok": False,
            "status": "testing_sender",
            "domain": "resend.dev",
        }
    }
    assert "secret-resend-key" not in repr(result)


def test_resend_probe_reports_unverified_sender_domain():
    from verification.live_readiness import probe_resend_domain

    result = probe_resend_domain(
        values={
            "RESEND_API_KEY": "secret-resend-key",
            "RESEND_FROM_EMAIL": "alerts@pricevault.de",
        },
        fetch=lambda _request: (
            200,
            b'{"data":[{"name":"pricevault.de","status":"pending","capabilities":{"sending":"disabled"}}]}',
        ),
    )

    assert result["sender_domain"]["ok"] is False
    assert result["sender_domain"]["domain_status"] == "pending"
    assert result["sender_domain"]["sending_enabled"] is False
    assert "secret-resend-key" not in repr(result)


def test_supabase_probe_reports_missing_schema_columns():
    from verification.live_readiness import probe_supabase_schema

    requested_urls = []

    def fake_fetch(request):
        requested_urls.append(request.full_url)
        if "tenants?select=id&" in request.full_url:
            return 200, b"[]"
        raise HTTPError(
            request.full_url,
            400,
            "Bad Request",
            {},
            io.BytesIO(b'{"message":"column tenants.billing_provider does not exist"}'),
        )

    result = probe_supabase_schema(
        supabase_url="https://project.supabase.co/",
        service_key="secret-service-key",
        fetch=fake_fetch,
    )

    assert result["tenants_id"] == {"ok": True, "status": 200}
    assert result["tenants_viva_subscription"]["ok"] is False
    assert result["tenants_viva_subscription"]["status"] == 400
    assert "billing_provider" in result["tenants_viva_subscription"]["detail"]
    assert all("secret-service-key" not in url for url in requested_urls)


def test_supabase_probe_uses_implemented_schema_column_names():
    from verification.live_readiness import probe_supabase_schema

    requested_urls = []

    def fake_fetch(request):
        requested_urls.append(request.full_url)
        return 200, b"[]"

    result = probe_supabase_schema(
        supabase_url="https://project.supabase.co",
        service_key="secret-service-key",
        fetch=fake_fetch,
    )

    assert all(check["ok"] is True for check in result.values())
    urls = "\n".join(requested_urls)
    assert "competitors?select=id,tenant_id,shop_name,base_url" in urls
    assert "competitor_products?select=id,tenant_id,product_id,competitor_id,competitor_url" in urls
    assert "competitor_product_id" in urls
    assert "scraped_at" in urls
    assert "alerts?select=id,tenant_id,product_id,condition,threshold,notify_email" in urls
    assert "alert_events?select=id,tenant_id,alert_id,our_price,competitor_price,delta_pct,triggered_at" in urls
    assert "v_latest_prices?select=tenant_id,product_id,competitor_product_id,competitor_price,delta_pct" in urls
    assert "key_prefix" in urls
    assert "price_snapshots?select=id,tenant_id,product_id" not in urls
    assert "api_keys?select=id,tenant_id,name,key_hash,prefix" not in urls


def test_viva_probe_checks_oauth_and_webhook_without_exposing_credentials():
    from verification.live_readiness import probe_viva_credentials

    requests = []

    def fake_fetch(request):
        requests.append(request)
        if request.full_url.endswith("/connect/token"):
            return 200, b'{"access_token":"secret-token"}'
        return 200, b'{"Key":"secret-webhook-key"}'

    values = {
        "VIVA_ENVIRONMENT": "demo",
        "VIVA_CLIENT_ID": "secret-client",
        "VIVA_CLIENT_SECRET": "secret-client-value",
        "VIVA_MERCHANT_ID": "secret-merchant",
        "VIVA_API_KEY": "secret-api-key",
    }
    result = probe_viva_credentials(values=values, fetch=fake_fetch)

    assert result == {
        "oauth": {"ok": True, "status": 200},
        "webhook_key": {"ok": True, "status": 200},
    }
    assert requests[0].full_url.startswith("https://demo-accounts.vivapayments.com")
    assert requests[1].full_url.startswith("https://demo.vivapayments.com")
    assert all("secret" not in request.full_url for request in requests)
    assert "secret" not in repr(result)


def test_viva_probe_reports_invalid_merchant_credentials():
    from verification.live_readiness import probe_viva_credentials

    def fake_fetch(request):
        if request.full_url.endswith("/connect/token"):
            return 200, b'{"access_token":"token"}'
        raise HTTPError(request.full_url, 401, "Unauthorized", {}, io.BytesIO(b"{}"))

    result = probe_viva_credentials(
        values={
            "VIVA_ENVIRONMENT": "demo",
            "VIVA_CLIENT_ID": "client",
            "VIVA_CLIENT_SECRET": "client-secret",
            "VIVA_MERCHANT_ID": "merchant",
            "VIVA_API_KEY": "bad-key",
        },
        fetch=fake_fetch,
    )

    assert result["oauth"]["ok"] is True
    assert result["webhook_key"] == {"ok": False, "status": 401}


class FakeCursor:
    def __init__(self, row):
        self.row = row
        self.sql = None

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def execute(self, sql):
        self.sql = sql

    def fetchone(self):
        return self.row


class FakeConnection:
    def __init__(self, row):
        self.row = row

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def cursor(self):
        return FakeCursor(self.row)


def test_database_migration_probe_checks_alembic_version_without_printing_url():
    from verification.live_readiness import probe_database_migration

    def fake_connect(database_url):
        assert database_url == "postgresql://secret-host/db"
        return FakeConnection(("0014_tenant_reference_integrity",))

    result = probe_database_migration(
        database_url="postgresql://secret-host/db",
        expected_head="0014_tenant_reference_integrity",
        connect=fake_connect,
    )

    assert result == {
        "ok": True,
        "current": "0014_tenant_reference_integrity",
        "expected": "0014_tenant_reference_integrity",
    }
    assert "secret-host" not in repr(result)


def test_database_migration_probe_reports_head_mismatch():
    from verification.live_readiness import probe_database_migration

    result = probe_database_migration(
        database_url="postgresql://secret-host/db",
        expected_head="0014_tenant_reference_integrity",
        connect=lambda _url: FakeConnection(("0011_acceptance_required_for_team_admin",)),
    )

    assert result["ok"] is False
    assert result["current"] == "0011_acceptance_required_for_team_admin"
    assert result["expected"] == "0014_tenant_reference_integrity"


def test_readiness_report_includes_database_migration_probe(tmp_path):
    from verification.live_readiness import build_report

    backend_env = tmp_path / "backend.env"
    dashboard_env = tmp_path / "dashboard.env"
    backend_env.write_text(
        "\n".join(
            [
                "SUPABASE_URL=https://project.supabase.co",
                "SUPABASE_SERVICE_KEY=secret-service-key",
                "DATABASE_URL=postgresql://secret-host/db",
            ]
        )
    )
    dashboard_env.write_text("")

    report = build_report(
        backend_env_path=backend_env,
        dashboard_env_path=dashboard_env,
        skip_network=False,
        fetch=lambda _request: (200, b"[]"),
        database_connect=lambda _url: FakeConnection(("0015_viva_billing",)),
    )

    assert report["database_migration"]["ok"] is True
    assert report["database_migration"]["current"] == "0015_viva_billing"
    assert "secret-host" not in repr(report)
