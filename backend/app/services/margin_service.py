"""
Margin trading logic: buying power, equity checks, interest accrual,
margin calls, and ruthless liquidation.
"""
from uuid import UUID
from datetime import datetime, timezone, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.models.season import Season
from app.models.player_season import PlayerSeason
from app.models.holding import Holding
from app.models.transaction import Transaction
from app.models.stock import StockActive
import logging

logger = logging.getLogger(__name__)


def calculate_buying_power(cash: float, holdings_value: float, leverage_multiplier: float) -> float:
    """Calculate total buying power including margin."""
    return cash + (holdings_value * (leverage_multiplier - 1))


def calculate_margin_equity(cash: float, holdings_value: float, margin_loan_balance: float) -> float:
    """Calculate equity (net worth after subtracting debt)."""
    return cash + holdings_value - margin_loan_balance


def check_margin_status(
    cash: float, holdings_value: float, margin_loan_balance: float, maintenance_pct: float
) -> str:
    """
    Returns margin health status:
    - "healthy": equity >= 40% of holdings
    - "warning": equity < 40% of holdings but >= maintenance
    - "margin_call": equity < maintenance_pct of holdings
    """
    if margin_loan_balance <= 0:
        return "healthy"

    equity = calculate_margin_equity(cash, holdings_value, margin_loan_balance)

    if holdings_value <= 0:
        # No holdings but has a loan — margin call
        return "margin_call" if margin_loan_balance > 0 else "healthy"

    equity_ratio = equity / holdings_value

    if equity_ratio < maintenance_pct:
        return "margin_call"
    elif equity_ratio < 0.40:
        return "warning"
    return "healthy"


async def _get_holdings_value(db: AsyncSession, player_season_id: UUID) -> float:
    """Sum of shares_owned * current_price for all holdings."""
    result = await db.execute(
        select(Holding).where(Holding.player_season_id == player_season_id)
    )
    holdings = list(result.scalars().all())

    if not holdings:
        return 0.0

    symbols = [h.stock_symbol for h in holdings]
    stock_result = await db.execute(
        select(StockActive).where(StockActive.symbol.in_(symbols))
    )
    price_lookup = {}
    for stock in stock_result.scalars().all():
        price_lookup[stock.symbol] = float(stock.price) if stock.price else 0

    return sum(
        float(h.shares_owned) * price_lookup.get(h.stock_symbol, 0)
        for h in holdings
    )


async def apply_daily_interest(db: AsyncSession, season_id: str) -> int:
    """
    Apply daily interest to all players with margin loans in a season.
    Returns count of players charged.
    """
    season = await db.get(Season, season_id)
    if not season or not season.margin_enabled or not season.margin_interest_rate:
        return 0

    rate = float(season.margin_interest_rate)

    result = await db.execute(
        select(PlayerSeason).where(
            PlayerSeason.season_id == season_id,
            PlayerSeason.is_active == True,
            PlayerSeason.margin_loan_balance > 0,
        )
    )
    player_seasons = list(result.scalars().all())

    count = 0
    for ps in player_seasons:
        loan = float(ps.margin_loan_balance)
        daily_interest = round(loan * (rate / 365), 2)

        if daily_interest <= 0:
            continue

        ps.margin_loan_balance = round(loan + daily_interest, 2)

        # Log as MARGIN_INTEREST transaction
        txn = Transaction(
            player_season_id=ps.id,
            season_id=season_id,
            stock_symbol="MARGIN",
            transaction_type="MARGIN_INTEREST",
            shares=0,
            price_per_share=0,
            total_amount=daily_interest,
        )
        db.add(txn)
        count += 1

    return count


async def check_margin_calls(db: AsyncSession, season_id: str) -> list[dict]:
    """
    Check all players in a margin-enabled season for margin call status.
    Issues or cancels margin calls as needed.
    Returns list of players in margin call.
    """
    season = await db.get(Season, season_id)
    if not season or not season.margin_enabled or not season.maintenance_margin_pct:
        return []

    maintenance_pct = float(season.maintenance_margin_pct)

    result = await db.execute(
        select(PlayerSeason)
        .options(selectinload(PlayerSeason.holdings), selectinload(PlayerSeason.user))
        .where(
            PlayerSeason.season_id == season_id,
            PlayerSeason.is_active == True,
        )
    )
    player_seasons = list(result.scalars().all())

    # Build price lookup for all symbols
    all_symbols = set()
    for ps in player_seasons:
        for h in ps.holdings:
            all_symbols.add(h.stock_symbol)

    price_lookup = {}
    if all_symbols:
        stock_result = await db.execute(
            select(StockActive).where(StockActive.symbol.in_(all_symbols))
        )
        for stock in stock_result.scalars().all():
            price_lookup[stock.symbol] = float(stock.price) if stock.price else 0

    margin_call_players = []
    now = datetime.now(timezone.utc)

    for ps in player_seasons:
        loan = float(ps.margin_loan_balance)
        if loan <= 0:
            # No loan — cancel any active margin call
            if ps.margin_call_active:
                ps.margin_call_active = False
                ps.margin_call_issued_at = None
            continue

        cash = float(ps.cash_balance)
        holdings_value = sum(
            float(h.shares_owned) * price_lookup.get(h.stock_symbol, 0)
            for h in ps.holdings
        )

        status = check_margin_status(cash, holdings_value, loan, maintenance_pct)

        if status == "margin_call":
            if not ps.margin_call_active:
                ps.margin_call_active = True
                ps.margin_call_issued_at = now
                logger.info(f"Margin call issued for player {ps.user.alias} in season {season_id}")

            margin_call_players.append({
                "alias": ps.user.alias,
                "player_season_id": str(ps.id),
                "margin_loan": loan,
                "equity": calculate_margin_equity(cash, holdings_value, loan),
            })
        else:
            # Equity recovered — cancel margin call
            if ps.margin_call_active:
                ps.margin_call_active = False
                ps.margin_call_issued_at = None
                logger.info(f"Margin call cancelled for player {ps.user.alias} in season {season_id}")

    return margin_call_players


async def execute_expired_liquidations(db: AsyncSession, season_id: str) -> list[dict]:
    """
    Execute ruthless liquidation for players whose margin call grace period has expired.
    Returns list of liquidated positions.
    """
    season = await db.get(Season, season_id)
    if not season or not season.margin_enabled or not season.maintenance_margin_pct:
        return []

    maintenance_pct = float(season.maintenance_margin_pct)
    now = datetime.now(timezone.utc)
    grace_period = timedelta(hours=24)

    result = await db.execute(
        select(PlayerSeason)
        .options(selectinload(PlayerSeason.holdings), selectinload(PlayerSeason.user))
        .where(
            PlayerSeason.season_id == season_id,
            PlayerSeason.is_active == True,
            PlayerSeason.margin_call_active == True,
            PlayerSeason.margin_call_issued_at != None,
        )
    )
    player_seasons = list(result.scalars().all())

    all_liquidations = []

    for ps in player_seasons:
        # Check if grace period expired
        if ps.margin_call_issued_at and (now - ps.margin_call_issued_at) < grace_period:
            continue

        liquidated = await _execute_ruthless_liquidation(
            db, ps, season_id, maintenance_pct
        )
        all_liquidations.extend(liquidated)

    return all_liquidations


async def _execute_ruthless_liquidation(
    db: AsyncSession,
    ps: PlayerSeason,
    season_id: str,
    maintenance_pct: float,
) -> list[dict]:
    """
    Liquidate worst-performing holdings until equity reaches 35% of remaining holdings.
    """
    # Get current prices for holdings
    symbols = [h.stock_symbol for h in ps.holdings]
    if not symbols:
        # No holdings to liquidate
        ps.margin_call_active = False
        ps.margin_call_issued_at = None
        return []

    stock_result = await db.execute(
        select(StockActive).where(StockActive.symbol.in_(symbols))
    )
    price_lookup = {}
    for stock in stock_result.scalars().all():
        price_lookup[stock.symbol] = float(stock.price) if stock.price else 0

    # Sort holdings by unrealized P&L (worst first)
    holdings_with_pnl = []
    for h in ps.holdings:
        price = price_lookup.get(h.stock_symbol, 0)
        shares = float(h.shares_owned)
        current_value = shares * price
        cost_basis = shares * float(h.average_purchase_price)
        pnl = current_value - cost_basis
        holdings_with_pnl.append((h, price, current_value, pnl))

    holdings_with_pnl.sort(key=lambda x: x[3])  # worst P&L first

    liquidated = []
    target_equity_ratio = 0.35  # 5% buffer above maintenance

    for holding, price, current_value, pnl in holdings_with_pnl:
        # Recalculate current equity
        cash = float(ps.cash_balance)
        loan = float(ps.margin_loan_balance)
        holdings_value = sum(
            float(h.shares_owned) * price_lookup.get(h.stock_symbol, 0)
            for h in ps.holdings
            if float(h.shares_owned) > 0
        )

        if holdings_value <= 0:
            break

        equity = calculate_margin_equity(cash, holdings_value, loan)
        equity_ratio = equity / holdings_value if holdings_value > 0 else 0

        if equity_ratio >= target_equity_ratio:
            break

        shares = float(holding.shares_owned)
        if shares <= 0:
            continue

        proceeds = round(shares * price, 2)

        # Auto-repay loan from proceeds
        repayment = min(proceeds, float(ps.margin_loan_balance))
        ps.margin_loan_balance = round(float(ps.margin_loan_balance) - repayment, 2)
        ps.cash_balance = round(float(ps.cash_balance) + (proceeds - repayment), 2)

        # Log as MARGIN_LIQUIDATION transaction
        txn = Transaction(
            player_season_id=ps.id,
            season_id=season_id,
            stock_symbol=holding.stock_symbol,
            transaction_type="MARGIN_LIQUIDATION",
            shares=shares,
            price_per_share=price,
            total_amount=proceeds,
        )
        db.add(txn)

        liquidated.append({
            "alias": ps.user.alias,
            "symbol": holding.stock_symbol,
            "shares": shares,
            "price": price,
            "proceeds": proceeds,
        })

        # Remove the holding
        holding.shares_owned = 0
        await db.delete(holding)

        logger.info(
            f"Liquidated {shares} shares of {holding.stock_symbol} "
            f"for {ps.user.alias} at ${price:.2f} (proceeds: ${proceeds:.2f})"
        )

    # Clear margin call
    ps.margin_call_active = False
    ps.margin_call_issued_at = None

    return liquidated
