"""Shared structlog access for API and worker processes."""

import structlog

from logging_config import configure_logging


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger().bind(agent=name)
