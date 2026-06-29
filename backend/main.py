"""PriceVault FastAPI application entry point."""

import asyncio
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI

from routers import alerts, competitors, products, scrape, snapshots
from scheduler import scheduler, scrape_all_job
from utils.logger import configure_logging, get_logger


configure_logging()
logger = get_logger("api")


async def run_initial_scrape() -> None:
    """Run the startup scrape without leaking background task exceptions."""
    try:
        await scrape_all_job()
    except Exception as exc:
        logger.error(
            "initial_scrape_failed",
            extra={
                "agent": "scheduler",
                "action": "initial_scrape_failed",
                "error": str(exc),
            },
        )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    del app
    scheduler.start()
    initial_scrape = asyncio.create_task(run_initial_scrape())
    yield
    if not initial_scrape.done():
        initial_scrape.cancel()
    scheduler.shutdown(wait=False)


app = FastAPI(
    title="PriceVault API",
    version="1.0.0",
    description="Competitor price tracking for DACH e-commerce operators.",
    lifespan=lifespan,
)

app.include_router(scrape.router)
app.include_router(competitors.router)
app.include_router(products.router)
app.include_router(snapshots.router)
app.include_router(alerts.router)
