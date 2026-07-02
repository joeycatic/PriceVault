import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


from verification.coverage_targets import COVERAGE_TARGETS, check_targets


def _report(overrides=None):
    overrides = overrides or {}
    files = {}
    for path, target in COVERAGE_TARGETS.items():
        files[path] = {"summary": {"percent_covered": overrides.get(path, target)}}
    return {"files": files}


def test_coverage_targets_pass_at_thresholds():
    results = check_targets(_report())

    assert all(result["ok"] is True for result in results.values())
    assert results["auth/api_key_middleware.py"]["target"] == 90


def test_coverage_targets_fail_below_threshold():
    results = check_targets(_report({"auth/api_key_middleware.py": 89.99}))

    assert results["auth/api_key_middleware.py"] == {
        "actual": 89.99,
        "target": 90,
        "ok": False,
    }


def test_coverage_targets_fail_missing_file():
    report = _report()
    del report["files"]["routers/team.py"]

    results = check_targets(report)

    assert results["routers/team.py"] == {"actual": 0.0, "target": 80, "ok": False}
