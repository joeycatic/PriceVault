from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_backend_workflow_uses_supported_railway_cli() -> None:
    workflow = (ROOT / ".github" / "workflows" / "backend.yml").read_text()

    assert "@railway/cli@5.23.3" in workflow
    assert "workflow_dispatch:" in workflow
    assert "railway up --service pricevault-backend --ci" in workflow
    assert "railway up --service pricevault-worker --ci" in workflow
    assert "railwayapp/railway-action" not in workflow


def test_dashboard_workflow_can_be_manually_dispatched() -> None:
    workflow = (ROOT / ".github" / "workflows" / "dashboard.yml").read_text()

    assert "workflow_dispatch:" in workflow


def test_infra_workflow_copies_match_active_workflows() -> None:
    for name in ("backend.yml", "dashboard.yml"):
        active = (ROOT / ".github" / "workflows" / name).read_text()
        documented = (ROOT / "infra" / ".github" / "workflows" / name).read_text()

        assert documented == active
