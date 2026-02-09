from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.auth_service import get_current_user
from app.services.portfolio_service import get_leaderboard
from app.models.user import User
from app.models.season import Season
from app.models.player_season import PlayerSeason
from app.models.stock import StockActive
from app.schemas import (
    SeasonSummary, SeasonDetail, JoinSeasonResponse, LeaderboardEntry, StockQuote,
)

router = APIRouter(prefix="/seasons", tags=["seasons"])


@router.get("", response_model=list[SeasonSummary])
async def list_seasons(
    mode: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Season).order_by(Season.created_at.desc())
    if mode:
        stmt = stmt.where(Season.game_mode == mode)
    result = await db.execute(stmt)
    seasons = list(result.scalars().all())

    summaries = []
    for s in seasons:
        count_result = await db.execute(
            select(func.count()).select_from(PlayerSeason).where(
                PlayerSeason.season_id == s.id, PlayerSeason.is_active == True
            )
        )
        count = count_result.scalar() or 0

        summaries.append(SeasonSummary(
            id=s.id,
            name=s.name,
            season_type=s.season_type,
            mode=s.game_mode,
            is_active=s.is_active,
            starting_cash=float(s.starting_cash),
            player_count=count,
            start_date=s.start_date,
            end_date=s.end_date,
        ))

    return summaries


@router.get("/{season_id}", response_model=SeasonDetail)
async def get_season(season_id: str, db: AsyncSession = Depends(get_db)):
    season = await db.get(Season, season_id)
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    count_result = await db.execute(
        select(func.count()).select_from(PlayerSeason).where(
            PlayerSeason.season_id == season_id, PlayerSeason.is_active == True
        )
    )
    count = count_result.scalar() or 0

    return SeasonDetail(
        id=season.id,
        name=season.name,
        season_type=season.season_type,
        mode=season.game_mode,
        is_active=season.is_active,
        starting_cash=float(season.starting_cash),
        player_count=count,
        start_date=season.start_date,
        end_date=season.end_date,
        allowed_stocks=season.allowed_stocks,
        description=season.description,
    )


@router.post("/{season_id}/join", response_model=JoinSeasonResponse)
async def join_season(
    season_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    season = await db.get(Season, season_id)
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    if not season.is_active:
        raise HTTPException(status_code=400, detail="This season is no longer active")

    # Check if already joined
    existing = await db.execute(
        select(PlayerSeason).where(
            PlayerSeason.user_id == user.id,
            PlayerSeason.season_id == season_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You have already joined this season")

    ps = PlayerSeason(
        user_id=user.id,
        season_id=season_id,
        cash_balance=float(season.starting_cash),
    )
    db.add(ps)
    await db.commit()
    await db.refresh(ps)

    return JoinSeasonResponse(
        player_season_id=ps.id,
        season_id=season_id,
        cash_balance=float(ps.cash_balance),
        message=f"Joined {season.name}! Starting cash: ${float(season.starting_cash):,.2f}",
    )


@router.get("/{season_id}/leaderboard", response_model=list[LeaderboardEntry])
async def season_leaderboard(season_id: str, db: AsyncSession = Depends(get_db)):
    season = await db.get(Season, season_id)
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    return await get_leaderboard(db, season_id)


@router.get("/{season_id}/stocks", response_model=list[StockQuote])
async def season_stocks(season_id: str, db: AsyncSession = Depends(get_db)):
    season = await db.get(Season, season_id)
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    stmt = select(StockActive)
    if season.allowed_stocks:
        stmt = stmt.where(StockActive.symbol.in_(season.allowed_stocks))
    stmt = stmt.order_by(StockActive.symbol)

    result = await db.execute(stmt)
    return [StockQuote.model_validate(s) for s in result.scalars().all()]


@router.get("/{season_id}/players", response_model=list[str])
async def season_players(
    season_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List aliases of all players in a season (excluding the requester)."""
    result = await db.execute(
        select(User.alias)
        .join(PlayerSeason, PlayerSeason.user_id == User.id)
        .where(
            PlayerSeason.season_id == season_id,
            PlayerSeason.is_active == True,
            User.id != user.id,
        )
        .order_by(User.alias)
    )
    return [row[0] for row in result.all()]
