import json
import random
import uuid
import asyncio
import httpx
import time as _time
from datetime import datetime, date, time, timedelta, timezone
from zoneinfo import ZoneInfo
from sqlalchemy import select, func, and_, Integer, case
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.bounty import (
    BountyWindow, BountyWindowStock, BountyPrediction, BountyPlayerStats,
    SpyPriceLog, BountyPlayerIron, BountyIronOffering,
)
from app.models.user import User
from app.models.stock import StockActive, StockMaster
from app.services.finnhub_service import get_stock_price, fetch_quote
from app.services.bounty_config import (
    DIR_SCORING, HOL_SCORING, WANTED_MULT, WANTED_LEVEL_CAP,
    NOTORIETY_WEIGHT, NOTORIETY_UP_THRESHOLD, NOTORIETY_DOWN_THRESHOLD,
    ANTE_BASE, STARTING_DOUBLE_DOLLARS, STARTING_CHAMBERS, MAX_CHAMBERS,
    HOLD_THRESHOLD_FALLBACK, CONFIDENCE_LABELS, compute_hold_threshold,
    wanted_multiplier, skip_cost as calc_skip_cost,
    IRON_DEFS, IRON_DEFS_BY_ID, RARITY_WEIGHTS,
    chambers_for_level, bet_to_tier,
    max_leverage_for_level, margin_call_chance,
    MARGIN_CALL_PENALTY_DD, MARGIN_CALL_WANTED_DROP, MARGIN_CALL_COOLDOWN,
    CARRY_COST_PER_X, HOLD_LEVERAGE_FACTOR,
    LEVERAGE_NOTORIETY_BONUS_THRESHOLD, LEVERAGE_NOTORIETY_BONUS,
)
from app.config import get_settings

settings = get_settings()

ET = ZoneInfo("America/New_York")

# Rolling window duration (set to 2 for rapid testing, 120 for production)
WINDOW_DURATION_MINUTES = 2

# Stocks to create per bounty window
WINDOW_STOCKS = ["SPY", "NVDA", "AAPL", "TSLA", "MSFT", "AMZN", "GOOG", "PLTR", "SNDK"]

STOCK_NAMES = {
    "SPY": "S&P 500 ETF",
    "NVDA": "NVIDIA",
    "AAPL": "Apple",
    "TSLA": "Tesla",
    "MSFT": "Microsoft",
    "AMZN": "Amazon",
    "GOOG": "Alphabet",
    "PLTR": "Palantir",
    "SNDK": "SanDisk",
}

FINNHUB_BASE = "https://finnhub.io/api/v1"

# ── Chart cache (in-memory, TTL-based) ──
_chart_cache: dict[str, tuple[float, list[dict]]] = {}
CHART_CACHE_TTL = 90  # seconds


async def fetch_chart_cached(symbol: str) -> list[dict]:
    """Fetch chart data with in-memory caching (90s TTL)."""
    now = _time.time()
    cached = _chart_cache.get(symbol)
    if cached and (now - cached[0]) < CHART_CACHE_TTL:
        return cached[1]
    candles = await fetch_chart_yahoo(symbol)
    if candles:
        _chart_cache[symbol] = (now, candles)
    return candles


async def get_hot_stocks_pool(db: AsyncSession) -> list[str]:
    """Get top 25 trending stocks by volume rank, fallback to hardcoded list."""
    result = await db.execute(
        select(StockActive.symbol)
        .where(StockActive.trending_rank.isnot(None))
        .order_by(StockActive.trending_rank)
        .limit(25)
    )
    symbols = [row[0] for row in result.all()]
    if len(symbols) < 10:
        return WINDOW_STOCKS  # fallback to hardcoded
    return symbols


class BountyError(Exception):
    def __init__(self, message: str):
        self.message = message


# ── Iron effects aggregation ──

async def get_player_iron_effects(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """Query equipped irons and aggregate effects (mirrors sim's getIronEffects)."""
    result = await db.execute(
        select(BountyPlayerIron)
        .where(BountyPlayerIron.user_id == user_id)
        .order_by(BountyPlayerIron.slot_number)
    )
    equipped = list(result.scalars().all())

    fx = {
        "draw_win_bonus": 0,
        "all_lose_reduction": 0,
        "insurance_chance": 0.0,
        "ante_reduction": 0,
        "skip_discount": 0.0,
        "holster_win_bonus": 0,
        "qd_win_bonus": 0,
        "snake_oil": False,
        "de_insurance_chance": 0.0,
        "flat_cash_per_correct": 0,
        "notoriety_bonus": 0.0,
        "per_level_win_bonus": 0,
        "de_win_multiplier": 1,
        "ghost_chance": 0.0,
        "score_multiplier": 1.0,
        "leverage_cap_bonus": 0.0,
        "margin_call_reduction": 0.0,
        "carry_cost_discount": 0.0,
        "leverage_loss_shield": 0.0,
    }

    for iron_row in equipped:
        iron_def = IRON_DEFS_BY_ID.get(iron_row.iron_id)
        if not iron_def:
            continue
        effects = iron_def["effects"]
        for key, val in effects.items():
            if key == "snake_oil":
                fx["snake_oil"] = True
            elif key == "de_win_multiplier":
                fx["de_win_multiplier"] *= val
            elif key == "score_multiplier":
                fx["score_multiplier"] *= val
            elif key == "ghost_chance":
                fx["ghost_chance"] = min(1.0, fx["ghost_chance"] + val)
            elif key in fx:
                fx[key] += val

    return fx


async def get_equipped_irons(db: AsyncSession, user_id: uuid.UUID) -> list[dict]:
    """Return list of equipped iron defs with slot numbers."""
    result = await db.execute(
        select(BountyPlayerIron)
        .where(BountyPlayerIron.user_id == user_id)
        .order_by(BountyPlayerIron.slot_number)
    )
    irons = []
    for row in result.scalars().all():
        iron_def = IRON_DEFS_BY_ID.get(row.iron_id)
        if iron_def:
            irons.append({
                "iron_id": iron_def["id"],
                "name": iron_def["name"],
                "rarity": iron_def["rarity"],
                "description": iron_def["description"],
                "boost_description": iron_def.get("boost_description", ""),
                "slot_number": row.slot_number,
            })
    return irons


# ── Iron offering ──

def roll_iron_offering(equipped_ids: set[str]) -> list[dict]:
    """Roll 3 unique irons not already equipped, rarity-weighted."""
    available = [i for i in IRON_DEFS if i["id"] not in equipped_ids]
    if len(available) <= 3:
        return available[:3]

    pool = []
    for iron in available:
        weight = RARITY_WEIGHTS.get(iron["rarity"], 10)
        pool.extend([iron] * weight)

    picked = []
    picked_ids = set()
    while len(picked) < 3:
        iron = random.choice(pool)
        if iron["id"] not in picked_ids:
            picked.append(iron)
            picked_ids.add(iron["id"])
    return picked


async def create_iron_offering(
    db: AsyncSession, user_id: uuid.UUID, window_id: uuid.UUID | None = None
) -> BountyIronOffering | None:
    """Create an iron offering for a player after window settlement."""
    equipped_result = await db.execute(
        select(BountyPlayerIron.iron_id).where(BountyPlayerIron.user_id == user_id)
    )
    equipped_ids = {row for row in equipped_result.scalars().all()}

    offerings = roll_iron_offering(equipped_ids)
    if not offerings:
        return None

    offering = BountyIronOffering(
        user_id=user_id,
        bounty_window_id=window_id,
        offered_iron_ids=json.dumps([i["id"] for i in offerings]),
    )
    db.add(offering)
    return offering


async def get_pending_offering(db: AsyncSession, user_id: uuid.UUID) -> BountyIronOffering | None:
    """Get the most recent unconsumed iron offering."""
    result = await db.execute(
        select(BountyIronOffering)
        .where(
            BountyIronOffering.user_id == user_id,
            BountyIronOffering.chosen_iron_id.is_(None),
        )
        .order_by(BountyIronOffering.created_at.desc())
        .limit(1)
    )
    return result.scalars().first()


async def pick_iron(
    db: AsyncSession, user_id: uuid.UUID, iron_id: str
) -> dict:
    """Equip a chosen iron from the current offering."""
    offering = await get_pending_offering(db, user_id)
    if not offering:
        raise BountyError("No pending iron offering")

    offered_ids = json.loads(offering.offered_iron_ids)
    if iron_id not in offered_ids:
        raise BountyError("Iron not in current offering")

    iron_def = IRON_DEFS_BY_ID.get(iron_id)
    if not iron_def:
        raise BountyError("Unknown iron")

    # Mark offering as consumed
    offering.chosen_iron_id = iron_id

    # Get player stats for chamber count
    stats = await get_or_create_player_stats(db, user_id)

    # Get current equipped irons
    result = await db.execute(
        select(BountyPlayerIron)
        .where(BountyPlayerIron.user_id == user_id)
        .order_by(BountyPlayerIron.slot_number)
    )
    equipped = list(result.scalars().all())

    if len(equipped) >= stats.chambers:
        # Replace oldest (lowest slot number)
        oldest = equipped[0]
        await db.delete(oldest)
        await db.flush()

    # Find next slot number
    max_slot = max((i.slot_number for i in equipped), default=0)
    new_iron = BountyPlayerIron(
        user_id=user_id,
        iron_id=iron_id,
        slot_number=max_slot + 1,
    )
    db.add(new_iron)
    await db.commit()

    return {
        "iron_id": iron_def["id"],
        "name": iron_def["name"],
        "rarity": iron_def["rarity"],
        "description": iron_def["description"],
        "slot_number": new_iron.slot_number,
    }


# ── Window management ──

async def get_or_create_today_windows(db: AsyncSession) -> list[BountyWindow]:
    """Ensure a current rolling window exists. Auto-settle any expired unsettled windows."""
    now_et = datetime.now(ET)
    now_utc = datetime.now(timezone.utc)
    today = now_et.date()

    # Auto-settle any expired, unsettled windows
    result = await db.execute(
        select(BountyWindow)
        .where(BountyWindow.end_time <= now_utc, BountyWindow.is_settled == False)
    )
    unsettled = list(result.scalars().all())
    for w in unsettled:
        await settle_window(db, w.id)

    # Check if there's already an active window
    current = await get_current_window(db)
    if current:
        # If the window duration doesn't match config, settle it (leftover from old schedule)
        window_minutes = (current.end_time - current.start_time).total_seconds() / 60
        if abs(window_minutes - WINDOW_DURATION_MINUTES) > 1:
            await settle_window(db, current.id)
        else:
            return [current]

    # Create a new window aligned to WINDOW_DURATION_MINUTES boundaries
    minutes_since_midnight = now_et.hour * 60 + now_et.minute
    slot_start_minutes = (minutes_since_midnight // WINDOW_DURATION_MINUTES) * WINDOW_DURATION_MINUTES
    slot_hour = slot_start_minutes // 60
    slot_minute = slot_start_minutes % 60

    start_dt = datetime.combine(today, time(slot_hour, slot_minute), tzinfo=ET)
    end_dt = start_dt + timedelta(minutes=WINDOW_DURATION_MINUTES)

    # Check if this exact window already exists (was just settled)
    existing = await db.execute(
        select(BountyWindow).where(
            BountyWindow.window_date == today,
            BountyWindow.start_time == start_dt,
        )
    )
    if existing.scalars().first():
        # Window for this slot already ran — wait for next slot
        return []

    # Get next window_index for today
    count_result = await db.execute(
        select(func.count(BountyWindow.id)).where(BountyWindow.window_date == today)
    )
    next_index = (count_result.scalar() or 0) + 1

    window = BountyWindow(
        id=uuid.uuid4(),
        window_date=today,
        window_index=next_index,
        start_time=start_dt,
        end_time=end_dt,
    )
    db.add(window)
    await db.flush()

    # Create per-stock rows from hot stocks pool (or fallback)
    stock_pool = await get_hot_stocks_pool(db)
    for symbol in stock_pool:
        db.add(BountyWindowStock(
            bounty_window_id=window.id,
            symbol=symbol,
        ))

    await db.commit()
    await db.refresh(window)
    return [window]


async def get_current_window(db: AsyncSession) -> BountyWindow | None:
    """Return the active window (now between start and end), or None."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(BountyWindow)
        .where(BountyWindow.start_time <= now, BountyWindow.end_time > now)
        .order_by(BountyWindow.start_time.desc())
        .limit(1)
    )
    return result.scalars().first()


async def get_previous_window(db: AsyncSession) -> BountyWindow | None:
    """Return the most recently closed window."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(BountyWindow)
        .where(BountyWindow.end_time <= now)
        .order_by(BountyWindow.end_time.desc())
        .limit(1)
    )
    return result.scalars().first()


def get_next_window_time() -> datetime | None:
    """Calculate the next rolling window start time."""
    now_et = datetime.now(ET)
    today = now_et.date()

    # Next window starts at the next WINDOW_DURATION_MINUTES boundary
    minutes_since_midnight = now_et.hour * 60 + now_et.minute
    next_slot_minutes = ((minutes_since_midnight // WINDOW_DURATION_MINUTES) + 1) * WINDOW_DURATION_MINUTES
    next_hour = next_slot_minutes // 60
    next_minute = next_slot_minutes % 60

    if next_hour >= 24:
        next_day = today + timedelta(days=1)
        return datetime.combine(next_day, time(0, 0), tzinfo=ET)

    return datetime.combine(today, time(next_hour, next_minute), tzinfo=ET)


async def get_or_create_player_stats(db: AsyncSession, user_id: uuid.UUID) -> BountyPlayerStats:
    """Get existing stats or create a new record with starting balance."""
    result = await db.execute(
        select(BountyPlayerStats).where(BountyPlayerStats.user_id == user_id)
    )
    stats = result.scalars().first()
    if not stats:
        stats = BountyPlayerStats(
            user_id=user_id,
            double_dollars=STARTING_DOUBLE_DOLLARS,
            wanted_level=1,
            chambers=STARTING_CHAMBERS,
        )
        db.add(stats)
        await db.commit()
        await db.refresh(stats)
    return stats


# ── Prediction submission ──

async def submit_prediction(
    db: AsyncSession,
    user_id: uuid.UUID,
    window_id: uuid.UUID,
    prediction: str,
    bet_amount: int,
    symbol: str = "SPY",
    leverage: float = 1.0,
) -> BountyPrediction:
    """Submit a prediction for a bounty window."""
    # Validate window exists and is active
    window = await db.get(BountyWindow, window_id)
    if not window:
        raise BountyError("Bounty window not found")

    # Validate symbol against window's actual stocks
    stock_check = await db.execute(
        select(BountyWindowStock).where(
            BountyWindowStock.bounty_window_id == window_id,
            BountyWindowStock.symbol == symbol,
        )
    )
    if not stock_check.scalars().first():
        raise BountyError(f"Invalid stock symbol: {symbol}")

    now = datetime.now(timezone.utc)
    if now < window.start_time or now >= window.end_time:
        raise BountyError("This bounty window is not currently active")

    if window.is_settled:
        raise BountyError("This bounty window has already been settled")

    # Check for existing prediction for this stock
    result = await db.execute(
        select(BountyPrediction).where(
            BountyPrediction.user_id == user_id,
            BountyPrediction.bounty_window_id == window_id,
            BountyPrediction.symbol == symbol,
        )
    )
    if result.scalars().first():
        raise BountyError(f"You've already made a prediction for {symbol} in this window")

    if prediction not in ("UP", "DOWN", "HOLD"):
        raise BountyError("Prediction must be UP, DOWN, or HOLD")
    if not (0 <= bet_amount <= 100):
        raise BountyError("Bet amount must be between 0 and 100")

    # Derive pseudo-tier from bet amount for iron effects
    confidence = bet_to_tier(bet_amount)

    stats = await get_or_create_player_stats(db, user_id)

    # Check bust state
    if stats.is_busted:
        raise BountyError("You're busted! Reset to start over.")

    # Determine action type
    action_type = "holster" if prediction == "HOLD" else "directional"

    # Ante: deducted on first prediction in this window
    existing_preds = await db.execute(
        select(func.count(BountyPrediction.id)).where(
            BountyPrediction.user_id == user_id,
            BountyPrediction.bounty_window_id == window_id,
        )
    )
    is_first_in_window = (existing_preds.scalar() or 0) == 0

    fx = await get_player_iron_effects(db, user_id)
    ante_cost = 0
    if is_first_in_window:
        ante_cost = max(0, ANTE_BASE - fx["ante_reduction"])
        if stats.double_dollars < ante_cost:
            raise BountyError(f"Can't afford ante ($${ ante_cost }). You need $${ ante_cost - stats.double_dollars } more.")
        stats.double_dollars -= ante_cost
        # Reset skip count for this window
        stats.skip_count_this_window = 0
        # Reset notoriety for this window
        stats.notoriety = 0.0

    # Leverage validation
    max_lev = max_leverage_for_level(max(stats.wanted_level, 1))
    if leverage < 1.0 or leverage > max_lev:
        raise BountyError(f"Leverage must be between 1.0x and {max_lev}x at your wanted level")
    if stats.margin_call_cooldown > 0 and leverage > 1.0:
        raise BountyError("Margin call cooldown active — leverage locked to 1.0x")

    # Carry cost for leverage
    carry_cost = round((leverage - 1.0) * CARRY_COST_PER_X)
    if carry_cost > 0:
        if stats.double_dollars < carry_cost:
            raise BountyError(f"Can't afford leverage carry cost ($${ carry_cost })")
        stats.double_dollars -= carry_cost

    # Decrement margin call cooldown
    if stats.margin_call_cooldown > 0:
        stats.margin_call_cooldown -= 1

    mult = wanted_multiplier(max(stats.wanted_level, 1))

    pred = BountyPrediction(
        user_id=user_id,
        bounty_window_id=window_id,
        symbol=symbol,
        prediction=prediction,
        confidence=confidence,
        bet_amount=bet_amount,
        wanted_level_at_pick=stats.wanted_level,
        action_type=action_type,
        wanted_multiplier_used=mult,
        leverage=leverage,
    )
    db.add(pred)

    stats.total_predictions += 1
    stats.last_prediction_at = now

    await db.commit()
    await db.refresh(pred)
    return pred


# ── Skip ──

async def submit_skip(
    db: AsyncSession,
    user_id: uuid.UUID,
    window_id: uuid.UUID,
    symbol: str,
) -> dict:
    """Process a skip — deduct cost from balance."""
    stats = await get_or_create_player_stats(db, user_id)

    if stats.is_busted:
        raise BountyError("You're busted! Reset to start over.")

    fx = await get_player_iron_effects(db, user_id)
    raw_cost = calc_skip_cost(stats.skip_count_this_window + 1, stats.double_dollars)
    cost = max(1, round(raw_cost * (1 - fx["skip_discount"])))

    if stats.double_dollars < cost:
        raise BountyError(f"Can't afford skip ($${ cost })")

    stats.double_dollars -= cost
    stats.skip_count_this_window += 1

    # Check bust
    if stats.double_dollars <= 0:
        await _bust_player(db, stats)

    await db.commit()
    return {"skip_cost": cost, "new_balance": stats.double_dollars, "is_busted": stats.is_busted}


# ── Settlement ──

async def record_window_open_price(db: AsyncSession, window_id: uuid.UUID) -> None:
    """Fetch current SPY price and save as spy_open_price. Also set per-stock open prices."""
    window = await db.get(BountyWindow, window_id)
    if not window or window.spy_open_price is not None:
        return

    price = await get_stock_price(db, "SPY")
    if price:
        window.spy_open_price = price

    # Set open prices on per-stock rows
    result = await db.execute(
        select(BountyWindowStock).where(
            BountyWindowStock.bounty_window_id == window_id,
            BountyWindowStock.open_price.is_(None),
        )
    )
    for stock_row in result.scalars().all():
        stock_price = await get_stock_price(db, stock_row.symbol)
        if stock_price:
            stock_row.open_price = stock_price

    await db.commit()


async def settle_window(db: AsyncSession, window_id: uuid.UUID) -> None:
    """Settle a bounty window: fetch closing prices, determine results, score with sim mechanics."""
    window = await db.get(BountyWindow, window_id)
    if not window or window.is_settled:
        return

    # Settle per-stock rows
    stock_result = await db.execute(
        select(BountyWindowStock).where(BountyWindowStock.bounty_window_id == window_id)
    )
    stock_rows = list(stock_result.scalars().all())

    # Build symbol → result map and price change map
    stock_results: dict[str, str] = {}
    stock_changes: dict[str, float] = {}  # symbol → abs(pct_change)

    for stock_row in stock_rows:
        if stock_row.is_settled:
            if stock_row.result:
                stock_results[stock_row.symbol] = stock_row.result
            continue

        price = await get_stock_price(db, stock_row.symbol)
        if not price:
            continue

        stock_row.close_price = price
        if stock_row.open_price is not None:
            open_f = float(stock_row.open_price)
            pct_change = (price - open_f) / open_f if open_f != 0 else 0
            stock_changes[stock_row.symbol] = abs(pct_change)

            # Dynamic hold threshold based on stock volatility
            candles = await fetch_chart_yahoo(stock_row.symbol)
            hold_threshold = compute_hold_threshold(candles) if candles else HOLD_THRESHOLD_FALLBACK

            if abs(pct_change) < hold_threshold:
                stock_row.result = "HOLD"
            elif price >= open_f:
                stock_row.result = "UP"
            else:
                stock_row.result = "DOWN"
        else:
            stock_row.result = "UP"
        stock_row.is_settled = True
        stock_results[stock_row.symbol] = stock_row.result

    # Also set legacy SPY fields on the window itself
    spy_price = await get_stock_price(db, "SPY")
    if spy_price:
        window.spy_close_price = spy_price
    if window.spy_open_price is not None and spy_price:
        window.result = "UP" if spy_price >= float(window.spy_open_price) else "DOWN"
    elif "SPY" in stock_results:
        window.result = stock_results["SPY"]
    else:
        window.result = "UP"

    window.is_settled = True

    # Score all predictions by matching symbol — using sim mechanics
    pred_result = await db.execute(
        select(BountyPrediction).where(BountyPrediction.bounty_window_id == window_id)
    )
    predictions = list(pred_result.scalars().all())

    # Group predictions by user for notoriety/iron tracking
    user_predictions: dict[uuid.UUID, list[BountyPrediction]] = {}
    for pred in predictions:
        user_predictions.setdefault(pred.user_id, []).append(pred)

    for user_id, user_preds in user_predictions.items():
        stats = await get_or_create_player_stats(db, user_id)
        fx = await get_player_iron_effects(db, user_id)

        window_notoriety = 0.0

        for pred in user_preds:
            stock_result_value = stock_results.get(pred.symbol, window.result)
            is_holster = pred.action_type == "holster"

            # Determine correctness
            if is_holster:
                # HOLD is correct if result is HOLD (price barely moved)
                is_correct = stock_result_value == "HOLD"
            else:
                is_correct = pred.prediction == stock_result_value

            # Ghost Rider: miss → correct flip
            ghost_triggered = False
            if not is_correct and fx["ghost_chance"] > 0 and random.random() < fx["ghost_chance"]:
                is_correct = True
                ghost_triggered = True

            # Insurance check (Lucky Horseshoe / Deadeye Scope)
            insurance_triggered = False
            if not is_correct:
                chance = fx["insurance_chance"]
                if pred.confidence == 3:
                    chance += fx["de_insurance_chance"]
                if chance > 0 and random.random() < chance:
                    insurance_triggered = True

            pred.is_correct = is_correct
            pred.insurance_triggered = insurance_triggered

            # Calculate scoring — bet-based with leverage
            bet = pred.bet_amount or 0
            conf = pred.confidence or bet_to_tier(bet)
            mult = wanted_multiplier(max(stats.wanted_level, 1))

            # Effective leverage (halved for HOLD)
            eff_lev = 1 + (pred.leverage - 1) * HOLD_LEVERAGE_FACTOR if is_holster else pred.leverage

            if insurance_triggered:
                base = 0
            elif is_correct:
                win_val = round(bet * eff_lev * mult)
                # Apply iron win bonuses (scaled by mult already in bet, add flat bonuses)
                if conf == 1:
                    win_val += fx["draw_win_bonus"] * mult
                if conf == 2:
                    win_val += fx["qd_win_bonus"] * mult
                if is_holster:
                    win_val += fx["holster_win_bonus"] * mult
                win_val += fx["per_level_win_bonus"] * stats.wanted_level * mult
                # DE Double Barrel
                if conf == 3 and not is_holster and fx["de_win_multiplier"] > 1:
                    win_val = round(win_val * fx["de_win_multiplier"])
                base = win_val
            else:
                lose_val = round(bet * eff_lev)
                # Apply iron loss reduction
                lose_val = max(0, lose_val - fx["all_lose_reduction"])
                # Leverage loss shield iron effect
                if fx["leverage_loss_shield"] > 0:
                    lose_val = round(lose_val * (1 - fx["leverage_loss_shield"]))
                # Snake Oil: Draw holster losses = 0
                if fx["snake_oil"] and is_holster and conf == 1:
                    lose_val = 0
                base = -lose_val

                # Margin call check (not for HOLD, not for insurance)
                if not is_holster and not insurance_triggered and pred.leverage > 2.0:
                    mc_chance = margin_call_chance(pred.leverage)
                    # Apply iron margin call reduction
                    mc_chance = max(0, mc_chance - fx["margin_call_reduction"])
                    if random.random() < mc_chance:
                        pred.margin_call_triggered = True
                        stats.double_dollars -= MARGIN_CALL_PENALTY_DD
                        stats.wanted_level = max(1, stats.wanted_level - MARGIN_CALL_WANTED_DROP)
                        stats.margin_call_cooldown = MARGIN_CALL_COOLDOWN

            pred.base_points = base
            pred.wanted_multiplier_used = mult

            payout = round(base * fx["score_multiplier"])

            # Flat cash bonus (unscaled)
            if is_correct and fx["flat_cash_per_correct"] > 0:
                payout += fx["flat_cash_per_correct"]

            pred.payout = payout
            stats.double_dollars += payout

            if is_correct:
                stats.correct_predictions += 1

            # Notoriety accumulation: bet_amount / 33 to scale into ~0-3 range
            notoriety_weight = bet / 33.0 if bet > 0 else 1.0
            notoriety_delta = notoriety_weight * (1 if is_correct else -1)
            if is_correct and fx["notoriety_bonus"] > 0:
                notoriety_delta += fx["notoriety_bonus"]
            # Leverage notoriety bonus for high-leverage correct picks
            if is_correct and pred.leverage >= LEVERAGE_NOTORIETY_BONUS_THRESHOLD:
                notoriety_delta += LEVERAGE_NOTORIETY_BONUS
            window_notoriety += notoriety_delta

        # End of window for this user: evaluate notoriety → wanted level
        if window_notoriety >= NOTORIETY_UP_THRESHOLD:
            stats.wanted_level = max(1, stats.wanted_level + 1)
        elif window_notoriety <= NOTORIETY_DOWN_THRESHOLD:
            stats.wanted_level = max(1, stats.wanted_level - 1)

        stats.best_streak = max(stats.best_streak, stats.wanted_level)
        stats.chambers = max(stats.chambers, chambers_for_level(stats.wanted_level))
        stats.notoriety = window_notoriety

        # Check bust
        if stats.double_dollars <= 0:
            await _bust_player(db, stats)
        else:
            # Alive — create iron offering
            await create_iron_offering(db, user_id, window_id)

    await db.commit()


async def _bust_player(db: AsyncSession, stats: BountyPlayerStats) -> None:
    """Mark player as busted, clear irons."""
    stats.is_busted = True
    stats.bust_count += 1
    stats.double_dollars = 0

    # Clear equipped irons
    result = await db.execute(
        select(BountyPlayerIron).where(BountyPlayerIron.user_id == stats.user_id)
    )
    for iron in result.scalars().all():
        await db.delete(iron)


async def reset_player(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """Reset a player to start fresh (works whether busted or not)."""
    stats = await get_or_create_player_stats(db, user_id)

    stats.double_dollars = STARTING_DOUBLE_DOLLARS
    stats.wanted_level = 1
    stats.is_busted = False
    stats.notoriety = 0.0
    stats.skip_count_this_window = 0
    stats.margin_call_cooldown = 0
    # Chambers persist across resets (high-water mark)

    # Clear irons (should already be empty but just in case)
    result = await db.execute(
        select(BountyPlayerIron).where(BountyPlayerIron.user_id == user_id)
    )
    for iron in result.scalars().all():
        await db.delete(iron)

    # Clear any pending offerings
    off_result = await db.execute(
        select(BountyIronOffering).where(
            BountyIronOffering.user_id == user_id,
            BountyIronOffering.chosen_iron_id.is_(None),
        )
    )
    for off in off_result.scalars().all():
        off.chosen_iron_id = "__reset__"

    # Create a fresh iron offering for the new game
    await create_iron_offering(db, user_id, window_id=None)

    await db.commit()
    return {
        "double_dollars": stats.double_dollars,
        "message": "Fresh start! You're back in the game.",
    }


# ── Query helpers ──

async def get_user_prediction(
    db: AsyncSession, user_id: uuid.UUID, window_id: uuid.UUID
) -> BountyPrediction | None:
    """Get a user's prediction for a specific window."""
    result = await db.execute(
        select(BountyPrediction).where(
            BountyPrediction.user_id == user_id,
            BountyPrediction.bounty_window_id == window_id,
        )
    )
    return result.scalars().first()


def _pick_to_response(pred: BountyPrediction) -> dict:
    """Convert a prediction to response dict."""
    conf = pred.confidence or bet_to_tier(pred.bet_amount or 0)
    return {
        "id": pred.id,
        "prediction": pred.prediction,
        "confidence": conf,
        "confidence_label": CONFIDENCE_LABELS.get(conf, "Draw"),
        "bet_amount": pred.bet_amount or 0,
        "is_correct": pred.is_correct,
        "payout": pred.payout,
        "wanted_level_at_pick": pred.wanted_level_at_pick,
        "created_at": pred.created_at,
        "action_type": pred.action_type,
        "insurance_triggered": pred.insurance_triggered,
        "base_points": pred.base_points,
        "wanted_multiplier_used": pred.wanted_multiplier_used,
        "leverage": pred.leverage,
        "margin_call_triggered": pred.margin_call_triggered,
    }


def _window_to_response(window: BountyWindow) -> dict:
    """Convert a window to response dict."""
    return {
        "id": window.id,
        "window_date": window.window_date,
        "window_index": window.window_index,
        "start_time": window.start_time,
        "end_time": window.end_time,
        "spy_open_price": float(window.spy_open_price) if window.spy_open_price else None,
        "spy_close_price": float(window.spy_close_price) if window.spy_close_price else None,
        "result": window.result,
        "is_settled": window.is_settled,
    }


def _stats_to_response(stats: BountyPlayerStats) -> dict:
    """Convert player stats to response dict."""
    accuracy = (
        round(stats.correct_predictions / stats.total_predictions * 100, 1)
        if stats.total_predictions > 0
        else 0.0
    )
    return {
        "double_dollars": stats.double_dollars,
        "wanted_level": stats.wanted_level,
        "total_predictions": stats.total_predictions,
        "correct_predictions": stats.correct_predictions,
        "accuracy_pct": accuracy,
        "best_streak": stats.best_streak,
        "notoriety": stats.notoriety,
        "chambers": stats.chambers,
        "is_busted": stats.is_busted,
        "bust_count": stats.bust_count,
        "margin_call_cooldown": stats.margin_call_cooldown,
        "pending_offering": False,  # Set by caller
    }


async def get_bounty_status(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """Assemble the main polling response."""
    # Ensure today's windows exist
    await get_or_create_today_windows(db)

    current = await get_current_window(db)

    # Record open price if not set yet
    if current and current.spy_open_price is None:
        await record_window_open_price(db, current.id)
        await db.refresh(current)
    previous = await get_previous_window(db)
    stats = await get_or_create_player_stats(db, user_id)
    fx = await get_player_iron_effects(db, user_id)

    my_pick = None
    if current:
        pred = await get_user_prediction(db, user_id, current.id)
        if pred:
            my_pick = _pick_to_response(pred)

    previous_pick = None
    if previous:
        pred = await get_user_prediction(db, user_id, previous.id)
        if pred:
            previous_pick = _pick_to_response(pred)

    # Check for pending iron offering
    pending = await get_pending_offering(db, user_id)

    # Fetch SPY chart: Yahoo Finance (2h of 1-min data), fallback to self-logged prices
    candles = []
    if current:
        candles = await fetch_chart_cached("SPY")

        # Fallback: use self-logged prices if Yahoo fails
        if not candles:
            now_utc = datetime.now(timezone.utc)
            two_hours_ago = now_utc - timedelta(hours=2)
            log_result = await db.execute(
                select(SpyPriceLog)
                .where(SpyPriceLog.recorded_at >= two_hours_ago)
                .order_by(SpyPriceLog.recorded_at)
            )
            candles = [
                {"timestamp": int(row.recorded_at.timestamp()), "close": float(row.price)}
                for row in log_result.scalars().all()
            ]

        # Still log current price for fallback data
        quote = await fetch_quote("SPY")
        if quote:
            db.add(SpyPriceLog(price=quote["c"]))
            await db.commit()

    # Build per-stock status
    stocks_status = []
    if current:
        stock_result = await db.execute(
            select(BountyWindowStock).where(
                BountyWindowStock.bounty_window_id == current.id
            )
        )
        stock_rows = list(stock_result.scalars().all())

        # Get all user predictions for this window
        pred_result = await db.execute(
            select(BountyPrediction).where(
                BountyPrediction.user_id == user_id,
                BountyPrediction.bounty_window_id == current.id,
            )
        )
        user_preds = {p.symbol: p for p in pred_result.scalars().all()}

        # Fetch all stock charts in parallel
        chart_tasks = [fetch_chart_cached(sr.symbol) for sr in stock_rows]
        all_candles = await asyncio.gather(*chart_tasks)

        for stock_row, stock_candles in zip(stock_rows, all_candles):
            stock_pick = user_preds.get(stock_row.symbol)

            # Dynamic name: try StockActive, fallback to hardcoded
            stock_active = await db.get(StockActive, stock_row.symbol)
            name = stock_active.name if stock_active and stock_active.name else STOCK_NAMES.get(stock_row.symbol, stock_row.symbol)

            stocks_status.append({
                "symbol": stock_row.symbol,
                "name": name,
                "open_price": float(stock_row.open_price) if stock_row.open_price else None,
                "close_price": float(stock_row.close_price) if stock_row.close_price else None,
                "result": stock_row.result,
                "is_settled": stock_row.is_settled,
                "candles": stock_candles,
                "my_pick": _pick_to_response(stock_pick) if stock_pick else None,
            })

    # Compute ante cost and skip cost for client display
    ante_cost = max(0, ANTE_BASE - fx["ante_reduction"])
    raw_skip = calc_skip_cost(stats.skip_count_this_window + 1, stats.double_dollars)
    next_skip_cost = max(1, round(raw_skip * (1 - fx["skip_discount"])))

    # Get equipped irons
    equipped_irons = await get_equipped_irons(db, user_id)

    stats_response = _stats_to_response(stats)
    stats_response["pending_offering"] = pending is not None
    stats_response["equipped_irons"] = equipped_irons

    return {
        "current_window": _window_to_response(current) if current else None,
        "previous_window": _window_to_response(previous) if previous else None,
        "my_pick": my_pick,
        "previous_pick": previous_pick,
        "player_stats": stats_response,
        "next_window_time": get_next_window_time(),
        "spy_candles": candles,
        "stocks": stocks_status,
        "ante_cost": ante_cost,
        "skip_cost": next_skip_cost,
        "max_leverage": max_leverage_for_level(max(stats.wanted_level, 1)),
    }


async def get_bounty_board(db: AsyncSession, period: str = "alltime") -> list[dict]:
    """Return ranked bounty leaderboard."""
    if period == "weekly":
        # Sum payouts from this week's predictions
        now_et = datetime.now(ET)
        week_start = now_et.date() - timedelta(days=now_et.weekday())
        week_start_dt = datetime.combine(week_start, time(0, 0), tzinfo=ET)

        result = await db.execute(
            select(
                User.alias,
                func.coalesce(func.sum(BountyPrediction.payout), 0).label("weekly_dollars"),
                func.count(BountyPrediction.id).label("total"),
                func.count(BountyPrediction.id).filter(
                    BountyPrediction.is_correct == True
                ).label("correct"),
            )
            .join(BountyPrediction, User.id == BountyPrediction.user_id)
            .where(BountyPrediction.created_at >= week_start_dt)
            .group_by(User.id, User.alias)
            .order_by(func.coalesce(func.sum(BountyPrediction.payout), 0).desc())
        )
        rows = result.all()

        board = []
        for i, row in enumerate(rows, start=1):
            total = row.total or 0
            correct = row.correct or 0
            board.append({
                "rank": i,
                "alias": row.alias,
                "double_dollars": int(row.weekly_dollars),
                "accuracy_pct": round(correct / total * 100, 1) if total > 0 else 0.0,
                "wanted_level": 0,
                "total_predictions": total,
            })
        return board
    else:
        # All-time: use bounty_player_stats
        result = await db.execute(
            select(User.alias, BountyPlayerStats)
            .join(BountyPlayerStats, User.id == BountyPlayerStats.user_id)
            .where(BountyPlayerStats.total_predictions > 0)
            .order_by(BountyPlayerStats.double_dollars.desc())
        )
        rows = result.all()

        board = []
        for i, row in enumerate(rows, start=1):
            stats = row[1]
            board.append({
                "rank": i,
                "alias": row.alias,
                "double_dollars": stats.double_dollars,
                "accuracy_pct": round(
                    stats.correct_predictions / stats.total_predictions * 100, 1
                ) if stats.total_predictions > 0 else 0.0,
                "wanted_level": stats.wanted_level,
                "total_predictions": stats.total_predictions,
            })
        return board


async def fetch_chart_yahoo(symbol: str = "SPY") -> list[dict]:
    """Fetch last 2 hours of 5-minute OHLC data from Yahoo Finance."""
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
                params={"interval": "5m", "range": "2h"},
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=10.0,
            )
            if resp.status_code != 200:
                return []

            data = resp.json()
            result = data.get("chart", {}).get("result", [])
            if not result:
                return []

            timestamps = result[0].get("timestamp", [])
            quote = result[0].get("indicators", {}).get("quote", [{}])[0]
            opens = quote.get("open", [])
            highs = quote.get("high", [])
            lows = quote.get("low", [])
            closes = quote.get("close", [])

            if not timestamps or not closes:
                return []

            candles = []
            for i, ts in enumerate(timestamps):
                c = closes[i] if i < len(closes) else None
                if c is None:
                    continue
                point: dict = {"timestamp": ts, "close": round(c, 2)}
                o = opens[i] if i < len(opens) else None
                h = highs[i] if i < len(highs) else None
                lo = lows[i] if i < len(lows) else None
                if o is not None:
                    point["open"] = round(o, 2)
                if h is not None:
                    point["high"] = round(h, 2)
                if lo is not None:
                    point["low"] = round(lo, 2)
                candles.append(point)
            return candles
        except (httpx.RequestError, KeyError, IndexError):
            return []


async def get_prediction_history(
    db: AsyncSession, user_id: uuid.UUID, limit: int = 20
) -> list[dict]:
    """Get a user's recent prediction history."""
    result = await db.execute(
        select(BountyPrediction)
        .where(BountyPrediction.user_id == user_id)
        .order_by(BountyPrediction.created_at.desc())
        .limit(limit)
    )
    predictions = list(result.scalars().all())
    return [_pick_to_response(p) for p in predictions]


# Time slot stats are grouped by hour for display


async def get_detailed_stats(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """Build detailed analytics for a player."""
    stats = await get_or_create_player_stats(db, user_id)

    # --- Confidence stats ---
    conf_result = await db.execute(
        select(
            BountyPrediction.confidence,
            func.count(BountyPrediction.id).label("total"),
            func.count(BountyPrediction.id).filter(
                BountyPrediction.is_correct == True
            ).label("correct"),
        )
        .where(BountyPrediction.user_id == user_id, BountyPrediction.is_correct.isnot(None))
        .group_by(BountyPrediction.confidence)
    )
    confidence_stats = []
    for row in conf_result.all():
        total = row.total or 0
        correct = row.correct or 0
        confidence_stats.append({
            "confidence": row.confidence,
            "label": CONFIDENCE_LABELS[row.confidence],
            "total": total,
            "correct": correct,
            "win_rate": round(correct / total * 100, 1) if total > 0 else 0.0,
        })
    # Fill in missing confidence levels
    existing = {c["confidence"] for c in confidence_stats}
    for conf in (1, 2, 3):
        if conf not in existing:
            confidence_stats.append({
                "confidence": conf, "label": CONFIDENCE_LABELS[conf],
                "total": 0, "correct": 0, "win_rate": 0.0,
            })
    confidence_stats.sort(key=lambda c: c["confidence"])

    # --- Time slot stats (grouped into 2-hour ET buckets) ---
    # Extract ET hour from UTC start_time
    et_hour_col = func.extract(
        "hour",
        func.timezone("America/New_York", BountyWindow.start_time)
    ).cast(Integer)

    slot_result = await db.execute(
        select(
            et_hour_col.label("et_hour"),
            func.count(BountyPrediction.id).label("total"),
            func.count(BountyPrediction.id).filter(
                BountyPrediction.is_correct == True
            ).label("correct"),
        )
        .join(BountyWindow, BountyPrediction.bounty_window_id == BountyWindow.id)
        .where(BountyPrediction.user_id == user_id, BountyPrediction.is_correct.isnot(None))
        .group_by(et_hour_col)
    )
    # Collect per-hour data
    hour_data = {int(row.et_hour): (row.total or 0, row.correct or 0) for row in slot_result.all()}

    # Always show all 6 standard 2-hour slots, summing both hours in each slot
    TIME_SLOTS = [(9, "9 AM"), (11, "11 AM"), (13, "1 PM"), (15, "3 PM"), (17, "5 PM"), (19, "7 PM")]
    time_slot_stats = []
    for i, (slot_hour, label) in enumerate(TIME_SLOTS, start=1):
        t1, c1 = hour_data.get(slot_hour, (0, 0))
        t2, c2 = hour_data.get(slot_hour + 1, (0, 0))
        total = t1 + t2
        correct = c1 + c2
        time_slot_stats.append({
            "window_index": i,
            "time_label": label,
            "total": total,
            "correct": correct,
            "win_rate": round(correct / total * 100, 1) if total > 0 else 0.0,
        })

    # --- Ticker stats ---
    ticker_result = await db.execute(
        select(
            BountyPrediction.symbol,
            func.count(BountyPrediction.id).label("total"),
            func.count(BountyPrediction.id).filter(
                BountyPrediction.is_correct == True
            ).label("correct"),
        )
        .where(BountyPrediction.user_id == user_id, BountyPrediction.is_correct.isnot(None))
        .group_by(BountyPrediction.symbol)
    )
    ticker_stats = []
    for row in ticker_result.all():
        total = row.total or 0
        correct = row.correct or 0
        ticker_stats.append({
            "symbol": row.symbol,
            "total": total,
            "correct": correct,
            "win_rate": round(correct / total * 100, 1) if total > 0 else 0.0,
        })
    ticker_stats.sort(key=lambda t: t["symbol"])

    # --- Weekly trend ---
    now_et = datetime.now(ET)
    this_week_start = now_et.date() - timedelta(days=now_et.weekday())
    last_week_start = this_week_start - timedelta(days=7)
    this_week_dt = datetime.combine(this_week_start, time(0, 0), tzinfo=ET)
    last_week_dt = datetime.combine(last_week_start, time(0, 0), tzinfo=ET)

    tw_result = await db.execute(
        select(func.coalesce(func.sum(BountyPrediction.payout), 0))
        .where(BountyPrediction.user_id == user_id, BountyPrediction.created_at >= this_week_dt)
    )
    this_week_total = int(tw_result.scalar() or 0)

    lw_result = await db.execute(
        select(func.coalesce(func.sum(BountyPrediction.payout), 0))
        .where(
            BountyPrediction.user_id == user_id,
            BountyPrediction.created_at >= last_week_dt,
            BountyPrediction.created_at < this_week_dt,
        )
    )
    last_week_total = int(lw_result.scalar() or 0)

    # --- Board rank ---
    rank_result = await db.execute(
        select(func.count(BountyPlayerStats.id))
        .where(BountyPlayerStats.double_dollars > stats.double_dollars)
    )
    rank = (rank_result.scalar() or 0) + 1 if stats.total_predictions > 0 else None

    # --- Wanted level progress ---
    progress_pct = round(stats.wanted_level / WANTED_LEVEL_CAP * 100, 1)

    accuracy = (
        round(stats.correct_predictions / stats.total_predictions * 100, 1)
        if stats.total_predictions > 0 else 0.0
    )

    return {
        "double_dollars": stats.double_dollars,
        "wanted_level": stats.wanted_level,
        "total_predictions": stats.total_predictions,
        "correct_predictions": stats.correct_predictions,
        "accuracy_pct": accuracy,
        "best_streak": stats.best_streak,
        "confidence_stats": confidence_stats,
        "time_slot_stats": time_slot_stats,
        "ticker_stats": ticker_stats,
        "weekly_trend": {
            "this_week": this_week_total,
            "last_week": last_week_total,
            "change": this_week_total - last_week_total,
        },
        "board_rank": rank,
        "wanted_level_progress": {
            "current_level": stats.wanted_level,
            "max_level": WANTED_LEVEL_CAP,
            "progress_pct": progress_pct,
        },
    }
