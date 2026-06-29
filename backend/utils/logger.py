"""Structured JSON logging for Railway-compatible stdout output."""

import json
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Any


class JSONFormatter(logging.Formatter):
    """Render each log record as one JSON object."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "agent": getattr(record, "agent", record.name),
            "action": getattr(record, "action", record.getMessage()),
            "tenant_id": getattr(record, "tenant_id", None),
        }
        error = getattr(record, "error", None)
        if error:
            payload["error"] = error
        if record.exc_info:
            payload["error"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging() -> None:
    """Configure the root logger once."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)

