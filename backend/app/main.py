from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, seasons, trade, portfolio, stocks, admin, education
from app.jobs.scheduler import start_scheduler, stop_scheduler
from app.database import engine, Base
from sqlalchemy import text
import app.models  # noqa: F401 — ensure all models are registered
import logging

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create any new tables that don't exist yet
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add columns that were added after initial table creation
        await conn.execute(text(
            "ALTER TABLE seasons ADD COLUMN IF NOT EXISTS game_mode VARCHAR(20) NOT NULL DEFAULT 'league'"
        ))
        await conn.execute(text(
            "ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS difficulty INTEGER NOT NULL DEFAULT 1"
        ))
        await conn.execute(text(
            "UPDATE education_topics SET name = 'Trading' WHERE id = 'trading-101' AND name = 'Trading 101'"
        ))
    # Startup
    start_scheduler()
    yield
    # Shutdown
    stop_scheduler()


app = FastAPI(
    title="Fantasy Stock Trading",
    description="Competitive paper trading game with themed seasons",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS - allow mobile app to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(seasons.router)
app.include_router(trade.router)
app.include_router(portfolio.router)
app.include_router(stocks.router)
app.include_router(admin.router)
app.include_router(education.router)


@app.get("/")
async def root():
    return {
        "app": "Fantasy Stock Trading",
        "version": "1.0.1",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
