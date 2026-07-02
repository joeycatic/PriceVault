"""Local development readiness checks that avoid production-only gates."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from verification.live_readiness import merge_env_file_with_process, presence_report


BACKEND_LOCAL_ENV_KEYS = (
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_KEY",
    "DATABASE_URL",
    "REDIS_URL",
    "BROWSERLESS_TOKEN",
    "CONNECTOR_ENCRYPTION_KEY",
)

DASHBOARD_LOCAL_ENV_KEYS = (
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "BACKEND_URL",
)

Fetch = Callable[[Request], tuple[int, bytes]]


def _fetch_urlopen(request: Request) -> tuple[int, bytes]:
    with urlopen(request, timeout=8) as response:
        return response.status, response.read()


def _http_probe(url: str, *, fetch: Fetch = _fetch_urlopen) -> dict[str, object]:
    request = Request(url, headers={"Accept": "application/json,text/html"})
    try:
        status, _body = fetch(request)
    except HTTPError as exc:
        return {"ok": False, "status": exc.code}
    except (OSError, URLError) as exc:
        return {"ok": False, "error": type(exc).__name__}
    return {"ok": 200 <= status < 400, "status": status}


def build_report(
    *,
    backend_env_path: Path,
    dashboard_env_path: Path,
    backend_url: str | None = None,
    dashboard_url: str | None = None,
    fetch: Fetch = _fetch_urlopen,
) -> dict[str, object]:
    backend_env = merge_env_file_with_process(backend_env_path)
    dashboard_env = merge_env_file_with_process(dashboard_env_path)

    resolved_backend_url = (
        backend_url
        or dashboard_env.get("BACKEND_URL")
        or os.environ.get("BACKEND_URL")
        or "http://127.0.0.1:8000"
    ).rstrip("/")
    resolved_dashboard_url = (
        dashboard_url
        or os.environ.get("DASHBOARD_URL")
        or "http://localhost:3000"
    ).rstrip("/")

    env = {
        "backend": presence_report(backend_env, BACKEND_LOCAL_ENV_KEYS),
        "dashboard": presence_report(dashboard_env, DASHBOARD_LOCAL_ENV_KEYS),
    }
    services = {
        "backend_health": _http_probe(f"{resolved_backend_url}/health", fetch=fetch),
        "worker_health": _http_probe(f"{resolved_backend_url}/health/worker", fetch=fetch),
        "dashboard_login": _http_probe(f"{resolved_dashboard_url}/login", fetch=fetch),
    }
    report: dict[str, object] = {
        "env": env,
        "services": services,
        "urls": {
            "backend": resolved_backend_url,
            "dashboard": resolved_dashboard_url,
        },
    }
    report["ready"] = (
        all(env["backend"].values())
        and all(env["dashboard"].values())
        and all(
            isinstance(service, dict) and service.get("ok") is True
            for service in services.values()
        )
    )
    return report


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check local PriceVault readiness without production-only services."
    )
    parser.add_argument("--backend-env", type=Path, default=Path(".env"))
    parser.add_argument(
        "--dashboard-env",
        type=Path,
        default=Path("../dashboard/.env.local"),
    )
    parser.add_argument("--backend-url", default=None)
    parser.add_argument("--dashboard-url", default=None)
    args = parser.parse_args()

    report = build_report(
        backend_env_path=args.backend_env,
        dashboard_env_path=args.dashboard_env,
        backend_url=args.backend_url,
        dashboard_url=args.dashboard_url,
    )
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
