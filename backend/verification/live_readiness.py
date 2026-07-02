"""Live production readiness checks that never print secret values."""

from __future__ import annotations

import argparse
import base64
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import psycopg2
from alembic.config import Config
from alembic.script import ScriptDirectory


BACKEND_ROOT = Path(__file__).resolve().parents[1]

BACKEND_ENV_KEYS = (
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_KEY",
    "DATABASE_URL",
    "BROWSERLESS_TOKEN",
    "REDIS_URL",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "VIVA_CLIENT_ID",
    "VIVA_CLIENT_SECRET",
    "VIVA_MERCHANT_ID",
    "VIVA_API_KEY",
    "VIVA_SOURCE_CODE",
    "VIVA_ENVIRONMENT",
    "SENTRY_DSN_BACKEND",
    "APP_URL",
    "CONNECTOR_ENCRYPTION_KEY",
)

DASHBOARD_ENV_KEYS = (
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "BACKEND_URL",
    "NEXT_PUBLIC_SENTRY_DSN",
)


@dataclass(frozen=True)
class SchemaCheck:
    name: str
    table: str
    select: str


SUPABASE_SCHEMA_CHECKS = (
    SchemaCheck("tenants_id", "tenants", "id"),
    SchemaCheck("tenants_plan", "tenants", "id,plan"),
    SchemaCheck("tenants_viva_subscription", "tenants", "id,billing_provider,viva_initial_transaction_id,subscription_status,subscription_plan,subscription_current_period_end"),
    SchemaCheck("billing_orders", "billing_orders", "id,tenant_id,order_code,plan,status"),
    SchemaCheck("competitors_baseline", "competitors", "id,tenant_id,shop_name,base_url"),
    SchemaCheck("products_baseline", "products", "id,tenant_id,name"),
    SchemaCheck(
        "competitor_products_baseline",
        "competitor_products",
        "id,tenant_id,product_id,competitor_id,competitor_url",
    ),
    SchemaCheck(
        "snapshots_phase2",
        "price_snapshots",
        "id,tenant_id,competitor_product_id,scraped_at,scrape_ok",
    ),
    SchemaCheck(
        "alerts_baseline",
        "alerts",
        "id,tenant_id,product_id,condition,threshold,notify_email",
    ),
    SchemaCheck(
        "alert_events",
        "alert_events",
        "id,tenant_id,alert_id,our_price,competitor_price,delta_pct,triggered_at",
    ),
    SchemaCheck(
        "latest_prices_view",
        "v_latest_prices",
        "tenant_id,product_id,competitor_product_id,competitor_price,delta_pct",
    ),
    SchemaCheck(
        "scrape_failures",
        "scrape_failures",
        "id,tenant_id,product_id,error,attempts",
    ),
    SchemaCheck(
        "api_keys",
        "api_keys",
        "id,tenant_id,name,key_hash,key_prefix,last_used,revoked",
    ),
    SchemaCheck(
        "alert_channels",
        "alert_channels",
        "id,tenant_id,type,config,active",
    ),
    SchemaCheck(
        "team_members",
        "team_members",
        "id,tenant_id,user_id,role,accepted",
    ),
    SchemaCheck(
        "connector_sources",
        "connector_sources",
        "id,tenant_id,type,config,active,last_sync_status",
    ),
    SchemaCheck(
        "audit_events",
        "audit_events",
        "id,tenant_id,action,resource_type,created_at",
    ),
    SchemaCheck(
        "scrape_jobs",
        "scrape_jobs",
        "id,tenant_id,competitor_product_id,state,queued_at",
    ),
    SchemaCheck(
        "report_schedules",
        "report_schedules",
        "id,tenant_id,name,cadence,recipients,active",
    ),
    SchemaCheck(
        "report_runs",
        "report_runs",
        "id,tenant_id,status,recipients,created_at",
    ),
    SchemaCheck(
        "connector_sync_runs",
        "connector_sync_runs",
        "id,tenant_id,connector_id,status,created_at",
    ),
)


FetchResult = tuple[int, bytes]
Fetch = Callable[[Request], FetchResult]
DatabaseConnect = Callable[[str], object]


def read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def merge_env_file_with_process(path: Path) -> dict[str, str]:
    values = read_env_file(path)
    for key, value in os.environ.items():
        if value:
            values[key] = value
    return values


def presence_report(values: dict[str, str], keys: tuple[str, ...]) -> dict[str, bool]:
    return {key: bool(values.get(key)) for key in keys}


def _fetch_urlopen(request: Request) -> FetchResult:
    with urlopen(request, timeout=12) as response:
        return response.status, response.read()


def _http_error_detail(error: HTTPError) -> str:
    body = error.read().decode("utf-8", errors="replace")[:500]
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return body
    return (
        payload.get("message")
        or payload.get("hint")
        or payload.get("code")
        or body
    )


def _sender_domain(sender: str) -> str:
    email = sender.strip()
    if "<" in email and ">" in email:
        email = email.split("<", 1)[1].split(">", 1)[0]
    if "@" not in email:
        return ""
    return email.rsplit("@", 1)[1].strip().lower()


def probe_resend_domain(
    *,
    values: dict[str, str],
    fetch: Fetch = _fetch_urlopen,
) -> dict[str, dict[str, object]]:
    domain = _sender_domain(values.get("RESEND_FROM_EMAIL", ""))
    if not domain:
        return {
            "sender_domain": {
                "ok": False,
                "status": "invalid_sender",
            }
        }
    if domain == "resend.dev":
        return {
            "sender_domain": {
                "ok": False,
                "status": "testing_sender",
                "domain": domain,
            }
        }

    request = Request(
        "https://api.resend.com/domains?limit=100",
        headers={
            "Authorization": f'Bearer {values["RESEND_API_KEY"]}',
            "Accept": "application/json",
        },
    )
    try:
        status, body = fetch(request)
        payload = json.loads(body)
        domains = payload.get("data") if isinstance(payload, dict) else []
        match = next(
            (
                item
                for item in domains
                if isinstance(item, dict)
                and str(item.get("name", "")).lower() == domain
            ),
            None,
        )
        domain_status = match.get("status") if match else None
        capabilities = match.get("capabilities", {}) if match else {}
        sending = (
            capabilities.get("sending")
            if isinstance(capabilities, dict)
            else None
        )
        return {
            "sender_domain": {
                "ok": (
                    200 <= status < 300
                    and domain_status == "verified"
                    and sending == "enabled"
                ),
                "status": status,
                "domain": domain,
                "domain_status": domain_status,
                "sending_enabled": sending == "enabled",
            }
        }
    except (HTTPError, URLError, json.JSONDecodeError) as exc:
        return {
            "sender_domain": {
                "ok": False,
                "status": exc.code if isinstance(exc, HTTPError) else "request_error",
                "domain": domain,
            }
        }


def probe_supabase_schema(
    *,
    supabase_url: str,
    service_key: str,
    fetch: Fetch = _fetch_urlopen,
) -> dict[str, dict[str, object]]:
    results: dict[str, dict[str, object]] = {}
    base_url = supabase_url.rstrip("/")

    for check in SUPABASE_SCHEMA_CHECKS:
        endpoint = (
            f"{base_url}/rest/v1/{check.table}"
            f"?select={check.select}&limit=1"
        )
        request = Request(
            endpoint,
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Accept": "application/json",
            },
        )
        try:
            status, _body = fetch(request)
            results[check.name] = {"ok": 200 <= status < 300, "status": status}
        except HTTPError as exc:
            results[check.name] = {
                "ok": False,
                "status": exc.code,
                "detail": _http_error_detail(exc),
            }
        except URLError as exc:
            results[check.name] = {
                "ok": False,
                "status": "url_error",
                "detail": str(exc.reason),
            }

    return results


def probe_viva_credentials(
    *,
    values: dict[str, str],
    fetch: Fetch = _fetch_urlopen,
) -> dict[str, dict[str, object]]:
    demo = values.get("VIVA_ENVIRONMENT", "demo").lower() != "live"
    accounts_base = (
        "https://demo-accounts.vivapayments.com"
        if demo
        else "https://accounts.vivapayments.com"
    )
    checkout_base = (
        "https://demo.vivapayments.com"
        if demo
        else "https://www.vivapayments.com"
    )
    results: dict[str, dict[str, object]] = {}

    token_request = Request(
        f"{accounts_base}/connect/token",
        data=urlencode({"grant_type": "client_credentials"}).encode(),
        headers={
            "Authorization": "Basic "
            + base64.b64encode(
                f'{values["VIVA_CLIENT_ID"]}:{values["VIVA_CLIENT_SECRET"]}'.encode()
            ).decode(),
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    try:
        status, body = fetch(token_request)
        payload = json.loads(body)
        token = payload.get("access_token") if isinstance(payload, dict) else None
        results["oauth"] = {
            "ok": 200 <= status < 300 and bool(token),
            "status": status,
        }
    except (HTTPError, URLError, json.JSONDecodeError) as exc:
        results["oauth"] = {
            "ok": False,
            "status": exc.code if isinstance(exc, HTTPError) else "request_error",
        }

    basic = base64.b64encode(
        f'{values["VIVA_MERCHANT_ID"]}:{values["VIVA_API_KEY"]}'.encode()
    ).decode()
    webhook_request = Request(
        f"{checkout_base}/api/messages/config/token",
        headers={"Authorization": f"Basic {basic}", "Accept": "application/json"},
    )
    try:
        status, body = fetch(webhook_request)
        payload = json.loads(body)
        key = (
            payload.get("Key") or payload.get("key")
            if isinstance(payload, dict)
            else None
        )
        results["webhook_key"] = {
            "ok": 200 <= status < 300 and bool(key),
            "status": status,
        }
    except (HTTPError, URLError, json.JSONDecodeError) as exc:
        results["webhook_key"] = {
            "ok": False,
            "status": exc.code if isinstance(exc, HTTPError) else "request_error",
        }

    return results


def current_alembic_head() -> str:
    config = Config(str(BACKEND_ROOT / "db" / "alembic.ini"))
    config.set_main_option(
        "script_location", str(BACKEND_ROOT / "db" / "migrations")
    )
    config.set_main_option("path_separator", "os")
    script = ScriptDirectory.from_config(config)
    heads = script.get_heads()
    if len(heads) != 1:
        return ",".join(sorted(heads))
    return heads[0]


def probe_database_migration(
    *,
    database_url: str,
    expected_head: str | None = None,
    connect: DatabaseConnect = psycopg2.connect,
) -> dict[str, object]:
    expected = expected_head or current_alembic_head()
    try:
        with connect(database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute("select version_num from alembic_version")
                row = cursor.fetchone()
    except Exception as exc:
        return {"ok": False, "expected": expected, "detail": exc.__class__.__name__}

    current = row[0] if row else None
    compatible_heads = {expected}
    if expected == "0016_launch_surfaces":
        compatible_heads.add("0015_viva_billing")
    return {
        "ok": current in compatible_heads,
        "current": current,
        "expected": expected,
    }


def build_report(
    *,
    backend_env_path: Path,
    dashboard_env_path: Path,
    skip_network: bool = False,
    fetch: Fetch = _fetch_urlopen,
    database_connect: DatabaseConnect = psycopg2.connect,
) -> dict[str, object]:
    backend_env = merge_env_file_with_process(backend_env_path)
    dashboard_env = merge_env_file_with_process(dashboard_env_path)

    env_report = {
        "backend": presence_report(backend_env, BACKEND_ENV_KEYS),
        "dashboard": presence_report(dashboard_env, DASHBOARD_ENV_KEYS),
    }
    report: dict[str, object] = {"env": env_report}

    viva_keys = (
        "VIVA_CLIENT_ID",
        "VIVA_CLIENT_SECRET",
        "VIVA_MERCHANT_ID",
        "VIVA_API_KEY",
        "VIVA_SOURCE_CODE",
    )
    if skip_network:
        report["viva"] = {"skipped": "network_disabled"}
    elif not all(backend_env.get(key) for key in viva_keys):
        report["viva"] = {"skipped": "missing_VIVA_configuration"}
    else:
        report["viva"] = probe_viva_credentials(values=backend_env, fetch=fetch)

    resend_keys = ("RESEND_API_KEY", "RESEND_FROM_EMAIL")
    if skip_network:
        report["resend"] = {"skipped": "network_disabled"}
    elif not all(backend_env.get(key) for key in resend_keys):
        report["resend"] = {"skipped": "missing_RESEND_configuration"}
    else:
        report["resend"] = probe_resend_domain(values=backend_env, fetch=fetch)

    supabase_url = backend_env.get("SUPABASE_URL", "")
    service_key = backend_env.get("SUPABASE_SERVICE_KEY", "")
    if skip_network:
        report["supabase_schema"] = {"skipped": "network_disabled"}
    elif not supabase_url or not service_key:
        report["supabase_schema"] = {
            "skipped": "missing_SUPABASE_URL_or_SUPABASE_SERVICE_KEY"
        }
    else:
        report["supabase_schema"] = probe_supabase_schema(
            supabase_url=supabase_url,
            service_key=service_key,
            fetch=fetch,
        )

    database_url = backend_env.get("DATABASE_URL", "")
    if skip_network:
        report["database_migration"] = {"skipped": "network_disabled"}
    elif not database_url:
        report["database_migration"] = {"skipped": "missing_DATABASE_URL"}
    else:
        report["database_migration"] = probe_database_migration(
            database_url=database_url,
            connect=database_connect,
        )

    report["ready"] = _is_ready(report)
    return report


def _is_ready(report: dict[str, object]) -> bool:
    env = report["env"]
    assert isinstance(env, dict)
    backend = env["backend"]
    dashboard = env["dashboard"]
    assert isinstance(backend, dict)
    assert isinstance(dashboard, dict)
    if not all(backend.values()) or not all(dashboard.values()):
        return False

    schema = report["supabase_schema"]
    if not isinstance(schema, dict) or "skipped" in schema:
        return False
    if not all(
        isinstance(result, dict) and result.get("ok") is True
        for result in schema.values()
    ):
        return False

    database = report["database_migration"]
    if not isinstance(database, dict) or "skipped" in database:
        return False
    if database.get("ok") is not True:
        return False

    viva = report["viva"]
    if not isinstance(viva, dict) or "skipped" in viva:
        return False
    if not all(
        isinstance(result, dict) and result.get("ok") is True
        for result in viva.values()
    ):
        return False

    resend = report["resend"]
    if not isinstance(resend, dict) or "skipped" in resend:
        return False
    return all(
        isinstance(result, dict) and result.get("ok") is True
        for result in resend.values()
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check PriceVault live-service readiness without printing secrets."
    )
    parser.add_argument(
        "--backend-env",
        type=Path,
        default=Path(".env"),
        help="Path to backend .env file; process env overrides file values.",
    )
    parser.add_argument(
        "--dashboard-env",
        type=Path,
        default=Path("../dashboard/.env.local"),
        help="Path to dashboard .env.local file; process env overrides file values.",
    )
    parser.add_argument(
        "--skip-network",
        action="store_true",
        help="Only check environment presence; do not call Supabase REST.",
    )
    args = parser.parse_args()

    report = build_report(
        backend_env_path=args.backend_env,
        dashboard_env_path=args.dashboard_env,
        skip_network=args.skip_network,
    )
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
