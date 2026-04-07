from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from app.routers import auth, stocks, admin, bounty, regime
from app.jobs.scheduler import start_scheduler, stop_scheduler
from app.database import engine, Base, async_session
from app.config import get_settings
from app.middleware import RateLimitMiddleware
from sqlalchemy import text
import app.models  # noqa: F401 — ensure all models are registered
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()

templates = Jinja2Templates(directory=str(Path(__file__).resolve().parent.parent / "templates"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables from SQLAlchemy models (safe: uses IF NOT EXISTS internally)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables verified")
    except Exception as e:
        logger.error(f"Database startup error: {e}")
        raise

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
    docs_url="/docs" if not settings.is_prod else None,
    redoc_url="/redoc" if not settings.is_prod else None,
)

# CORS — locked to configured origins in production
origins = settings.allowed_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True if origins != ["*"] else False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting — per-IP sliding window by endpoint tier
app.add_middleware(RateLimitMiddleware)

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
        "environment": settings.environment,
    }


@app.get("/health")
async def health():
    """Health check with database connectivity verification."""
    try:
        async with async_session() as db:
            await db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        logger.error(f"Health check DB failure: {e}")
        return {"status": "degraded", "database": "unreachable"}


@app.get("/backtest", response_class=HTMLResponse)
async def backtest_page(request: Request):
    return templates.TemplateResponse("backtest.html", {"request": request})
