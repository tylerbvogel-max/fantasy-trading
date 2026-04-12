import json
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.auth_service import get_current_user
from app.services.bounty_service import (
    get_bounty_status,
    submit_prediction,
    submit_skip,
    adjust_prediction,
    get_bounty_board,
    get_prediction_history,
    get_detailed_stats,
    get_equipped_irons,
    get_pending_offering,
    pick_iron,
    reset_player,
    BountyError,
    # P1 additions
    get_run_history,
    get_player_badges,
    get_badge_progress,
    get_player_titles,
    equip_title,
    get_streak_info,
    # P2 additions
    get_active_combos,
    get_settlement_analysis,
    get_performance_analytics,
    # P3 additions
    get_share_card_data,
    get_activity_feed,
)
from app.services.bounty_config import (
    CONFIDENCE_LABELS, IRON_DEFS_BY_ID, IRON_DEFS, RARITY_MIN_LEVEL,
    BADGE_DEFS, TITLE_DEFS, IRON_COMBOS,
)
from app.models.user import User
from app.schemas import (
    BountyStatusResponse,
    BountySubmitRequest,
    BountySubmitResponse,
    BountyBoardEntry,
    BountyPickResponse,
    BountyDetailedStats,
    BountyEquippedIron,
    BountyIronDef,
    BountyIronFullDef,
    BountyIronOfferingResponse,
    BountyIronPickRequest,
    BountySkipRequest,
    BountySkipResponse,
    BountyResetResponse,
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
            db, user.id, req.bounty_window_id, req.prediction, req.bet_amount, req.symbol, req.leverage
        )
        lev_str = f" @ {pred.leverage}x" if pred.leverage > 1.0 else ""
        return BountySubmitResponse(
            prediction=pred.prediction,
            bet_amount=pred.bet_amount,
            message=f"Locked in! {pred.symbol} {pred.prediction} — $${ pred.bet_amount } bet{lev_str}.",
            symbol=pred.symbol,
            leverage=pred.leverage,
        )
    except BountyError as e:
        raise HTTPException(status_code=400, detail=e.message)


class BountyAdjustRequest(BaseModel):
    bounty_window_id: str
    symbol: str
    new_prediction: str
    new_bet_amount: int | None = None


@router.post("/adjust")
async def bounty_adjust(
    req: BountyAdjustRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await adjust_prediction(
            db, user.id, req.bounty_window_id, req.symbol,
            req.new_prediction, req.new_bet_amount,
        )
        return result
    except BountyError as e:
        raise HTTPException(status_code=400, detail=e.message)


@router.post("/skip", response_model=BountySkipResponse)
async def bounty_skip(
    req: BountySkipRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await submit_skip(db, user.id, req.bounty_window_id, req.symbol)
        return BountySkipResponse(**result)
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


@router.get("/irons/all", response_model=list[BountyIronFullDef])
async def bounty_irons_all():
    return [
        BountyIronFullDef(
            id=iron["id"],
            name=iron["name"],
            rarity=iron["rarity"],
            description=iron["description"],
            boost_description=iron.get("boost_description"),
        )
        for iron in IRON_DEFS
    ]


@router.get("/irons", response_model=list[BountyEquippedIron])
async def bounty_irons(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_equipped_irons(db, user.id)


@router.get("/irons/offering")
async def bounty_iron_offering(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    offering = await get_pending_offering(db, user.id)
    if not offering:
        return {"offering_id": None, "irons": []}

    iron_ids = json.loads(offering.offered_iron_ids)
    irons = []
    for iron_id in iron_ids:
        iron_def = IRON_DEFS_BY_ID.get(iron_id)
        if iron_def:
            irons.append(BountyIronDef(
                id=iron_def["id"],
                name=iron_def["name"],
                rarity=iron_def["rarity"],
                description=iron_def["description"],
            ))

    return BountyIronOfferingResponse(
        offering_id=offering.id,
        irons=irons,
    )


@router.post("/irons/pick", response_model=BountyEquippedIron)
async def bounty_iron_pick(
    req: BountyIronPickRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await pick_iron(db, user.id, req.iron_id)
        return BountyEquippedIron(**result)
    except BountyError as e:
        raise HTTPException(status_code=400, detail=e.message)


@router.post("/reset", response_model=BountyResetResponse)
async def bounty_reset(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await reset_player(db, user.id)
        return BountyResetResponse(**result)
    except BountyError as e:
        raise HTTPException(status_code=400, detail=e.message)


# ══════════════════════════════════════════════════════════════════════════════
# P1-A: Run History
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/runs")
async def bounty_runs(
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_run_history(db, user.id, limit)


# ══════════════════════════════════════════════════════════════════════════════
# P1-B: Badges
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/badges")
async def bounty_badges(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_player_badges(db, user.id)


@router.get("/badges/progress")
async def bounty_badge_progress(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_badge_progress(db, user.id)


# ══════════════════════════════════════════════════════════════════════════════
# P1-C: Titles
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/titles")
async def bounty_titles(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_player_titles(db, user.id)


class TitleEquipRequest(BaseModel):
    title_id: str


@router.post("/titles/equip")
async def bounty_equip_title(
    req: TitleEquipRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await equip_title(db, user.id, req.title_id)
    except BountyError as e:
        raise HTTPException(status_code=400, detail=e.message)


# ══════════════════════════════════════════════════════════════════════════════
# P1-D: Streaks
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/streak")
async def bounty_streak(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_streak_info(db, user.id)


# ══════════════════════════════════════════════════════════════════════════════
# P2-A: Iron Combos
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/combos")
async def bounty_combos(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_active_combos(db, user.id)


@router.get("/combos/all")
async def bounty_combos_all():
    """Return all possible iron combos for discovery UI."""
    return [
        {
            "id": c["id"],
            "name": c["name"],
            "description": c["description"],
            "irons": [
                {"id": iid, "name": IRON_DEFS_BY_ID[iid]["name"]}
                for iid in c["irons"] if iid in IRON_DEFS_BY_ID
            ],
        }
        for c in IRON_COMBOS
    ]


# ══════════════════════════════════════════════════════════════════════════════
# P3-A: Share Cards
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/share/{event_type}")
async def bounty_share_card(
    event_type: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_share_card_data(db, user.id, event_type)


# ══════════════════════════════════════════════════════════════════════════════
# P3-B: Activity Feed
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/feed")
async def bounty_feed(
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_activity_feed(db, limit)


# ══════════════════════════════════════════════════════════════════════════════
# P2-C: Post-Settlement Analysis
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/analysis/{window_id}")
async def bounty_analysis(
    window_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from uuid import UUID
    try:
        wid = UUID(window_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid window ID")
    return await get_settlement_analysis(db, wid, user.id)


# ══════════════════════════════════════════════════════════════════════════════
# P2-D: Performance Analytics Dashboard
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/analytics")
async def bounty_analytics(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_performance_analytics(db, user.id)
