import secrets
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
from app.database import get_db, engine, Base
from app.services.auth_service import get_current_user, create_invite_code, generate_token, hash_token
from app.services.finnhub_service import refresh_all_prices
from app.services.portfolio_service import capture_daily_snapshot
from app.models import *  # noqa - ensure all models loaded
from app.models.user import User
from app.models.season import Season
from app.models.invite_code import InviteCode
from app.models.stock import StockMaster, StockActive
from app.schemas import (
    InviteCodeCreate, InviteCodeResponse, SeasonCreate, SeasonDetail,
)

router = APIRouter(prefix="/admin", tags=["admin"])

SEED_SECRET = "fantasy-seed-2026"


@router.post("/seed")
async def run_seed(
    key: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """One-time seed endpoint. Remove after first use."""
    if key != SEED_SECRET:
        raise HTTPException(status_code=403, detail="Invalid seed key")

    # Check if already seeded
    count = await db.scalar(select(func.count()).select_from(StockMaster))
    if count and count > 0:
        raise HTTPException(status_code=400, detail="Database already seeded")

    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed stocks
    stock_list = [
        ("AAPL", "Apple Inc", "Technology", "large"),
        ("MSFT", "Microsoft Corporation", "Technology", "large"),
        ("GOOGL", "Alphabet Inc Class A", "Technology", "large"),
        ("AMZN", "Amazon.com Inc", "Consumer Cyclical", "large"),
        ("NVDA", "NVIDIA Corporation", "Technology", "large"),
        ("META", "Meta Platforms Inc", "Technology", "large"),
        ("TSLA", "Tesla Inc", "Consumer Cyclical", "large"),
        ("BRK.B", "Berkshire Hathaway Inc", "Financial Services", "large"),
        ("LLY", "Eli Lilly and Company", "Healthcare", "large"),
        ("V", "Visa Inc", "Financial Services", "large"),
        ("JPM", "JPMorgan Chase & Co", "Financial Services", "large"),
        ("WMT", "Walmart Inc", "Consumer Defensive", "large"),
        ("UNH", "UnitedHealth Group Inc", "Healthcare", "large"),
        ("MA", "Mastercard Inc", "Financial Services", "large"),
        ("PG", "Procter & Gamble Co", "Consumer Defensive", "large"),
        ("JNJ", "Johnson & Johnson", "Healthcare", "large"),
        ("HD", "Home Depot Inc", "Consumer Cyclical", "large"),
        ("COST", "Costco Wholesale Corp", "Consumer Defensive", "large"),
        ("ABBV", "AbbVie Inc", "Healthcare", "large"),
        ("CRM", "Salesforce Inc", "Technology", "large"),
        ("NFLX", "Netflix Inc", "Communication Services", "large"),
        ("AMD", "Advanced Micro Devices Inc", "Technology", "large"),
        ("BAC", "Bank of America Corp", "Financial Services", "large"),
        ("KO", "Coca-Cola Co", "Consumer Defensive", "large"),
        ("PEP", "PepsiCo Inc", "Consumer Defensive", "large"),
        ("MRK", "Merck & Co Inc", "Healthcare", "large"),
        ("TMO", "Thermo Fisher Scientific Inc", "Healthcare", "large"),
        ("AVGO", "Broadcom Inc", "Technology", "large"),
        ("DIS", "Walt Disney Co", "Communication Services", "large"),
        ("ADBE", "Adobe Inc", "Technology", "large"),
        ("CSCO", "Cisco Systems Inc", "Technology", "large"),
        ("ACN", "Accenture plc", "Technology", "large"),
        ("ABT", "Abbott Laboratories", "Healthcare", "large"),
        ("INTC", "Intel Corporation", "Technology", "large"),
        ("CMCSA", "Comcast Corporation", "Communication Services", "large"),
        ("VZ", "Verizon Communications Inc", "Communication Services", "large"),
        ("T", "AT&T Inc", "Communication Services", "large"),
        ("NKE", "Nike Inc", "Consumer Cyclical", "large"),
        ("PFE", "Pfizer Inc", "Healthcare", "large"),
        ("ORCL", "Oracle Corporation", "Technology", "large"),
        ("SPY", "SPDR S&P 500 ETF Trust", "ETF", "large"),
        ("QQQ", "Invesco QQQ Trust", "ETF", "large"),
        ("DIA", "SPDR Dow Jones Industrial Average ETF", "ETF", "large"),
        ("IWM", "iShares Russell 2000 ETF", "ETF", "large"),
        ("ARKK", "ARK Innovation ETF", "ETF", "mid"),
        ("PLTR", "Palantir Technologies Inc", "Technology", "mid"),
        ("SQ", "Block Inc", "Financial Services", "mid"),
        ("SNAP", "Snap Inc", "Communication Services", "mid"),
        ("RIVN", "Rivian Automotive Inc", "Consumer Cyclical", "mid"),
        ("SOFI", "SoFi Technologies Inc", "Financial Services", "mid"),
    ]
    for symbol, name, sector, tier in stock_list:
        db.add(StockMaster(symbol=symbol, name=name, sector=sector, market_cap_tier=tier, is_active=True))
        db.add(StockActive(symbol=symbol, name=name))

    # Admin user
    admin_token = generate_token()
    db.add(User(alias="admin", is_admin=True, token_hash=hash_token(admin_token)))

    # Invite codes
    codes = []
    for _ in range(10):
        code = f"BETA-{secrets.token_hex(3).upper()}"
        db.add(InviteCode(code=code, max_uses=1))
        codes.append(code)

    # Seasons
    db.add(Season(
        id="SEASON_001", name="Winter Championship 2026", season_type="open",
        start_date=datetime(2026, 1, 25, tzinfo=timezone.utc), starting_cash=100000.00,
        description="The inaugural season! All stocks available. $100K starting cash.",
    ))
    db.add(Season(
        id="SEASON_MAG7_01", name="Magnificent 7 Showdown", season_type="mag7",
        allowed_stocks=["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"],
        start_date=datetime(2026, 2, 1, tzinfo=timezone.utc), starting_cash=100000.00,
        description="Trade only the Magnificent 7 tech giants.",
    ))

    await db.commit()

    return {
        "status": "seeded",
        "admin_token": admin_token,
        "invite_codes": codes,
        "stocks": len(stock_list),
        "seasons": ["SEASON_001", "SEASON_MAG7_01"],
    }


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@router.post("/invite-codes", response_model=InviteCodeResponse)
async def generate_invite_code(
    req: InviteCodeCreate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    code = await create_invite_code(
        db, code=req.code, max_uses=req.max_uses,
        created_by=user.id, expires_at=req.expires_at,
    )
    return InviteCodeResponse.model_validate(code)


@router.get("/invite-codes", response_model=list[InviteCodeResponse])
async def list_invite_codes(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(InviteCode).order_by(InviteCode.created_at.desc()))
    return [InviteCodeResponse.model_validate(c) for c in result.scalars().all()]


@router.post("/seasons", response_model=SeasonDetail)
async def create_season(
    req: SeasonCreate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.get(Season, req.id)
    if existing:
        raise HTTPException(status_code=400, detail=f"Season {req.id} already exists")

    season = Season(
        id=req.id,
        name=req.name,
        season_type=req.season_type,
        allowed_stocks=req.allowed_stocks,
        start_date=req.start_date,
        starting_cash=req.starting_cash,
        description=req.description,
    )
    db.add(season)
    await db.commit()
    await db.refresh(season)

    return SeasonDetail(
        id=season.id,
        name=season.name,
        season_type=season.season_type,
        is_active=season.is_active,
        starting_cash=float(season.starting_cash),
        player_count=0,
        start_date=season.start_date,
        end_date=season.end_date,
        allowed_stocks=season.allowed_stocks,
        description=season.description,
    )


@router.post("/seasons/{season_id}/end")
async def end_season(
    season_id: str,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    season = await db.get(Season, season_id)
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    if not season.is_active:
        raise HTTPException(status_code=400, detail="Season is already inactive")

    # Capture final snapshot before ending
    await capture_daily_snapshot(db, season_id)

    season.is_active = False
    season.end_date = datetime.now(timezone.utc)
    await db.commit()

    return {"message": f"Season {season.name} has been ended and final snapshots captured."}


@router.post("/stocks/refresh")
async def force_price_refresh(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    count = await refresh_all_prices(db)
    return {"message": f"Refreshed prices for {count} stocks."}
