import subprocess
from pathlib import Path


def _completed(stdout: str = "", returncode: int = 0) -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess(args=[], returncode=returncode, stdout=stdout, stderr="")


def _write_workflows(root: Path, *, match: bool = True) -> None:
    active = root / ".github" / "workflows"
    documented = root / "infra" / ".github" / "workflows"
    active.mkdir(parents=True)
    documented.mkdir(parents=True)
    backend = """
workflow_dispatch:
run: npm install --global @railway/cli@5.23.3
run: railway up --service pricevault-backend --ci
run: railway up --service pricevault-worker --ci
"""
    dashboard = """
workflow_dispatch:
run: cd dashboard && npm run build
uses: amondnet/vercel-action@v25
"""
    (active / "backend.yml").write_text(backend)
    (active / "dashboard.yml").write_text(dashboard)
    (documented / "backend.yml").write_text(backend if match else "stale")
    (documented / "dashboard.yml").write_text(dashboard)


def test_deployment_readiness_reports_complete_local_and_github_state(tmp_path, monkeypatch):
    from verification import deployment_readiness

    _write_workflows(tmp_path)
    (tmp_path / "dashboard" / ".vercel").mkdir(parents=True)
    (tmp_path / "dashboard" / ".vercel" / "project.json").write_text("{}")
    (tmp_path / ".railway").mkdir()
    (tmp_path / ".railway" / "link.toml").write_text("")

    monkeypatch.setattr(deployment_readiness.shutil, "which", lambda _name: "/usr/bin/gh")

    secrets = "\n".join(
        f"{name}\t2026-07-02T00:00:00Z"
        for name in deployment_readiness.REQUIRED_ACTIONS_SECRETS
    )

    def fake_run(command, _cwd):
        if command[:3] == ("gh", "secret", "list"):
            return _completed(secrets)
        if command[:2] == ("gh", "api"):
            return _completed("backend.yml\ndashboard.yml\n")
        if command[:3] == ("gh", "run", "list"):
            return _completed('[{"databaseId":1,"status":"completed","conclusion":"success","workflowName":"Backend CI/CD"}]')
        raise AssertionError(command)

    report = deployment_readiness.build_report(root=tmp_path, run_command=fake_run)

    assert report["ready"] is True
    assert report["github_actions"]["secrets"]["missing"] == []
    assert report["local_workflows"]["checks"]["backend_supports_manual_dispatch"] is True
    assert report["local_workflows"]["checks"]["dashboard_supports_manual_dispatch"] is True
    assert "RAILWAY_TOKEN" not in repr(report)


def test_deployment_readiness_reports_missing_external_setup(tmp_path, monkeypatch):
    from verification import deployment_readiness

    _write_workflows(tmp_path, match=False)
    monkeypatch.setattr(deployment_readiness.shutil, "which", lambda _name: "/usr/bin/gh")

    def fake_run(command, _cwd):
        if command[:3] == ("gh", "secret", "list"):
            return _completed("")
        if command[:2] == ("gh", "api"):
            return _completed("", 1)
        if command[:3] == ("gh", "run", "list"):
            return _completed("[]")
        raise AssertionError(command)

    report = deployment_readiness.build_report(root=tmp_path, run_command=fake_run)

    assert report["ready"] is False
    assert report["local_workflows"]["ok"] is False
    assert report["local_deploy_links"]["ok"] is False
    assert report["github_actions"]["secrets"]["ok"] is False
    assert "TEST_DATABASE_URL" in report["github_actions"]["secrets"]["missing"]
