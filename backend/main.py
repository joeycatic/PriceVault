"""PriceVault FastAPI application entry point."""

import asyncio
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI

from routers import alerts, competitors, products, scrape, snapshots
from scheduler import scheduler, scrape_all_job
from utils.logger import configure_logging


configure_logging()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    del app
    scheduler.start()
    initial_scrape = asyncio.create_task(scrape_all_job())
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

