import httpx
import asyncio
from datetime import datetime, timezone
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.stock import StockActive, StockMaster
from app.models.holding import Holding
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


async def refresh_all_prices(db: AsyncSession, all_stocks: bool = False) -> int:
    """Refresh prices for held stocks, or all stocks in the master catalog."""
    if all_stocks:
        result = await db.execute(
            select(StockMaster.symbol)
            .where(StockMaster.is_active == True)
            .order_by(StockMaster.symbol)
        )
    else:
        result = await db.execute(
            select(func.distinct(Holding.stock_symbol))
            .where(Holding.shares_owned > 0)
        )
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


async def fetch_us_symbols() -> list[dict]:
    """Fetch all US stock symbols from Finnhub."""
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{FINNHUB_BASE}/stock/symbol",
                params={"exchange": "US", "token": settings.finnhub_api_key},
                timeout=120.0,
            )
            if resp.status_code == 200:
                return resp.json()
        except httpx.RequestError:
            pass
    return []


async def import_all_us_stocks(db: AsyncSession) -> int:
    """Fetch all US symbols from Finnhub and populate stocks_master."""
    symbols = await fetch_us_symbols()
    if not symbols:
        return 0

    # Filter to common stocks and ETFs (skip warrants, preferred, etc.)
    valid_types = {"Common Stock", "ETP"}
    candidates = []
    for item in symbols:
        if item.get("type") not in valid_types:
            continue
        symbol = item.get("symbol", "")
        if not symbol or "." in symbol or "/" in symbol or len(symbol) > 10:
            continue
        candidates.append((symbol, item.get("description", symbol)[:100]))

    # Batch check: get all existing symbols in one query
    existing_result = await db.execute(select(StockMaster.symbol))
    existing_symbols = {row[0] for row in existing_result.all()}

    added = 0
    for symbol, name in candidates:
        if symbol not in existing_symbols:
            db.add(StockMaster(symbol=symbol, name=name, is_active=True))
            added += 1

    await db.commit()
    return added


async def search_stocks(db: AsyncSession, query: str, season_allowed: list[str] | None = None) -> list[StockMaster]:
    """Search stocks by symbol or name from the master list."""
    q = query.upper()
    stmt = select(StockMaster).where(
        StockMaster.is_active == True,
        (StockMaster.symbol.ilike(f"%{q}%")) | (StockMaster.name.ilike(f"%{q}%"))
    )

    if season_allowed:
        stmt = stmt.where(StockMaster.symbol.in_(season_allowed))

    # Prioritize exact symbol matches first, then alphabetical
    stmt = stmt.order_by(
        StockMaster.symbol.ilike(f"{q}%").desc(),
        StockMaster.symbol,
    ).limit(20)
    result = await db.execute(stmt)
    return list(result.scalars().all())
