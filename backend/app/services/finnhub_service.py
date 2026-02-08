import httpx
import asyncio
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.stock import StockActive, StockMaster
from app.config import get_settings

settings = get_settings()
FINNHUB_BASE = "https://finnhub.io/api/v1"


async def fetch_quote(symbol: str) -> dict | None:
    """Fetch a single stock quote from Finnhub."""
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{FINNHUB_BASE}/quote",
                params={"symbol": symbol, "token": settings.finnhub_api_key},
                timeout=10.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                if data.get("c", 0) > 0:  # 'c' is current price
                    return data
        except httpx.RequestError:
            pass
    return None


async def fetch_company_profile(symbol: str) -> dict | None:
    """Fetch company profile from Finnhub."""
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{FINNHUB_BASE}/stock/profile2",
                params={"symbol": symbol, "token": settings.finnhub_api_key},
                timeout=10.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                if data.get("name"):
                    return data
        except httpx.RequestError:
            pass
    return None


async def refresh_stock_price(db: AsyncSession, symbol: str) -> StockActive | None:
    """Fetch latest price from Finnhub and update the database."""
    quote = await fetch_quote(symbol)
    if not quote:
        return None

    now = datetime.now(timezone.utc)
    stock = await db.get(StockActive, symbol)

    if stock:
        stock.price = quote["c"]
        stock.price_open = quote.get("o")
        stock.high = quote.get("h")
        stock.low = quote.get("l")
        stock.change_pct = quote.get("dp")
        stock.last_updated = now
    else:
        # Need company profile for name
        profile = await fetch_company_profile(symbol)
        stock = StockActive(
            symbol=symbol,
            name=profile.get("name", symbol) if profile else symbol,
            price=quote["c"],
            price_open=quote.get("o"),
            high=quote.get("h"),
            low=quote.get("l"),
            change_pct=quote.get("dp"),
            market_cap=profile.get("marketCapitalization") if profile else None,
            last_updated=now,
        )
        db.add(stock)

    await db.commit()
    await db.refresh(stock)
    return stock


async def refresh_all_prices(db: AsyncSession) -> int:
    """Refresh prices for all stocks in stocks_active. Returns count of updated stocks."""
    result = await db.execute(select(StockActive.symbol))
    symbols = [row[0] for row in result.all()]

    updated = 0
    for symbol in symbols:
        stock = await refresh_stock_price(db, symbol)
        if stock:
            updated += 1
        # Rate limiting: Finnhub free tier is 60 calls/min
        await asyncio.sleep(1.1)

    return updated


async def get_stock_price(db: AsyncSession, symbol: str) -> float | None:
    """Get current price, refreshing from Finnhub if stale."""
    stock = await db.get(StockActive, symbol)

    if stock and stock.price:
        # Check staleness
        if stock.last_updated:
            age = (datetime.now(timezone.utc) - stock.last_updated).total_seconds()
            if age < settings.price_staleness_threshold_seconds:
                return float(stock.price)

    # Price is stale or missing — refresh
    stock = await refresh_stock_price(db, symbol)
    if stock and stock.price:
        return float(stock.price)
    return None


async def search_stocks(db: AsyncSession, query: str, season_allowed: list[str] | None = None) -> list[StockActive]:
    """Search stocks by symbol or name, optionally filtered to a season's allowed list."""
    q = query.upper()
    stmt = select(StockActive).where(
        (StockActive.symbol.ilike(f"%{q}%")) | (StockActive.name.ilike(f"%{q}%"))
    )

    if season_allowed:
        stmt = stmt.where(StockActive.symbol.in_(season_allowed))

    stmt = stmt.limit(20)
    result = await db.execute(stmt)
    return list(result.scalars().all())
