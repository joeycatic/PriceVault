import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class FakeCursor:
    def __init__(self, calls):
        self.calls = calls

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def execute(self, sql):
        self.calls.append(sql)


class FakeConnection:
    def __init__(self, calls):
        self.calls = calls
        self.commits = 0

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def cursor(self):
        return FakeCursor(self.calls)

    def commit(self):
        self.commits += 1


def test_install_supabase_auth_stubs_creates_required_objects(monkeypatch):
    from verification import migration_smoke

    calls = []
    connections = []

    def fake_connect(database_url):
        assert database_url == "postgresql://test"
        connection = FakeConnection(calls)
        connections.append(connection)
        return connection

    monkeypatch.setattr(migration_smoke.psycopg2, "connect", fake_connect)

    migration_smoke.install_supabase_auth_stubs("postgresql://test")

    assert connections[0].commits == 1
    sql = calls[0]
    assert "create role authenticated" in sql
    assert "create role service_role" in sql
    assert "create schema if not exists auth" in sql
    assert "create table if not exists auth.users" in sql
    assert "create or replace function auth.uid()" in sql


def test_run_smoke_installs_stubs_and_runs_upgrade_downgrade_upgrade(monkeypatch):
    from verification import migration_smoke

    installed = []
    alembic_calls = []

    monkeypatch.setattr(
        migration_smoke,
        "install_supabase_auth_stubs",
        lambda database_url: installed.append(database_url),
    )
    monkeypatch.setattr(
        migration_smoke,
        "_alembic",
        lambda database_url, *args: alembic_calls.append((database_url, args)),
    )

    migration_smoke.run_smoke("postgresql://test", "0008_team_member_access")

    assert installed == ["postgresql://test"]
    assert alembic_calls == [
        ("postgresql://test", ("upgrade", "head")),
        ("postgresql://test", ("downgrade", "0008_team_member_access")),
        ("postgresql://test", ("upgrade", "head")),
    ]


def test_alembic_uses_current_python_and_backend_root(monkeypatch):
    from verification import migration_smoke

    runs = []

    def fake_run(command, cwd, env, check):
        runs.append((command, cwd, env, check))

    monkeypatch.setattr(migration_smoke.subprocess, "run", fake_run)

    migration_smoke._alembic("postgresql://test", "heads")

    command, cwd, env, check = runs[0]
    assert command == [sys.executable, "-m", "alembic", "-c", "db/alembic.ini", "heads"]
    assert cwd == migration_smoke.BACKEND_ROOT
    assert env["DATABASE_URL"] == "postgresql://test"
    assert check is True


def test_main_requires_database_url(monkeypatch, capsys):
    from verification import migration_smoke

    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(sys, "argv", ["migration_smoke"])

    try:
        migration_smoke.main()
    except SystemExit as exc:
        assert exc.code == 2
    else:
        raise AssertionError("main should exit when DATABASE_URL is missing")

    assert "DATABASE_URL is required" in capsys.readouterr().err


def test_main_runs_smoke_from_cli_argument(monkeypatch, capsys):
    from verification import migration_smoke

    calls = []
    monkeypatch.setattr(
        migration_smoke,
        "run_smoke",
        lambda database_url, downgrade_target: calls.append((database_url, downgrade_target)),
    )
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "migration_smoke",
            "--database-url",
            "postgresql://test",
            "--downgrade-target",
            "0007_connector_sources",
        ],
    )

    assert migration_smoke.main() == 0
    assert calls == [("postgresql://test", "0007_connector_sources")]
    assert "migration_smoke_ok" in capsys.readouterr().out
