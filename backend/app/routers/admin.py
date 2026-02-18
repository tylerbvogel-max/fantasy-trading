import secrets
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.auth_service import get_current_user, create_invite_code
from app.services.finnhub_service import refresh_all_prices, import_all_us_stocks, refresh_trending_stocks
from app.models.user import User
from app.models.invite_code import InviteCode
from app.schemas import InviteCodeCreate, InviteCodeResponse

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


@router.post("/stocks/refresh")
async def force_price_refresh(
    all: bool = Query(False),
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    count = await refresh_all_prices(db, all_stocks=all)
    return {"message": f"Refreshed prices for {count} stocks."}


@router.post("/stocks/trending")
async def refresh_trending(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Fetch Yahoo Finance most-active stocks and update trending_rank."""
    count = await refresh_trending_stocks(db)
    return {"message": f"Trending stocks updated: {count} matched."}


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
