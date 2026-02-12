from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.auth_service import get_current_user
from app.services.bounty_service import (
    get_bounty_status,
    submit_prediction,
    get_bounty_board,
    get_prediction_history,
    get_detailed_stats,
    BountyError,
    CONFIDENCE_LABELS,
)
from app.models.user import User
from app.schemas import (
    BountyStatusResponse,
    BountySubmitRequest,
    BountySubmitResponse,
    BountyBoardEntry,
    BountyPickResponse,
    BountyDetailedStats,
)

router = APIRouter(prefix="/bounty", tags=["bounty"])


@router.get("/status", response_model=BountyStatusResponse)
async def bounty_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_bounty_status(db, user.id)


@router.post("/predict", response_model=BountySubmitResponse)
async def bounty_predict(
    req: BountySubmitRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        pred = await submit_prediction(
            db, user.id, req.bounty_window_id, req.prediction, req.confidence, req.symbol
        )
        return BountySubmitResponse(
            prediction=pred.prediction,
            confidence_label=CONFIDENCE_LABELS[pred.confidence],
            message=f"Locked in! {pred.symbol} {pred.prediction} with {CONFIDENCE_LABELS[pred.confidence]} confidence.",
            symbol=pred.symbol,
        )
    except BountyError as e:
        raise HTTPException(status_code=400, detail=e.message)


@router.get("/board", response_model=list[BountyBoardEntry])
async def bounty_board(
    period: str = Query("weekly", pattern="^(weekly|alltime)$"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_bounty_board(db, period)


@router.get("/stats", response_model=BountyDetailedStats)
async def bounty_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_detailed_stats(db, user.id)


@router.get("/history", response_model=list[BountyPickResponse])
async def bounty_history(
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_prediction_history(db, user.id, limit)
