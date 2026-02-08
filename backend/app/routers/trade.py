from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.auth_service import get_current_user
from app.services.trade_service import execute_trade, validate_trade, get_transaction_history, TradeError
from app.models.user import User
from app.schemas import TradeRequest, TradeResponse, TradeValidation, TransactionHistory

router = APIRouter(prefix="/trade", tags=["trading"])


@router.post("", response_model=TradeResponse)
async def make_trade(
    req: TradeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await execute_trade(db, user.id, req)
    except TradeError as e:
        raise HTTPException(status_code=400, detail=e.message)


@router.post("/validate", response_model=TradeValidation)
async def validate(
    req: TradeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await validate_trade(db, user.id, req)


@router.get("/history", response_model=list[TransactionHistory])
async def trade_history(
    season_id: str = Query(...),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    txns = await get_transaction_history(db, user.id, season_id, limit)
    return [TransactionHistory.model_validate(t) for t in txns]
