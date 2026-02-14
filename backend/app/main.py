from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, seasons, trade, portfolio, stocks, admin, education, bounty
from app.jobs.scheduler import start_scheduler, stop_scheduler
from app.database import engine, Base
from sqlalchemy import text
import app.models  # noqa: F401 — ensure all models are registered
import logging

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create any new tables that don't exist yet
    try:
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
            await conn.execute(text(
                "ALTER TABLE seasons ADD COLUMN IF NOT EXISTS max_trades_per_player INTEGER"
            ))
            await conn.execute(text(
                "ALTER TABLE seasons ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id)"
            ))
            # Bounty sim mechanics columns
            await conn.execute(text(
                "ALTER TABLE bounty_player_stats ADD COLUMN IF NOT EXISTS notoriety FLOAT DEFAULT 0.0"
            ))
            await conn.execute(text(
                "ALTER TABLE bounty_player_stats ADD COLUMN IF NOT EXISTS chambers INTEGER DEFAULT 2"
            ))
            await conn.execute(text(
                "ALTER TABLE bounty_player_stats ADD COLUMN IF NOT EXISTS skip_count_this_window INTEGER DEFAULT 0"
            ))
            await conn.execute(text(
                "ALTER TABLE bounty_player_stats ADD COLUMN IF NOT EXISTS is_busted BOOLEAN DEFAULT FALSE"
            ))
            await conn.execute(text(
                "ALTER TABLE bounty_player_stats ADD COLUMN IF NOT EXISTS bust_count INTEGER DEFAULT 0"
            ))
            await conn.execute(text(
                "ALTER TABLE bounty_predictions ADD COLUMN IF NOT EXISTS action_type VARCHAR(20) DEFAULT 'directional'"
            ))
            await conn.execute(text(
                "ALTER TABLE bounty_predictions ADD COLUMN IF NOT EXISTS insurance_triggered BOOLEAN DEFAULT FALSE"
            ))
            await conn.execute(text(
                "ALTER TABLE bounty_predictions ADD COLUMN IF NOT EXISTS base_points INTEGER DEFAULT 0"
            ))
            await conn.execute(text(
                "ALTER TABLE bounty_predictions ADD COLUMN IF NOT EXISTS wanted_multiplier_used INTEGER DEFAULT 1"
            ))
            # Migrate existing players: set starting balance for those with 0
            await conn.execute(text(
                "UPDATE bounty_player_stats SET double_dollars = 5000, wanted_level = 1 "
                "WHERE double_dollars = 0 AND total_predictions = 0"
            ))
        logging.info("Database migrations completed successfully")
    except Exception as e:
        logging.error(f"Startup migration error (non-fatal): {e}")
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

# CORS - allow Swagger docs and any future web clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
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
app.include_router(bounty.router)


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
