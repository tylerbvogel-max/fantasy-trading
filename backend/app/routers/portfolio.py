from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.auth_service import get_current_user
from app.services.portfolio_service import get_portfolio, get_portfolio_history
from app.models.user import User
from app.schemas import PortfolioSummary, PortfolioHistoryPoint

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.get("", response_model=PortfolioSummary)
async def my_portfolio(
    season_id: str = Query(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    portfolio = await get_portfolio(db, user.id, season_id)
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found. Have you joined this season?")
    return portfolio


@router.get("/history", response_model=list[PortfolioHistoryPoint])
async def portfolio_history(
    season_id: str = Query(...),
    days: int = Query(90, ge=1, le=365),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_portfolio_history(db, user.id, season_id, days)
