import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

ALLOWED_ADMIN_CONTEXT_CALLERS = {
    Path("auth/api_key_middleware.py"),
    Path("jobs/billing_tasks.py"),
    Path("jobs/retry.py"),
    Path("jobs/scrape_tasks.py"),
    Path("scheduler.py"),
    Path("webhooks/viva_handler.py"),
}

ALLOWED_ADMIN_CLIENT_CALLERS = {
    Path("db/client.py"),
    Path("routers/team.py"),
}


def _python_files() -> list[Path]:
    return [
        path
        for path in ROOT.rglob("*.py")
        if ".venv" not in path.parts
        and "__pycache__" not in path.parts
        and ".pytest_cache" not in path.parts
    ]


def _call_name(node: ast.AST) -> str:
    if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return ""


def test_service_role_usage_stays_in_trusted_server_paths():
    admin_context_callers: set[Path] = set()
    admin_client_callers: set[Path] = set()

    for path in _python_files():
        if path.relative_to(ROOT) == Path("tests/test_supabase_admin_boundary.py"):
            continue
        tree = ast.parse(path.read_text(), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            name = _call_name(node.func)
            relative = path.relative_to(ROOT)
            if name == "supabase_context" and any(
                keyword.arg == "admin"
                and isinstance(keyword.value, ast.Constant)
                and keyword.value.value is True
                for keyword in node.keywords
            ):
                admin_context_callers.add(relative)
            if name == "get_supabase_admin":
                admin_client_callers.add(relative)

    assert admin_context_callers == ALLOWED_ADMIN_CONTEXT_CALLERS
    assert admin_client_callers == ALLOWED_ADMIN_CLIENT_CALLERS
