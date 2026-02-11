from uuid import UUID
from datetime import date, datetime, timezone
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.models.player_season import PlayerSeason
from app.models.holding import Holding
from app.models.season import Season
from app.models.stock import StockActive
from app.models.user import User
from app.models.snapshot import PortfolioSnapshot, HoldingsSnapshot, BenchmarkSnapshot
from app.schemas import (
    PortfolioSummary, HoldingResponse, LeaderboardEntry, PortfolioHistoryPoint
)


async def get_portfolio(
    db: AsyncSession, user_id: UUID, season_id: str
) -> PortfolioSummary | None:
    """Get full portfolio with live valuations."""
    result = await db.execute(
        select(PlayerSeason)
        .options(selectinload(PlayerSeason.holdings), selectinload(PlayerSeason.season))
        .where(PlayerSeason.user_id == user_id, PlayerSeason.season_id == season_id)
    )
    ps = result.scalar_one_or_none()
    if not ps:
        return None

    # Build stock price lookup
    symbols = [h.stock_symbol for h in ps.holdings]
    stock_lookup = {}
    if symbols:
        stock_result = await db.execute(
            select(StockActive).where(StockActive.symbol.in_(symbols))
        )
        for stock in stock_result.scalars().all():
            stock_lookup[stock.symbol] = stock

    holdings_value = 0
    holdings_list = []

    for h in ps.holdings:
        stock = stock_lookup.get(h.stock_symbol)
        current_price = float(stock.price) if stock and stock.price else 0
        current_value = float(h.shares_owned) * current_price
        cost_basis = float(h.shares_owned) * float(h.average_purchase_price)
        gain_loss = current_value - cost_basis
        gain_loss_pct = (gain_loss / cost_basis * 100) if cost_basis > 0 else 0

        holdings_value += current_value
        holdings_list.append(HoldingResponse(
            stock_symbol=h.stock_symbol,
            stock_name=stock.name if stock else h.stock_symbol,
            shares_owned=float(h.shares_owned),
            average_purchase_price=float(h.average_purchase_price),
            current_price=current_price,
            current_value=round(current_value, 2),
            gain_loss=round(gain_loss, 2),
            gain_loss_pct=round(gain_loss_pct, 2),
            weight_pct=0,  # calculated below
        ))

    total_value = float(ps.cash_balance) + holdings_value
    starting_cash = float(ps.season.starting_cash)
    percent_gain = ((total_value - starting_cash) / starting_cash * 100) if starting_cash > 0 else 0

    # Calculate weight percentages
    for h in holdings_list:
        h.weight_pct = round((h.current_value / total_value * 100) if total_value > 0 else 0, 2)

    # Sort by value descending
    holdings_list.sort(key=lambda x: x.current_value, reverse=True)

    return PortfolioSummary(
        season_id=season_id,
        season_name=ps.season.name,
        cash_balance=round(float(ps.cash_balance), 2),
        holdings_value=round(holdings_value, 2),
        total_value=round(total_value, 2),
        percent_gain=round(percent_gain, 2),
        holdings=holdings_list,
    )


async def get_portfolio_by_alias(
    db: AsyncSession, alias: str, season_id: str
) -> PortfolioSummary | None:
    """Get a player's portfolio by their alias."""
    result = await db.execute(
        select(User).where(User.alias == alias)
    )
    user = result.scalar_one_or_none()
    if not user:
        return None
    return await get_portfolio(db, user.id, season_id)


async def get_leaderboard(db: AsyncSession, season_id: str) -> list[LeaderboardEntry]:
    """Calculate live leaderboard for a season."""
    # Get all player_seasons for this season with their holdings
    result = await db.execute(
        select(PlayerSeason)
        .options(
            selectinload(PlayerSeason.holdings),
            selectinload(PlayerSeason.user),
        )
        .where(PlayerSeason.season_id == season_id, PlayerSeason.is_active == True)
    )
    player_seasons = list(result.scalars().all())

    # Get season starting cash
    season = await db.get(Season, season_id)
    if not season:
        return []
    starting_cash = float(season.starting_cash)

    # Collect all symbols needed
    all_symbols = set()
    for ps in player_seasons:
        for h in ps.holdings:
            all_symbols.add(h.stock_symbol)

    # Build price lookup
    stock_lookup = {}
    if all_symbols:
        stock_result = await db.execute(
            select(StockActive).where(StockActive.symbol.in_(all_symbols))
        )
        for stock in stock_result.scalars().all():
            stock_lookup[stock.symbol] = float(stock.price) if stock.price else 0

    # Calculate total values
    entries = []
    for ps in player_seasons:
        holdings_value = sum(
            float(h.shares_owned) * stock_lookup.get(h.stock_symbol, 0)
            for h in ps.holdings
        )
        total_value = float(ps.cash_balance) + holdings_value
        percent_gain = ((total_value - starting_cash) / starting_cash * 100) if starting_cash > 0 else 0

        entries.append(LeaderboardEntry(
            rank=0,
            alias=ps.user.alias,
            total_value=round(total_value, 2),
            percent_gain=round(percent_gain, 2),
            holdings_count=len(ps.holdings),
        ))

    # Sort by total value descending and assign ranks
    entries.sort(key=lambda x: x.total_value, reverse=True)
    for i, entry in enumerate(entries):
        entry.rank = i + 1

    return entries


async def capture_daily_snapshot(db: AsyncSession, season_id: str) -> int:
    """Capture portfolio snapshots for all players in a season. Returns count."""
    result = await db.execute(
        select(PlayerSeason)
        .options(selectinload(PlayerSeason.holdings))
        .where(PlayerSeason.season_id == season_id, PlayerSeason.is_active == True)
    )
    player_seasons = list(result.scalars().all())

    season = await db.get(Season, season_id)
    if not season:
        return 0
    starting_cash = float(season.starting_cash)

    # Collect all symbols
    all_symbols = set()
    for ps in player_seasons:
        for h in ps.holdings:
            all_symbols.add(h.stock_symbol)

    stock_lookup = {}
    if all_symbols:
        stock_result = await db.execute(
            select(StockActive).where(StockActive.symbol.in_(all_symbols))
        )
        for stock in stock_result.scalars().all():
            stock_lookup[stock.symbol] = float(stock.price) if stock.price else 0

    today = date.today()
    count = 0

    for ps in player_seasons:
        holdings_value = sum(
            float(h.shares_owned) * stock_lookup.get(h.stock_symbol, 0)
            for h in ps.holdings
        )
        total_value = float(ps.cash_balance) + holdings_value
        percent_gain = ((total_value - starting_cash) / starting_cash * 100) if starting_cash > 0 else 0

        # Upsert snapshot (one per day per player)
        existing = await db.execute(
            select(PortfolioSnapshot).where(
                PortfolioSnapshot.player_season_id == ps.id,
                PortfolioSnapshot.snapshot_date == today,
            )
        )
        snap = existing.scalar_one_or_none()

        if snap:
            snap.total_value = round(total_value, 2)
            snap.percent_gain = round(percent_gain, 4)
            # Delete old holdings snapshots for this snapshot
            await db.execute(
                select(HoldingsSnapshot).where(HoldingsSnapshot.snapshot_id == snap.id)
            )
        else:
            snap = PortfolioSnapshot(
                player_season_id=ps.id,
                snapshot_date=today,
                total_value=round(total_value, 2),
                percent_gain=round(percent_gain, 4),
            )
            db.add(snap)
            await db.flush()  # Get the ID

        # Add holdings snapshots
        for h in ps.holdings:
            price = stock_lookup.get(h.stock_symbol, 0)
            current_value = float(h.shares_owned) * price
            weight_pct = (current_value / total_value) if total_value > 0 else 0

            hs = HoldingsSnapshot(
                snapshot_id=snap.id,
                stock_symbol=h.stock_symbol,
                shares_owned=float(h.shares_owned),
                current_value=round(current_value, 2),
                weight_pct=round(weight_pct, 4),
            )
            db.add(hs)

        count += 1

    # Capture benchmark prices (SPY, IWM) for analytics
    for symbol in ["SPY", "IWM"]:
        stock = await db.get(StockActive, symbol)
        if stock and stock.price:
            existing = await db.execute(
                select(BenchmarkSnapshot).where(
                    BenchmarkSnapshot.symbol == symbol,
                    BenchmarkSnapshot.snapshot_date == today,
                )
            )
            bench = existing.scalar_one_or_none()
            if bench:
                bench.close_price = float(stock.price)
            else:
                db.add(BenchmarkSnapshot(
                    symbol=symbol,
                    snapshot_date=today,
                    close_price=float(stock.price),
                ))

    await db.commit()
    return count


async def get_portfolio_history(
    db: AsyncSession, user_id: UUID, season_id: str, days: int = 90
) -> list[PortfolioHistoryPoint]:
    """Get historical portfolio value for charting."""
    ps_result = await db.execute(
        select(PlayerSeason).where(
            PlayerSeason.user_id == user_id,
            PlayerSeason.season_id == season_id,
        )
    )
    ps = ps_result.scalar_one_or_none()
    if not ps:
        return []

    result = await db.execute(
        select(PortfolioSnapshot)
        .where(PortfolioSnapshot.player_season_id == ps.id)
        .order_by(PortfolioSnapshot.snapshot_date.asc())
        .limit(days)
    )

    return [
        PortfolioHistoryPoint(
            date=snap.snapshot_date,
            total_value=float(snap.total_value),
            percent_gain=float(snap.percent_gain),
        )
        for snap in result.scalars().all()
    ]
