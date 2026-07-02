from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def _source_files(*roots: Path):
    for root in roots:
        if root.is_file():
            yield root
            continue
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            if any(part in {".venv", "__pycache__", ".pytest_cache", "node_modules"} for part in path.parts):
                continue
            if path.suffix in {".py", ".yml", ".yaml", ".toml", ".md", ".txt"}:
                yield path


def test_backend_runtime_uses_browserless_not_local_browser_launches():
    from scrapers.playwright_scraper import scrape_price
    from utils.stealth import get_stealth_page

    assert "connect_over_cdp" in scrape_price.__code__.co_names
    assert "connect_over_cdp" in get_stealth_page.__code__.co_names

    forbidden = (
        "chromium.launch(",
        "firefox.launch(",
        "webkit.launch(",
        "playwright install",
    )
    offenders = []
    for path in _source_files(
        ROOT / "backend",
        ROOT / "infra",
        ROOT / ".github",
    ):
        if path.parts[-2:] == ("tests", "test_runtime_constraints.py"):
            continue
        text = path.read_text(errors="ignore")
        for pattern in forbidden:
            if pattern in text:
                offenders.append(f"{path.relative_to(ROOT)} contains {pattern}")

    assert offenders == []


def test_runtime_and_docs_reference_viva_not_stripe():
    allowed = {
        Path("backend/db/migrations/versions/0002_billing.py"),
        Path("backend/db/migrations/versions/0015_viva_billing.py"),
    }
    offenders = []
    for path in _source_files(
        ROOT / "backend",
        ROOT / "dashboard",
        ROOT / "infra",
        ROOT / ".github",
        ROOT / "README.md",
        ROOT / "docs",
    ):
        relative = path.relative_to(ROOT)
        if relative == Path("backend/tests/test_runtime_constraints.py"):
            continue
        if relative in allowed:
            continue
        text = path.read_text(errors="ignore")
        if "stripe" in text.lower():
            offenders.append(str(relative))

    assert offenders == []


def test_backend_agents_use_structured_logging_not_prints():
    offenders = []
    for path in _source_files(ROOT / "backend" / "agents"):
        text = path.read_text(errors="ignore")
        if "print(" in text:
            offenders.append(str(path.relative_to(ROOT)))

    assert offenders == []
