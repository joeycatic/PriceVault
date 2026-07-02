"""Postgres migration smoke test for Supabase-compatible schemas."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

import psycopg2
from psycopg2.extensions import connection as PsycopgConnection


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _execute(connection: PsycopgConnection, sql: str) -> None:
    with connection.cursor() as cursor:
        cursor.execute(sql)
    connection.commit()


def install_supabase_auth_stubs(database_url: str) -> None:
    """Install the minimal Supabase auth objects required by local migrations."""
    with psycopg2.connect(database_url) as connection:
        _execute(
            connection,
            """
            do $$
            begin
              if not exists (select 1 from pg_roles where rolname = 'authenticated') then
                create role authenticated;
              end if;
              if not exists (select 1 from pg_roles where rolname = 'service_role') then
                create role service_role;
              end if;
            end $$;

            create schema if not exists auth;
            create table if not exists auth.users (
              id uuid primary key,
              email text
            );

            create or replace function auth.uid()
            returns uuid
            language sql
            stable
            as $$
              select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
            $$;
            """,
        )


def _alembic(database_url: str, *args: str) -> None:
    env = os.environ.copy()
    env["DATABASE_URL"] = database_url
    subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "db/alembic.ini", *args],
        cwd=BACKEND_ROOT,
        env=env,
        check=True,
    )


def run_smoke(database_url: str, downgrade_target: str) -> None:
    install_supabase_auth_stubs(database_url)
    _alembic(database_url, "upgrade", "head")
    _alembic(database_url, "downgrade", downgrade_target)
    _alembic(database_url, "upgrade", "head")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Apply, downgrade, and reapply Alembic migrations against Postgres."
    )
    parser.add_argument(
        "--database-url",
        default=os.environ.get("DATABASE_URL"),
        help="Postgres DATABASE_URL for a disposable migration smoke database.",
    )
    parser.add_argument(
        "--downgrade-target",
        default="0008_team_member_access",
        help="Revision to downgrade to before re-upgrading to head.",
    )
    args = parser.parse_args()
    if not args.database_url:
        parser.error("--database-url or DATABASE_URL is required")
    run_smoke(args.database_url, args.downgrade_target)
    print("migration_smoke_ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
