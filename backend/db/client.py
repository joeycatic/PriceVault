"""Supabase clients for RLS-scoped requests and trusted server handlers."""

import os
from contextlib import contextmanager
from contextvars import ContextVar
from functools import lru_cache
from collections.abc import Iterator

from dotenv import load_dotenv
from supabase import Client, create_client


load_dotenv()

_access_token: ContextVar[str | None] = ContextVar("supabase_access_token", default=None)
_admin_mode: ContextVar[bool] = ContextVar("supabase_admin_mode", default=False)


def _supabase_url() -> str:
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    if not url:
        raise RuntimeError("SUPABASE_URL must be configured")
    return url


def _anon_key() -> str:
    key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not key:
        raise RuntimeError("SUPABASE_ANON_KEY must be configured for RLS-scoped queries")
    return key


def _service_key() -> str:
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not key:
        raise RuntimeError("SUPABASE_SERVICE_KEY must be configured for trusted handlers")
    return key


def get_supabase() -> Client:
    """Return a request-scoped Supabase client that preserves RLS."""
    if _admin_mode.get():
        return get_supabase_admin()

    client = create_client(_supabase_url(), _anon_key())
    token = _access_token.get()
    if token:
        client.postgrest.auth(token)
    return client


@lru_cache(maxsize=1)
def get_supabase_admin() -> Client:
    """Return the service-role client for trusted webhooks, jobs, and admin APIs."""
    return create_client(_supabase_url(), _service_key())


@contextmanager
def supabase_context(
    *, access_token: str | None = None, admin: bool = False
) -> Iterator[None]:
    token_state = _access_token.set(access_token)
    admin_state = _admin_mode.set(admin)
    try:
        yield
    finally:
        _access_token.reset(token_state)
        _admin_mode.reset(admin_state)
