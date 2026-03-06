from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from app.routers import auth, stocks, admin, bounty, regime
from app.jobs.scheduler import start_scheduler, stop_scheduler
from app.database import engine, Base
from sqlalchemy import text
import app.models  # noqa: F401 — ensure all models are registered
import logging

logging.basicConfig(level=logging.INFO)

templates = Jinja2Templates(directory=str(Path(__file__).resolve().parent.parent / "templates"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create any new tables that don't exist yet
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
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
            await conn.execute(text(
                "ALTER TABLE bounty_iron_offerings ALTER COLUMN bounty_window_id DROP NOT NULL"
            ))
            # Bet slider: add bet_amount column, make confidence nullable
            await conn.execute(text(
                "ALTER TABLE bounty_predictions ADD COLUMN IF NOT EXISTS bet_amount INTEGER DEFAULT 0"
            ))
            await conn.execute(text(
                "ALTER TABLE bounty_predictions ALTER COLUMN confidence DROP NOT NULL"
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
    title="Bounty Hunter",
    description="Stock prediction game — make directional picks on 1-hour price windows",
    version="2.0.0",
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
app.include_router(stocks.router)
app.include_router(admin.router)
app.include_router(bounty.router)
app.include_router(regime.router)


@app.get("/")
async def root():
    return {
        "app": "Bounty Hunter",
        "version": "2.0.0",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/backtest", response_class=HTMLResponse)
async def backtest_page(request: Request):
    return templates.TemplateResponse("backtest.html", {"request": request})
