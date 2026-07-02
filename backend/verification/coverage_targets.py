"""Enforce the module coverage targets from the buildout plan."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


COVERAGE_TARGETS = {
    "jobs/scrape_tasks.py": 80,
    "webhooks/viva_handler.py": 100,
    "auth/plan_guard.py": 100,
    "auth/api_key_middleware.py": 90,
    "routers/export.py": 80,
    "routers/team.py": 80,
}


def _percent_covered(summary: dict[str, float | int]) -> float:
    if "percent_covered" in summary:
        return float(summary["percent_covered"])
    covered = int(summary.get("covered_lines", 0))
    statements = int(summary.get("num_statements", 0))
    return 100.0 if statements == 0 else covered / statements * 100


def check_targets(report: dict) -> dict[str, dict[str, float | int | bool]]:
    files = report.get("files", {})
    results: dict[str, dict[str, float | int | bool]] = {}
    for path, target in COVERAGE_TARGETS.items():
        file_report = files.get(path)
        actual = _percent_covered(file_report["summary"]) if file_report else 0.0
        results[path] = {
            "actual": round(actual, 2),
            "target": target,
            "ok": actual >= target,
        }
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Check PriceVault coverage targets.")
    parser.add_argument("coverage_json", type=Path, nargs="?", default=Path("coverage.json"))
    args = parser.parse_args()

    report = json.loads(args.coverage_json.read_text())
    results = check_targets(report)
    failed = {path: result for path, result in results.items() if not result["ok"]}
    print(json.dumps(results, indent=2, sort_keys=True))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
