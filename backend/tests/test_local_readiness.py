from pathlib import Path


def _write_env(path: Path, values: dict[str, str]) -> None:
    path.write_text("\n".join(f"{key}={value}" for key, value in values.items()))


def test_local_readiness_passes_without_production_only_services(tmp_path, monkeypatch):
    from verification import local_readiness

    for key in (
        *local_readiness.BACKEND_LOCAL_ENV_KEYS,
        *local_readiness.DASHBOARD_LOCAL_ENV_KEYS,
        "RESEND_API_KEY",
        "VIVA_API_KEY",
        "SENTRY_DSN_BACKEND",
    ):
        monkeypatch.delenv(key, raising=False)

    backend_env = tmp_path / "backend.env"
    dashboard_env = tmp_path / "dashboard.env"
    _write_env(
        backend_env,
        {
            "SUPABASE_URL": "https://project.supabase.co",
            "SUPABASE_ANON_KEY": "anon",
            "SUPABASE_SERVICE_KEY": "service",
            "DATABASE_URL": "postgresql://postgres:postgres@localhost:5432/postgres",
            "REDIS_URL": "redis://localhost:6379",
            "BROWSERLESS_TOKEN": "browserless",
            "CONNECTOR_ENCRYPTION_KEY": "connector",
        },
    )
    _write_env(
        dashboard_env,
        {
            "NEXT_PUBLIC_SUPABASE_URL": "https://project.supabase.co",
            "NEXT_PUBLIC_SUPABASE_ANON_KEY": "anon",
            "BACKEND_URL": "http://127.0.0.1:8000",
        },
    )

    requested_urls = []

    def fake_fetch(request):
        requested_urls.append(request.full_url)
        return 200, b"ok"

    report = local_readiness.build_report(
        backend_env_path=backend_env,
        dashboard_env_path=dashboard_env,
        fetch=fake_fetch,
    )

    assert report["ready"] is True
    assert requested_urls == [
        "http://127.0.0.1:8000/health",
        "http://127.0.0.1:8000/health/worker",
        "http://localhost:3000/login",
    ]
    assert "browserless" not in repr(report)


def test_local_readiness_reports_missing_local_env_and_dead_service(tmp_path, monkeypatch):
    from verification import local_readiness

    for key in (*local_readiness.BACKEND_LOCAL_ENV_KEYS, *local_readiness.DASHBOARD_LOCAL_ENV_KEYS):
        monkeypatch.delenv(key, raising=False)

    backend_env = tmp_path / "backend.env"
    dashboard_env = tmp_path / "dashboard.env"
    _write_env(backend_env, {"SUPABASE_URL": "https://project.supabase.co"})
    _write_env(dashboard_env, {"BACKEND_URL": "http://127.0.0.1:8000"})

    def fake_fetch(_request):
        raise OSError("connection refused")

    report = local_readiness.build_report(
        backend_env_path=backend_env,
        dashboard_env_path=dashboard_env,
        fetch=fake_fetch,
    )

    assert report["ready"] is False
    assert report["env"]["backend"]["SUPABASE_URL"] is True
    assert report["env"]["backend"]["REDIS_URL"] is False
    assert report["env"]["dashboard"]["NEXT_PUBLIC_SUPABASE_URL"] is False
    assert report["services"]["backend_health"] == {"ok": False, "error": "OSError"}
