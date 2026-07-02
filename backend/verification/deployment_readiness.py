"""Deployment readiness checks that report metadata without printing secrets."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path
from typing import Callable, Sequence


ROOT = Path(__file__).resolve().parents[2]

REQUIRED_ACTIONS_SECRETS = (
    "TEST_DATABASE_URL",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_KEY",
    "RAILWAY_TOKEN",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SENTRY_DSN",
    "VERCEL_TOKEN",
    "VERCEL_ORG_ID",
    "VERCEL_PROJECT_ID",
)

WORKFLOW_FILES = ("backend.yml", "dashboard.yml")

RunCommand = Callable[[Sequence[str], Path], subprocess.CompletedProcess[str]]


def _run_command(
    command: Sequence[str], cwd: Path
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        list(command),
        cwd=cwd,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def _read(path: Path) -> str:
    return path.read_text() if path.exists() else ""


def check_local_workflows(root: Path = ROOT) -> dict[str, object]:
    active = root / ".github" / "workflows"
    documented = root / "infra" / ".github" / "workflows"
    files: dict[str, dict[str, object]] = {}

    for name in WORKFLOW_FILES:
        active_path = active / name
        documented_path = documented / name
        active_text = _read(active_path)
        documented_text = _read(documented_path)
        files[name] = {
            "active_exists": active_path.exists(),
            "documented_exists": documented_path.exists(),
            "copies_match": active_text == documented_text,
        }

    backend = _read(active / "backend.yml")
    dashboard = _read(active / "dashboard.yml")
    checks = {
        "backend_deploys_backend_service": "railway up --service pricevault-backend --ci" in backend,
        "backend_deploys_worker_service": "railway up --service pricevault-worker --ci" in backend,
        "backend_uses_supported_railway_cli": "@railway/cli@5.23.3" in backend,
        "backend_avoids_removed_railway_action": "railwayapp/railway-action" not in backend,
        "backend_supports_manual_dispatch": "workflow_dispatch:" in backend,
        "dashboard_deploys_vercel": "amondnet/vercel-action@v25" in dashboard,
        "dashboard_builds_before_deploy": "npm run build" in dashboard,
        "dashboard_supports_manual_dispatch": "workflow_dispatch:" in dashboard,
    }

    return {
        "ok": all(
            file_report["active_exists"]
            and file_report["documented_exists"]
            and file_report["copies_match"]
            for file_report in files.values()
        )
        and all(checks.values()),
        "files": files,
        "checks": checks,
    }


def check_local_deploy_links(root: Path = ROOT) -> dict[str, object]:
    vercel_candidates = (
        root / ".vercel" / "project.json",
        root / "dashboard" / ".vercel" / "project.json",
    )
    railway_candidates = (
        root / ".railway" / "project.json",
        root / ".railway" / "link.toml",
        root / "backend" / ".railway" / "project.json",
        root / "backend" / ".railway" / "link.toml",
    )
    vercel_link = next((path for path in vercel_candidates if path.exists()), None)
    railway_link = next((path for path in railway_candidates if path.exists()), None)

    return {
        "ok": bool(vercel_link and railway_link),
        "vercel_project_linked": bool(vercel_link),
        "railway_project_linked": bool(railway_link),
    }


def _gh_available() -> bool:
    return shutil.which("gh") is not None


def check_github_actions(
    *,
    root: Path = ROOT,
    run_command: RunCommand = _run_command,
) -> dict[str, object]:
    if not _gh_available():
        return {"ok": False, "skipped": "gh_not_installed"}

    secret_result = run_command(("gh", "secret", "list", "--app", "actions"), root)
    if secret_result.returncode != 0:
        return {
            "ok": False,
            "secrets": {"ok": False, "status": "gh_error"},
            "runs": {"ok": False, "status": "not_checked"},
            "remote_workflows": {"ok": False, "status": "not_checked"},
        }

    configured = {
        line.split()[0]
        for line in secret_result.stdout.splitlines()
        if line.strip()
    }
    missing = [
        name for name in REQUIRED_ACTIONS_SECRETS if name not in configured
    ]

    workflows_result = run_command(
        (
            "gh",
            "api",
            "repos/:owner/:repo/contents/.github/workflows",
            "--jq",
            ".[].name",
        ),
        root,
    )
    remote_names = {
        line.strip()
        for line in workflows_result.stdout.splitlines()
        if line.strip()
    }
    remote_missing = [
        name for name in WORKFLOW_FILES if name not in remote_names
    ]

    runs_result = run_command(
        (
            "gh",
            "run",
            "list",
            "--limit",
            "1",
            "--json",
            "databaseId,status,conclusion,workflowName",
        ),
        root,
    )
    try:
        runs_payload = json.loads(runs_result.stdout or "[]")
    except json.JSONDecodeError:
        runs_payload = []

    return {
        "ok": not missing
        and workflows_result.returncode == 0
        and not remote_missing
        and runs_result.returncode == 0
        and bool(runs_payload),
        "secrets": {
            "ok": not missing,
            "configured_count": len(configured),
            "missing": missing,
        },
        "remote_workflows": {
            "ok": workflows_result.returncode == 0 and not remote_missing,
            "missing": remote_missing,
        },
        "runs": {
            "ok": runs_result.returncode == 0 and bool(runs_payload),
            "count": len(runs_payload) if isinstance(runs_payload, list) else 0,
        },
    }


def build_report(
    *,
    root: Path = ROOT,
    skip_github: bool = False,
    run_command: RunCommand = _run_command,
) -> dict[str, object]:
    report: dict[str, object] = {
        "local_workflows": check_local_workflows(root),
        "local_deploy_links": check_local_deploy_links(root),
    }
    if skip_github:
        report["github_actions"] = {"skipped": "github_checks_disabled"}
    else:
        report["github_actions"] = check_github_actions(
            root=root,
            run_command=run_command,
        )

    report["ready"] = all(
        isinstance(section, dict) and section.get("ok") is True
        for section in report.values()
        if isinstance(section, dict) and "skipped" not in section
    ) and "skipped" not in report.get("github_actions", {})
    return report


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check deployment readiness without printing secret values."
    )
    parser.add_argument(
        "--skip-github",
        action="store_true",
        help="Only check local workflow and deploy-link files.",
    )
    args = parser.parse_args()

    report = build_report(skip_github=args.skip_github)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
