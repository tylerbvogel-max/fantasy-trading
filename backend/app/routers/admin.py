import secrets
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
from app.database import get_db
from app.services.auth_service import get_current_user, create_invite_code
from app.services.finnhub_service import refresh_all_prices, import_all_us_stocks
from app.services.analytics_service import backfill_benchmark
from app.services.portfolio_service import capture_daily_snapshot
from app.models.user import User
from app.models.season import Season
from app.models.invite_code import InviteCode
from app.schemas import (
    InviteCodeCreate, InviteCodeResponse, SeasonCreate, SeasonDetail,
)

router = APIRouter(prefix="/admin", tags=["admin"])


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


@router.post("/invite-codes/bulk")
async def generate_bulk_invite_codes(
    count: int = Query(10, ge=1, le=500),
    max_uses: int = Query(1, ge=1),
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    codes = []
    for _ in range(count):
        code_str = f"BETA-{secrets.token_hex(3).upper()}"
        db.add(InviteCode(code=code_str, max_uses=max_uses, created_by=user.id))
        codes.append(code_str)
    await db.commit()
    return {"count": len(codes), "codes": codes}


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
        mode=req.mode,
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
        mode=season.mode,
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


@router.post("/stocks/import")
async def import_stocks(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Import all US-traded stocks from Finnhub into stocks_master."""
    count = await import_all_us_stocks(db)
    return {"message": f"Imported {count} new stocks into the master catalog."}


@router.post("/stocks/upload")
async def upload_stocks(
    stocks_data: list[dict],
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Bulk upload stocks to stocks_master. Expects [{symbol, name}, ...]."""
    from app.models.stock import StockMaster
    existing_result = await db.execute(select(StockMaster.symbol))
    existing_symbols = {row[0] for row in existing_result.all()}

    added = 0
    for item in stocks_data:
        symbol = item.get("symbol", "")
        name = item.get("name", symbol)
        if symbol and symbol not in existing_symbols:
            db.add(StockMaster(symbol=symbol, name=name[:100], is_active=True))
            existing_symbols.add(symbol)
            added += 1

    await db.commit()
    return {"imported": added, "total_in_catalog": len(existing_symbols)}


@router.post("/benchmarks/backfill")
async def backfill_benchmarks(
    days: int = Query(365, ge=30, le=730),
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Backfill historical benchmark prices (SPY, IWM) from Yahoo Finance."""
    import traceback
    total = 0
    errors = []
    for symbol in ["SPY", "IWM"]:
        try:
            count = await backfill_benchmark(db, symbol, days)
            total += count
        except Exception as e:
            errors.append(f"{symbol}: {str(e)}\n{traceback.format_exc()}")
    result = {"message": f"Backfilled {total} benchmark data points."}
    if errors:
        result["errors"] = errors
    return result
