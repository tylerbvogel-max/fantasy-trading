from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.stock import StockActive
from app.services.finnhub_service import search_stocks, get_stock_price
from app.schemas import StockQuote

router = APIRouter(prefix="/stocks", tags=["stocks"])


@router.get("", response_model=list[StockQuote])
async def list_stocks(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
):
    result = await db.execute(
        select(StockActive).order_by(StockActive.symbol).limit(limit)
    )
    return [StockQuote.model_validate(s) for s in result.scalars().all()]


@router.get("/search", response_model=list[StockQuote])
async def stock_search(
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
):
    stocks = await search_stocks(db, q)
    return [StockQuote.model_validate(s) for s in stocks]


@router.get("/{symbol}", response_model=StockQuote)
async def get_stock(symbol: str, db: AsyncSession = Depends(get_db)):
    stock = await db.get(StockActive, symbol.upper())
    if not stock:
        raise HTTPException(status_code=404, detail=f"Stock {symbol} not found")
    return StockQuote.model_validate(stock)
