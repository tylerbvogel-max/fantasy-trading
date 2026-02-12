from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone, timedelta
from app.database import get_db
from app.services.auth_service import get_current_user
from app.services.portfolio_service import get_leaderboard
from app.models.user import User
from app.models.season import Season
from app.models.player_season import PlayerSeason
from app.models.stock import StockActive
from app.schemas import (
    SeasonSummary, SeasonDetail, JoinSeasonResponse, LeaderboardEntry, StockQuote,
    PlayerSeasonCreate,
)
import secrets

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

    now = datetime.now(timezone.utc)
    summaries = []
    for s in seasons:
        # Hide expired seasons (end_date in the past)
        if s.end_date and s.end_date < now:
            continue

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
            max_trades_per_player=s.max_trades_per_player,
            margin_enabled=s.margin_enabled,
            leverage_multiplier=float(s.leverage_multiplier) if s.leverage_multiplier else None,
            margin_interest_rate=float(s.margin_interest_rate) if s.margin_interest_rate else None,
            maintenance_margin_pct=float(s.maintenance_margin_pct) if s.maintenance_margin_pct else None,
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
        max_trades_per_player=season.max_trades_per_player,
        margin_enabled=season.margin_enabled,
        leverage_multiplier=float(season.leverage_multiplier) if season.leverage_multiplier else None,
        margin_interest_rate=float(season.margin_interest_rate) if season.margin_interest_rate else None,
        maintenance_margin_pct=float(season.maintenance_margin_pct) if season.maintenance_margin_pct else None,
    )


@router.post("", response_model=SeasonDetail)
async def create_season(
    data: PlayerSeasonCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a player-made season (arena/league mode)."""
    season_id = f"c-{secrets.token_hex(3).upper()}"
    now = datetime.now(timezone.utc)

    season = Season(
        id=season_id,
        name=data.name,
        season_type="custom",
        game_mode="league",
        start_date=now,
        end_date=now + timedelta(days=data.duration_days),
        is_active=True,
        starting_cash=data.starting_cash,
        description=data.description,
        max_trades_per_player=data.max_trades_per_player,
        created_by=user.id,
        margin_enabled=data.margin_enabled,
        leverage_multiplier=data.leverage_multiplier if data.margin_enabled else None,
        margin_interest_rate=data.margin_interest_rate if data.margin_enabled else None,
        maintenance_margin_pct=data.maintenance_margin_pct if data.margin_enabled else None,
    )
    db.add(season)

    # Auto-join the creator
    ps = PlayerSeason(
        user_id=user.id,
        season_id=season_id,
        cash_balance=data.starting_cash,
    )
    db.add(ps)
    await db.commit()

    return SeasonDetail(
        id=season.id,
        name=season.name,
        season_type=season.season_type,
        mode=season.game_mode,
        is_active=True,
        starting_cash=float(season.starting_cash),
        player_count=1,
        start_date=season.start_date,
        end_date=season.end_date,
        allowed_stocks=None,
        description=season.description,
        max_trades_per_player=season.max_trades_per_player,
        margin_enabled=season.margin_enabled,
        leverage_multiplier=float(season.leverage_multiplier) if season.leverage_multiplier else None,
        margin_interest_rate=float(season.margin_interest_rate) if season.margin_interest_rate else None,
        maintenance_margin_pct=float(season.maintenance_margin_pct) if season.maintenance_margin_pct else None,
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

    now = datetime.now(timezone.utc)
    if season.start_date > now:
        opens = season.start_date.strftime("%b %-d, %Y")
        raise HTTPException(
            status_code=400,
            detail=f"This season hasn't started yet. Opens {opens}.",
        )

    # Check if already joined
    existing = await db.execute(
        select(PlayerSeason).where(
            PlayerSeason.user_id == user.id,
            PlayerSeason.season_id == season_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You have already joined this season")

    starting_cash = float(season.starting_cash)
    bonus = 0.0

    # Classroom mode: knowledge score grants bonus starting cash ($25/pt, capped at 25%)
    if season.game_mode == "classroom":
        from app.services.education_service import _compute_knowledge_score
        knowledge_score = await _compute_knowledge_score(db, user.id)
        max_bonus = starting_cash * 0.25
        bonus = min(knowledge_score * 25, max_bonus)

    ps = PlayerSeason(
        user_id=user.id,
        season_id=season_id,
        cash_balance=starting_cash + bonus,
    )
    db.add(ps)
    await db.commit()
    await db.refresh(ps)

    message = f"Joined {season.name}! Starting cash: ${starting_cash + bonus:,.2f}"
    if bonus > 0:
        message += f" (includes ${bonus:,.2f} learning bonus!)"

    return JoinSeasonResponse(
        player_season_id=ps.id,
        season_id=season_id,
        cash_balance=float(ps.cash_balance),
        message=message,
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
