from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_scrape_job_customer_visible_errors_are_german():
    source = (ROOT / "jobs" / "scrape_tasks.py").read_text()

    forbidden_messages = (
        "Active scrape target not found",
        "Daily scrape limit reached",
        "Scrape failed",
    )
    for message in forbidden_messages:
        assert message not in source

    assert "Aktive Preisquelle nicht gefunden" in source
    assert "Tageslimit für Preisabrufe erreicht" in source
    assert "Preisabruf fehlgeschlagen" in source
