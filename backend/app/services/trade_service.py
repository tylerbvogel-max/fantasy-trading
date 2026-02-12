from uuid import UUID
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.player_season import PlayerSeason
from app.models.holding import Holding
from app.models.transaction import Transaction
from app.models.season import Season
from app.models.stock import StockMaster
from app.services.finnhub_service import get_stock_price
from app.services.margin_service import calculate_buying_power, _get_holdings_value
from app.schemas import TradeRequest, TradeResponse, TradeValidation
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
MARKET_OPEN_HOUR = 9
MARKET_OPEN_MINUTE = 30
MARKET_CLOSE_HOUR = 21
MARKET_CLOSE_MINUTE = 0


class TradeError(Exception):
    def __init__(self, message: str):
        self.message = message


def _check_market_hours() -> str | None:
    """Return an error message if market is closed, None if open."""
    now_et = datetime.now(ET)
    # Weekend check (0=Mon, 5=Sat, 6=Sun)
    if now_et.weekday() >= 5:
        return "Market is closed on weekends. Trading resumes Monday at 9:30 AM ET."
    open_time = now_et.replace(hour=MARKET_OPEN_HOUR, minute=MARKET_OPEN_MINUTE, second=0, microsecond=0)
    close_time = now_et.replace(hour=MARKET_CLOSE_HOUR, minute=MARKET_CLOSE_MINUTE, second=0, microsecond=0)
    if now_et < open_time:
        return f"Market hasn't opened yet. Trading starts at 9:30 AM ET."
    if now_et >= close_time:
        return f"Market is closed. Trading ended at 9:00 PM ET."
    return None


async def validate_trade(
    db: AsyncSession, user_id: UUID, req: TradeRequest
) -> TradeValidation:
    """Pre-validate a trade without executing it."""
    # Check market hours
    market_closed = _check_market_hours()
    if market_closed:
        # Still fetch last known / closing price so the UI can display it
        cached_price = await get_stock_price(db, req.stock_symbol) or 0
        return TradeValidation(
            is_valid=False, stock_symbol=req.stock_symbol,
            current_price=cached_price,
            estimated_total=cached_price * req.shares,
            message=market_closed
        )

    # Find player_season
    ps = await _get_player_season(db, user_id, req.season_id)
    if not ps:
        return TradeValidation(
            is_valid=False, stock_symbol=req.stock_symbol, current_price=0,
            estimated_total=0, message="You are not a member of this season."
        )

    # Check season is active
    season = await db.get(Season, req.season_id)
    if not season or not season.is_active:
        return TradeValidation(
            is_valid=False, stock_symbol=req.stock_symbol, current_price=0,
            estimated_total=0, message="This season is not active."
        )

    # Check stock is allowed in this season
    if season.allowed_stocks and req.stock_symbol.upper() not in season.allowed_stocks:
        return TradeValidation(
            is_valid=False, stock_symbol=req.stock_symbol, current_price=0,
            estimated_total=0, message=f"{req.stock_symbol} is not tradeable in this season."
        )

    # Check trade count limit
    if season.max_trades_per_player is not None:
        count_result = await db.execute(
            select(func.count()).select_from(Transaction).where(
                Transaction.player_season_id == ps.id
            )
        )
        trade_count = count_result.scalar() or 0
        if trade_count >= season.max_trades_per_player:
            return TradeValidation(
                is_valid=False, stock_symbol=req.stock_symbol, current_price=0,
                estimated_total=0,
                message=f"Trade limit reached — this season allows {season.max_trades_per_player} trades per player."
            )

    # Check stock exists in master catalog
    master = await db.get(StockMaster, req.stock_symbol.upper())
    if not master or not master.is_active:
        return TradeValidation(
            is_valid=False, stock_symbol=req.stock_symbol, current_price=0,
            estimated_total=0, message=f"{req.stock_symbol} is not a recognized stock."
        )

    # Get current price (fetches from Finnhub on-demand if needed)
    price = await get_stock_price(db, req.stock_symbol.upper())
    if not price:
        return TradeValidation(
            is_valid=False, stock_symbol=req.stock_symbol, current_price=0,
            estimated_total=0, message=f"Could not get price for {req.stock_symbol}."
        )

    total = req.shares * price

    if req.transaction_type == "BUY":
        cash = float(ps.cash_balance)

        if season.margin_enabled and season.leverage_multiplier:
            holdings_value = await _get_holdings_value(db, ps.id)
            buying_power = calculate_buying_power(cash, holdings_value, float(season.leverage_multiplier))

            # Penny stock rule: no margin on stocks under $3
            if req.use_margin and price < 3.0:
                return TradeValidation(
                    is_valid=False, stock_symbol=req.stock_symbol, current_price=price,
                    estimated_total=total, available_cash=cash, buying_power=buying_power,
                    message=f"Stocks under $3.00 cannot be purchased on margin."
                )

            # Margin call: block new margin trades
            if ps.margin_call_active and total > cash:
                return TradeValidation(
                    is_valid=False, stock_symbol=req.stock_symbol, current_price=price,
                    estimated_total=total, available_cash=cash, buying_power=buying_power,
                    message="Margin call active — new margin trades are blocked. Sell positions to restore equity."
                )

            if total > buying_power:
                return TradeValidation(
                    is_valid=False, stock_symbol=req.stock_symbol, current_price=price,
                    estimated_total=total, available_cash=cash, buying_power=buying_power,
                    message=f"Insufficient buying power. Need ${total:,.2f} but have ${buying_power:,.2f}."
                )

            # Margin warning if trade would use borrowed funds
            margin_warning = None
            if total > cash:
                margin_needed = total - cash
                rate_pct = float(season.margin_interest_rate or 0.08) * 100
                margin_warning = (
                    f"This trade uses ${margin_needed:,.2f} in margin (borrowed funds). "
                    f"You'll be charged {rate_pct:.0f}% annual interest on the borrowed amount."
                )

            return TradeValidation(
                is_valid=True, stock_symbol=req.stock_symbol, current_price=price,
                estimated_total=total, available_cash=cash, buying_power=buying_power,
                margin_warning=margin_warning,
                message=f"Ready to buy {req.shares} shares of {req.stock_symbol} at ${price:,.2f}."
            )
        else:
            # Non-margin season: cash only
            if total > cash:
                return TradeValidation(
                    is_valid=False, stock_symbol=req.stock_symbol, current_price=price,
                    estimated_total=total, available_cash=cash,
                    message=f"Insufficient funds. Need ${total:,.2f} but have ${cash:,.2f}."
                )
            return TradeValidation(
                is_valid=True, stock_symbol=req.stock_symbol, current_price=price,
                estimated_total=total, available_cash=cash,
                message=f"Ready to buy {req.shares} shares of {req.stock_symbol} at ${price:,.2f}."
            )

    else:  # SELL
        holding = await _get_holding(db, ps.id, req.stock_symbol.upper())
        owned = float(holding.shares_owned) if holding else 0
        if req.shares > owned:
            return TradeValidation(
                is_valid=False, stock_symbol=req.stock_symbol, current_price=price,
                estimated_total=total, available_shares=owned,
                message=f"Insufficient shares. Trying to sell {req.shares} but own {owned}."
            )
        return TradeValidation(
            is_valid=True, stock_symbol=req.stock_symbol, current_price=price,
            estimated_total=total, available_shares=owned,
            message=f"Ready to sell {req.shares} shares of {req.stock_symbol} at ${price:,.2f}."
        )


async def execute_trade(
    db: AsyncSession, user_id: UUID, req: TradeRequest
) -> TradeResponse:
    """Execute a trade atomically. All-or-nothing."""
    # 0. Check market hours
    market_closed = _check_market_hours()
    if market_closed:
        raise TradeError(market_closed)

    symbol = req.stock_symbol.upper()

    # 1. Validate player is in season (lock row to prevent concurrent trades)
    ps = await _get_player_season(db, user_id, req.season_id, lock=True)
    if not ps:
        raise TradeError("You are not a member of this season.")

    # 2. Validate season is active
    season = await db.get(Season, req.season_id)
    if not season or not season.is_active:
        raise TradeError("This season is not active.")

    # 3. Validate stock is allowed
    if season.allowed_stocks and symbol not in season.allowed_stocks:
        raise TradeError(f"{symbol} is not tradeable in this season.")

    # 3b. Check trade count limit
    if season.max_trades_per_player is not None:
        count_result = await db.execute(
            select(func.count()).select_from(Transaction).where(
                Transaction.player_season_id == ps.id
            )
        )
        trade_count = count_result.scalar() or 0
        if trade_count >= season.max_trades_per_player:
            raise TradeError(
                f"Trade limit reached — this season allows {season.max_trades_per_player} trades per player."
            )

    # 3c. Validate stock exists in master catalog
    master = await db.get(StockMaster, symbol)
    if not master or not master.is_active:
        raise TradeError(f"{symbol} is not a recognized stock.")

    # 4. Get current price (fetches from Finnhub on-demand if needed)
    price = await get_stock_price(db, symbol)
    if not price:
        raise TradeError(f"Could not get price for {symbol}.")

    total = round(req.shares * price, 2)
    cash = float(ps.cash_balance)

    # 5. Validate funds/shares
    margin_used = 0.0
    if req.transaction_type == "BUY":
        if season.margin_enabled and season.leverage_multiplier:
            holdings_value = await _get_holdings_value(db, ps.id)
            buying_power = calculate_buying_power(cash, holdings_value, float(season.leverage_multiplier))

            # Penny stock rule
            if price < 3.0 and total > cash:
                raise TradeError("Stocks under $3.00 cannot be purchased on margin.")

            # Margin call: block new margin trades
            if ps.margin_call_active and total > cash:
                raise TradeError("Margin call active — new margin trades are blocked.")

            if total > buying_power:
                raise TradeError(
                    f"Insufficient buying power. Need ${total:,.2f} but have ${buying_power:,.2f}."
                )
        else:
            if total > cash:
                raise TradeError(
                    f"Insufficient funds. Need ${total:,.2f} but have ${cash:,.2f}."
                )
    else:
        holding = await _get_holding(db, ps.id, symbol, lock=True)
        owned = float(holding.shares_owned) if holding else 0
        if req.shares > owned:
            raise TradeError(
                f"Insufficient shares. Trying to sell {req.shares} but own {owned}."
            )

    # 6. Execute atomically
    # Record transaction
    txn = Transaction(
        player_season_id=ps.id,
        season_id=req.season_id,
        stock_symbol=symbol,
        transaction_type=req.transaction_type,
        shares=req.shares,
        price_per_share=price,
        total_amount=total,
    )
    db.add(txn)

    # Update cash (margin-aware)
    if req.transaction_type == "BUY":
        if season.margin_enabled and total > cash:
            # Margin buy: borrow the shortfall
            margin_used = round(total - cash, 2)
            ps.margin_loan_balance = round(float(ps.margin_loan_balance) + margin_used, 2)
            new_cash = 0.0
        else:
            new_cash = cash - total
    else:  # SELL
        proceeds = total
        if season.margin_enabled and float(ps.margin_loan_balance) > 0:
            # Auto-repay loan from proceeds
            repayment = min(proceeds, float(ps.margin_loan_balance))
            ps.margin_loan_balance = round(float(ps.margin_loan_balance) - repayment, 2)
            new_cash = cash + (proceeds - repayment)
        else:
            new_cash = cash + proceeds
    ps.cash_balance = round(new_cash, 2)

    # Update holdings (already locked for SELL, need lock for BUY)
    holding = await _get_holding(db, ps.id, symbol, lock=True)

    if req.transaction_type == "BUY":
        if holding:
            # Update average purchase price
            old_total_cost = float(holding.shares_owned) * float(holding.average_purchase_price)
            new_total_cost = old_total_cost + total
            new_shares = float(holding.shares_owned) + req.shares
            holding.shares_owned = new_shares
            holding.average_purchase_price = round(new_total_cost / new_shares, 4) if new_shares > 0 else 0
        else:
            holding = Holding(
                player_season_id=ps.id,
                stock_symbol=symbol,
                shares_owned=req.shares,
                average_purchase_price=price,
            )
            db.add(holding)
    else:  # SELL
        new_shares = float(holding.shares_owned) - req.shares
        if new_shares <= 0:
            await db.delete(holding)
        else:
            holding.shares_owned = new_shares

    await db.commit()

    return TradeResponse(
        transaction_id=txn.id,
        stock_symbol=symbol,
        transaction_type=req.transaction_type,
        shares=req.shares,
        price_per_share=price,
        total_amount=total,
        new_cash_balance=round(new_cash, 2),
        executed_at=txn.executed_at,
        margin_used=margin_used,
        new_margin_loan=round(float(ps.margin_loan_balance), 2),
    )


async def get_transaction_history(
    db: AsyncSession, user_id: UUID, season_id: str, limit: int = 50
) -> list[Transaction]:
    """Get trade history for a player in a season."""
    ps = await _get_player_season(db, user_id, season_id)
    if not ps:
        return []

    result = await db.execute(
        select(Transaction)
        .where(Transaction.player_season_id == ps.id)
        .order_by(Transaction.executed_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


# ── Private helpers ──

async def _get_player_season(
    db: AsyncSession, user_id: UUID, season_id: str, lock: bool = False
) -> PlayerSeason | None:
    stmt = select(PlayerSeason).where(
        PlayerSeason.user_id == user_id,
        PlayerSeason.season_id == season_id,
    )
    if lock:
        stmt = stmt.with_for_update()
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def _get_holding(
    db: AsyncSession, player_season_id: UUID, symbol: str, lock: bool = False
) -> Holding | None:
    stmt = select(Holding).where(
        Holding.player_season_id == player_season_id,
        Holding.stock_symbol == symbol,
    )
    if lock:
        stmt = stmt.with_for_update()
    result = await db.execute(stmt)
    return result.scalar_one_or_none()
