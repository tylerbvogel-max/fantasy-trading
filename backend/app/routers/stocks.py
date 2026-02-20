from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, outerjoin, func, case
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.stock import StockActive, StockMaster
from app.services.finnhub_service import search_stocks, get_stock_price
from app.schemas import StockQuote
import httpx

router = APIRouter(prefix="/stocks", tags=["stocks"])


@router.get("", response_model=list[StockQuote])
async def list_stocks(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
):
    """List stocks from the master catalog, with prices when available."""
    result = await db.execute(
        select(StockMaster, StockActive)
        .outerjoin(StockActive, StockMaster.symbol == StockActive.symbol)
        .where(StockMaster.is_active == True)
        .order_by(
            func.coalesce(StockActive.trending_rank, 9999).asc(),
            (func.random() * func.coalesce(StockActive.market_cap, 0)).desc(),
        )
        .limit(limit)
    )

    stocks = []
    for master, active in result.all():
        stocks.append(StockQuote(
            symbol=master.symbol,
            name=master.name,
            price=float(active.price) if active and active.price else None,
            change_pct=float(active.change_pct) if active and active.change_pct else None,
            high=float(active.high) if active and active.high else None,
            low=float(active.low) if active and active.low else None,
            volume=active.volume if active else None,
            market_cap=active.market_cap if active else None,
            pe_ratio=float(active.pe_ratio) if active and active.pe_ratio else None,
            beta=float(active.beta) if active and active.beta else None,
            last_updated=active.last_updated if active else None,
        ))
    return stocks


@router.get("/search", response_model=list[StockQuote])
async def stock_search(
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
):
    """Search stocks from the master catalog."""
    masters = await search_stocks(db, q)
    # Batch-fetch any available prices
    symbols = [m.symbol for m in masters]
    active_result = await db.execute(
        select(StockActive).where(StockActive.symbol.in_(symbols))
    )
    active_map = {s.symbol: s for s in active_result.scalars().all()}

    stocks = []
    for master in masters:
        active = active_map.get(master.symbol)
        stocks.append(StockQuote(
            symbol=master.symbol,
            name=master.name,
            price=float(active.price) if active and active.price else None,
            change_pct=float(active.change_pct) if active and active.change_pct else None,
            high=float(active.high) if active and active.high else None,
            low=float(active.low) if active and active.low else None,
            volume=active.volume if active else None,
            market_cap=active.market_cap if active else None,
            pe_ratio=float(active.pe_ratio) if active and active.pe_ratio else None,
            beta=float(active.beta) if active and active.beta else None,
            last_updated=active.last_updated if active else None,
        ))
    return stocks


@router.get("/count")
async def stock_count(db: AsyncSession = Depends(get_db)):
    """Get total number of available stocks."""
    from sqlalchemy import func
    result = await db.scalar(
        select(func.count()).select_from(StockMaster).where(StockMaster.is_active == True)
    )
    return {"count": result or 0}


@router.get("/{symbol}", response_model=StockQuote)
async def get_stock(symbol: str, db: AsyncSession = Depends(get_db)):
    sym = symbol.upper()
    master = await db.get(StockMaster, sym)
    if not master or not master.is_active:
        raise HTTPException(status_code=404, detail=f"Stock {symbol} not found")

    active = await db.get(StockActive, sym)
    return StockQuote(
        symbol=master.symbol,
        name=master.name,
        price=float(active.price) if active and active.price else None,
        change_pct=float(active.change_pct) if active and active.change_pct else None,
        high=float(active.high) if active and active.high else None,
        low=float(active.low) if active and active.low else None,
        volume=active.volume if active else None,
        market_cap=active.market_cap if active else None,
        pe_ratio=float(active.pe_ratio) if active and active.pe_ratio else None,
        beta=float(active.beta) if active and active.beta else None,
        last_updated=active.last_updated if active else None,
    )


@router.get("/historical/{symbol}")
async def get_historical(
    symbol: str,
    range: str = Query("1y", regex="^(3mo|6mo|1y|2y|5y|10y)$"),
    interval: str = Query("1d", regex="^(1d|1wk|1mo)$"),
):
    """Fetch historical OHLC data from Yahoo Finance."""
    sym = symbol.upper()
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}",
                params={"interval": interval, "range": range},
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=15.0,
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail="Yahoo Finance request failed")

            data = resp.json()
            result = data.get("chart", {}).get("result", [])
            if not result:
                raise HTTPException(status_code=404, detail=f"No data for {sym}")

            timestamps = result[0].get("timestamp", [])
            quote = result[0].get("indicators", {}).get("quote", [{}])[0]
            opens = quote.get("open", [])
            highs = quote.get("high", [])
            lows = quote.get("low", [])
            closes = quote.get("close", [])
            volumes = quote.get("volume", [])

            candles = []
            for i, ts in enumerate(timestamps):
                c = closes[i] if i < len(closes) else None
                if c is None:
                    continue
                candles.append({
                    "timestamp": ts,
                    "open": round(opens[i], 2) if i < len(opens) and opens[i] else None,
                    "high": round(highs[i], 2) if i < len(highs) and highs[i] else None,
                    "low": round(lows[i], 2) if i < len(lows) and lows[i] else None,
                    "close": round(c, 2),
                    "volume": volumes[i] if i < len(volumes) else None,
                })
            return {"symbol": sym, "candles": candles}
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Yahoo Finance error: {str(e)}")
