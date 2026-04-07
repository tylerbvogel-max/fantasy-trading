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
    BountyRunHistory, BountyBadge, BountyTitle, BountyActivityEvent,
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
    IRON_DEFS, IRON_DEFS_BY_ID, RARITY_WEIGHTS, RARITY_MIN_LEVEL,
    chambers_for_level, bet_to_tier,
    max_leverage_for_level, margin_call_chance,
    MARGIN_CALL_PENALTY_DD, MARGIN_CALL_WANTED_DROP, MARGIN_CALL_COOLDOWN,
    CARRY_COST_PER_X, HOLD_LEVERAGE_FACTOR,
    LEVERAGE_NOTORIETY_BONUS_THRESHOLD, LEVERAGE_NOTORIETY_BONUS,
    compute_run_score,
    BADGE_DEFS, BADGE_DEFS_BY_ID,
    TITLE_DEFS, TITLE_DEFS_BY_ID,
    STREAK_REWARDS, STREAK_SHIELD_THRESHOLD,
    IRON_COMBOS,
    MAG_7_SYMBOLS, SECTOR_SPOTLIGHT_ROTATION, STOCK_EVENT_TYPES,
)
from app.config import get_settings

settings = get_settings()

ET = ZoneInfo("America/New_York")

# Rolling window duration: from config (default 2 for dev, set to 120 in production via env)
WINDOW_DURATION_MINUTES = settings.bounty_window_minutes

# Stocks to create per bounty window
WINDOW_STOCKS = ("SPY", "NVDA", "AAPL", "TSLA", "MSFT", "AMZN", "GOOG", "PLTR", "SNDK")

from types import MappingProxyType as _MappingProxy

STOCK_NAMES = _MappingProxy({
    "SPY": "S&P 500 ETF",
    "NVDA": "NVIDIA",
    "AAPL": "Apple",
    "TSLA": "Tesla",
    "MSFT": "Microsoft",
    "AMZN": "Amazon",
    "GOOG": "Alphabet",
    "PLTR": "Palantir",
    "SNDK": "SanDisk",
})

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

def roll_iron_offering(equipped_ids: set[str], wanted_level: int = 1) -> list[dict]:
    """Roll 3 unique irons not already equipped, rarity-weighted, tier-gated by wanted level."""
    available = [
        i for i in IRON_DEFS
        if i["id"] not in equipped_ids
        and wanted_level >= RARITY_MIN_LEVEL.get(i["rarity"], 1)
    ]
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
    db: AsyncSession, user_id: uuid.UUID, window_id: uuid.UUID | None = None,
    wanted_level: int = 1,
) -> BountyIronOffering | None:
    """Create an iron offering for a player after window settlement."""
    equipped_result = await db.execute(
        select(BountyPlayerIron.iron_id).where(BountyPlayerIron.user_id == user_id)
    )
    equipped_ids = {row for row in equipped_result.scalars().all()}

    offerings = roll_iron_offering(equipped_ids, wanted_level=wanted_level)
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
    return await _create_new_window(db, now_et, today)


async def _create_new_window(
    db: AsyncSession, now_et: datetime, today,
) -> list[BountyWindow]:
    """Create a new bounty window aligned to WINDOW_DURATION_MINUTES boundaries."""
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
        return []

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

    stock_pool = await get_hot_stocks_pool(db)
    for symbol in stock_pool:
        db.add(BountyWindowStock(bounty_window_id=window.id, symbol=symbol))

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

async def _validate_prediction_inputs(
    db: AsyncSession, user_id: uuid.UUID, window_id: uuid.UUID,
    prediction: str, bet_amount: int, symbol: str,
) -> BountyWindow:
    """Validate window, symbol, prediction direction, and bet amount. Returns window."""
    window = await db.get(BountyWindow, window_id)
    if not window:
        raise BountyError("Bounty window not found")

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
    return window


async def _apply_ante_and_leverage(
    db: AsyncSession, user_id: uuid.UUID, window_id: uuid.UUID,
    stats: BountyPlayerStats, leverage: float,
) -> dict:
    """Deduct ante (first pick in window), validate & deduct leverage carry cost.
    Returns iron effects dict."""
    existing_preds = await db.execute(
        select(func.count(BountyPrediction.id)).where(
            BountyPrediction.user_id == user_id,
            BountyPrediction.bounty_window_id == window_id,
        )
    )
    is_first_in_window = (existing_preds.scalar() or 0) == 0

    fx = await get_player_iron_effects(db, user_id)
    if is_first_in_window:
        ante_cost = max(0, ANTE_BASE - fx["ante_reduction"])
        if stats.double_dollars < ante_cost:
            raise BountyError(f"Can't afford ante ($${ ante_cost }). You need $${ ante_cost - stats.double_dollars } more.")
        stats.double_dollars -= ante_cost
        stats.skip_count_this_window = 0
        stats.notoriety = 0.0

    max_lev = max_leverage_for_level(max(stats.wanted_level, 1))
    if leverage < 1.0 or leverage > max_lev:
        raise BountyError(f"Leverage must be between 1.0x and {max_lev}x at your wanted level")
    if stats.margin_call_cooldown > 0 and leverage > 1.0:
        raise BountyError("Margin call cooldown active — leverage locked to 1.0x")

    carry_cost = round((leverage - 1.0) * CARRY_COST_PER_X)
    if carry_cost > 0:
        if stats.double_dollars < carry_cost:
            raise BountyError(f"Can't afford leverage carry cost ($${ carry_cost })")
        stats.double_dollars -= carry_cost

    if stats.margin_call_cooldown > 0:
        stats.margin_call_cooldown -= 1

    return fx


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
    await _validate_prediction_inputs(db, user_id, window_id, prediction, bet_amount, symbol)

    confidence = bet_to_tier(bet_amount)
    stats = await get_or_create_player_stats(db, user_id)
    if stats.is_busted:
        raise BountyError("You're busted! Reset to start over.")

    action_type = "holster" if prediction == "HOLD" else "directional"
    await _apply_ante_and_leverage(db, user_id, window_id, stats, leverage)

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
    stats.last_prediction_at = datetime.now(timezone.utc)

    streak_reward = await update_streak(db, stats)

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


async def _settle_window_stocks(
    db: AsyncSession, window_id: uuid.UUID,
) -> dict[str, str]:
    """Settle per-stock rows: fetch close prices, compute results. Returns symbol→result map."""
    stock_result = await db.execute(
        select(BountyWindowStock).where(BountyWindowStock.bounty_window_id == window_id)
    )
    stock_rows = list(stock_result.scalars().all())
    stock_results: dict[str, str] = {}

    for stock_row in stock_rows:
        if stock_row.is_settled:
            if stock_row.result:
                stock_results[stock_row.symbol] = stock_row.result
            continue

        price = await get_stock_price(db, stock_row.symbol)
        if not price:
            continue

        stock_row.close_price = price
        pct_change = 0.0
        hold_threshold = HOLD_THRESHOLD_FALLBACK
        if stock_row.open_price is not None:
            open_f = float(stock_row.open_price)
            pct_change = (price - open_f) / open_f if open_f != 0 else 0
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

        stock_row.settlement_context = json.dumps({
            "pct_change": round(pct_change * 100, 4) if stock_row.open_price is not None else None,
            "hold_threshold": round(hold_threshold * 100, 4) if stock_row.open_price is not None else None,
        })
        stock_row.is_settled = True
        stock_results[stock_row.symbol] = stock_row.result

    return stock_results


def _score_single_prediction(
    pred: BountyPrediction, stock_result_value: str,
    stats: BountyPlayerStats, fx: dict,
) -> tuple[float, bool]:
    """Score one prediction using sim mechanics. Returns (notoriety_delta, ghost_triggered)."""
    is_holster = pred.action_type == "holster"
    is_correct = (stock_result_value == "HOLD") if is_holster else (pred.prediction == stock_result_value)

    ghost_triggered = False
    if not is_correct and fx["ghost_chance"] > 0 and random.random() < fx["ghost_chance"]:
        is_correct = True
        ghost_triggered = True

    insurance_triggered = False
    if not is_correct:
        chance = fx["insurance_chance"]
        if pred.confidence == 3:
            chance += fx["de_insurance_chance"]
        if chance > 0 and random.random() < chance:
            insurance_triggered = True

    pred.is_correct = is_correct
    pred.insurance_triggered = insurance_triggered

    bet = pred.bet_amount or 0
    conf = pred.confidence or bet_to_tier(bet)
    mult = wanted_multiplier(max(stats.wanted_level, 1))
    eff_lev = 1 + (pred.leverage - 1) * HOLD_LEVERAGE_FACTOR if is_holster else pred.leverage

    base = _compute_base_points(
        is_correct, insurance_triggered, is_holster, bet, conf, mult, eff_lev, fx, stats,
    )

    _check_margin_call(pred, is_correct, insurance_triggered, is_holster, fx, stats)

    pred.base_points = base
    pred.wanted_multiplier_used = mult

    payout = round(base * fx["score_multiplier"])
    if is_correct and fx["flat_cash_per_correct"] > 0:
        payout += fx["flat_cash_per_correct"]

    pred.payout = payout
    stats.double_dollars += payout
    if is_correct:
        stats.correct_predictions += 1

    update_badge_progress(stats, is_correct, conf, is_holster, ghost_triggered, False)

    notoriety_delta = _compute_notoriety_delta(bet, is_correct, fx, pred.leverage)
    return notoriety_delta, ghost_triggered


def _check_margin_call(
    pred: BountyPrediction, is_correct: bool, insurance_triggered: bool,
    is_holster: bool, fx: dict, stats: BountyPlayerStats,
) -> None:
    """Apply margin call penalty if conditions are met."""
    if is_correct or insurance_triggered or is_holster or pred.leverage <= 2.0:
        return
    mc_chance = max(0, margin_call_chance(pred.leverage) - fx["margin_call_reduction"])
    if random.random() < mc_chance:
        pred.margin_call_triggered = True
        stats.double_dollars -= MARGIN_CALL_PENALTY_DD
        stats.wanted_level = max(1, stats.wanted_level - MARGIN_CALL_WANTED_DROP)
        stats.margin_call_cooldown = MARGIN_CALL_COOLDOWN


def _compute_notoriety_delta(
    bet: int, is_correct: bool, fx: dict, leverage: float,
) -> float:
    """Compute notoriety change for a single prediction."""
    notoriety_weight = bet / 33.0 if bet > 0 else 1.0
    delta = notoriety_weight * (1 if is_correct else -1)
    if is_correct and fx["notoriety_bonus"] > 0:
        delta += fx["notoriety_bonus"]
    if is_correct and leverage >= LEVERAGE_NOTORIETY_BONUS_THRESHOLD:
        delta += LEVERAGE_NOTORIETY_BONUS
    return delta


def _compute_base_points(
    is_correct: bool, insurance_triggered: bool, is_holster: bool,
    bet: int, conf: int, mult: int, eff_lev: float, fx: dict, stats: BountyPlayerStats,
) -> int:
    """Compute base score points for a single prediction."""
    if insurance_triggered:
        return 0
    if is_correct:
        win_val = round(bet * eff_lev * mult)
        if conf == 1:
            win_val += fx["draw_win_bonus"] * mult
        if conf == 2:
            win_val += fx["qd_win_bonus"] * mult
        if is_holster:
            win_val += fx["holster_win_bonus"] * mult
        win_val += fx["per_level_win_bonus"] * stats.wanted_level * mult
        if conf == 3 and not is_holster and fx["de_win_multiplier"] > 1:
            win_val = round(win_val * fx["de_win_multiplier"])
        return win_val

    lose_val = round(bet * eff_lev)
    lose_val = max(0, lose_val - fx["all_lose_reduction"])
    if fx["leverage_loss_shield"] > 0:
        lose_val = round(lose_val * (1 - fx["leverage_loss_shield"]))
    if fx["snake_oil"] and is_holster and conf == 1:
        lose_val = 0
    return -lose_val


async def _evaluate_user_window(
    db: AsyncSession, user_id: uuid.UUID, window_id: uuid.UUID,
    stats: BountyPlayerStats, fx: dict, window_notoriety: float,
) -> None:
    """Post-window evaluation: notoriety→level, peaks, badges, titles, bust check."""
    old_level = stats.wanted_level
    if window_notoriety >= NOTORIETY_UP_THRESHOLD:
        stats.wanted_level = max(1, stats.wanted_level + 1)
    elif window_notoriety <= NOTORIETY_DOWN_THRESHOLD:
        stats.wanted_level = max(1, stats.wanted_level - 1)

    stats.best_streak = max(stats.best_streak, stats.wanted_level)
    stats.chambers = max(stats.chambers, chambers_for_level(stats.wanted_level))
    stats.notoriety = window_notoriety

    stats.rounds_played += 1
    stats.peak_dd = max(stats.peak_dd, stats.double_dollars)
    stats.peak_wanted_level = max(stats.peak_wanted_level, stats.wanted_level)

    await check_badges(db, stats)
    await check_titles(db, stats)

    if stats.wanted_level > old_level:
        await _emit_activity(db, user_id, "level_up", {
            "new_level": stats.wanted_level,
            "multiplier": wanted_multiplier(stats.wanted_level),
        })

    if stats.double_dollars <= 0:
        revived = False
        if not stats.saloon_used and fx.get("saloon_door"):
            stats.saloon_used = True
            stats.double_dollars = 500
            revived = True
        elif not stats.phoenix_used and fx.get("phoenix_feather"):
            stats.phoenix_used = True
            stats.double_dollars = 1000
            revived = True

        if not revived:
            await _bust_player(db, stats)
        else:
            await create_iron_offering(db, user_id, window_id, wanted_level=stats.wanted_level)
    else:
        await create_iron_offering(db, user_id, window_id, wanted_level=stats.wanted_level)


async def settle_window(db: AsyncSession, window_id: uuid.UUID) -> None:
    """Settle a bounty window: fetch closing prices, determine results, score with sim mechanics."""
    window = await db.get(BountyWindow, window_id)
    if not window or window.is_settled:
        return

    stock_results = await _settle_window_stocks(db, window_id)

    # Set legacy SPY fields on window
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

    # Score all predictions grouped by user
    pred_result = await db.execute(
        select(BountyPrediction).where(BountyPrediction.bounty_window_id == window_id)
    )
    predictions = list(pred_result.scalars().all())

    user_predictions: dict[uuid.UUID, list[BountyPrediction]] = {}
    for pred in predictions:
        user_predictions.setdefault(pred.user_id, []).append(pred)

    for uid, user_preds in user_predictions.items():
        stats = await get_or_create_player_stats(db, uid)
        fx = await get_player_iron_effects(db, uid)

        window_notoriety = 0.0
        for pred in user_preds:
            stock_result_value = stock_results.get(pred.symbol, window.result)
            delta, _ = _score_single_prediction(pred, stock_result_value, stats, fx)
            window_notoriety += delta

        await _evaluate_user_window(db, uid, window_id, stats, fx, window_notoriety)

    await db.commit()


async def _bust_player(db: AsyncSession, stats: BountyPlayerStats) -> None:
    """Mark player as busted, archive run, clear irons."""
    # Archive the run before resetting
    await archive_run(db, stats, end_reason="bust")

    stats.is_busted = True
    stats.bust_count += 1
    stats.double_dollars = 0

    # Emit bust activity event
    await _emit_activity(db, stats.user_id, "bust", {
        "bust_count": stats.bust_count,
        "peak_dd": stats.peak_dd, "peak_level": stats.peak_wanted_level,
    })

    # Reset run-specific tracking
    _reset_run_tracking(stats)
    reset_run_badge_progress(stats)

    # Clear equipped irons
    result = await db.execute(
        select(BountyPlayerIron).where(BountyPlayerIron.user_id == stats.user_id)
    )
    for iron in result.scalars().all():
        await db.delete(iron)


async def reset_player(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """Reset a player to start fresh (works whether busted or not)."""
    stats = await get_or_create_player_stats(db, user_id)

    # Archive the current run if not already busted (bust already archives)
    if not stats.is_busted and stats.rounds_played > 0:
        await archive_run(db, stats, end_reason="reset")

    stats.double_dollars = STARTING_DOUBLE_DOLLARS
    stats.wanted_level = 1
    stats.is_busted = False
    stats.notoriety = 0.0
    stats.skip_count_this_window = 0
    stats.margin_call_cooldown = 0
    stats.saloon_used = False
    stats.phoenix_used = False
    _reset_run_tracking(stats)
    reset_run_badge_progress(stats)
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
    title_name = TITLE_DEFS_BY_ID.get(stats.active_title or "drifter", {}).get("name", "Drifter")
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
        # P1 additions
        "peak_dd": stats.peak_dd,
        "peak_wanted_level": stats.peak_wanted_level,
        "best_run_score": stats.best_run_score,
        "current_streak": stats.current_streak,
        "longest_streak": stats.longest_streak,
        "streak_shield": stats.streak_shield,
        "active_title": title_name,
        "lifetime_dd_earned": stats.lifetime_dd_earned,
        "runs_completed": stats.runs_completed,
    }


async def _fetch_spy_candles(db: AsyncSession) -> list[dict]:
    """Fetch SPY candles from Yahoo, falling back to self-logged prices."""
    candles = await fetch_chart_cached("SPY")
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

    quote = await fetch_quote("SPY")
    if quote:
        db.add(SpyPriceLog(price=quote["c"]))
        await db.commit()
    return candles


async def _build_stocks_status(
    db: AsyncSession, user_id: uuid.UUID, window: BountyWindow,
) -> list[dict]:
    """Build per-stock status list with charts and user picks for the window."""
    stock_result = await db.execute(
        select(BountyWindowStock).where(BountyWindowStock.bounty_window_id == window.id)
    )
    stock_rows = list(stock_result.scalars().all())

    pred_result = await db.execute(
        select(BountyPrediction).where(
            BountyPrediction.user_id == user_id,
            BountyPrediction.bounty_window_id == window.id,
        )
    )
    user_preds = {p.symbol: p for p in pred_result.scalars().all()}

    chart_tasks = [fetch_chart_cached(sr.symbol) for sr in stock_rows]
    all_candles = await asyncio.gather(*chart_tasks)

    stocks_status = []
    for stock_row, stock_candles in zip(stock_rows, all_candles):
        stock_pick = user_preds.get(stock_row.symbol)
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
    return stocks_status


async def get_bounty_status(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """Assemble the main polling response."""
    await get_or_create_today_windows(db)
    current = await get_current_window(db)

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

    pending = await get_pending_offering(db, user_id)
    candles = await _fetch_spy_candles(db) if current else []
    stocks_status = await _build_stocks_status(db, user_id, current) if current else []

    ante_cost = max(0, ANTE_BASE - fx["ante_reduction"])
    raw_skip = calc_skip_cost(stats.skip_count_this_window + 1, stats.double_dollars)
    next_skip_cost = max(1, round(raw_skip * (1 - fx["skip_discount"])))
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
        return await _weekly_board(db)
    return await _alltime_board(db)


async def _weekly_board(db: AsyncSession) -> list[dict]:
    """Build weekly leaderboard from this week's prediction payouts."""
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
    board = []
    for i, row in enumerate(result.all(), start=1):
        total = row.total or 0
        correct = row.correct or 0
        board.append({
            "rank": i, "alias": row.alias,
            "double_dollars": int(row.weekly_dollars),
            "accuracy_pct": round(correct / total * 100, 1) if total > 0 else 0.0,
            "wanted_level": 0, "total_predictions": total,
        })
    return board


async def _alltime_board(db: AsyncSession) -> list[dict]:
    """Build all-time leaderboard from bounty_player_stats."""
    result = await db.execute(
        select(User.alias, BountyPlayerStats)
        .join(BountyPlayerStats, User.id == BountyPlayerStats.user_id)
        .where(BountyPlayerStats.total_predictions > 0)
        .order_by(BountyPlayerStats.best_run_score.desc())
    )
    board = []
    for i, row in enumerate(result.all(), start=1):
        stats = row[1]
        title_name = TITLE_DEFS_BY_ID.get(stats.active_title or "drifter", {}).get("name", "Drifter")
        board.append({
            "rank": i, "alias": row.alias,
            "double_dollars": stats.double_dollars,
            "accuracy_pct": round(
                stats.correct_predictions / stats.total_predictions * 100, 1
            ) if stats.total_predictions > 0 else 0.0,
            "wanted_level": stats.wanted_level,
            "total_predictions": stats.total_predictions,
            "best_run_score": stats.best_run_score,
            "title": title_name,
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


async def _get_confidence_stats(db: AsyncSession, user_id: uuid.UUID) -> list[dict]:
    """Accuracy breakdown by confidence tier (Draw/QD/DE)."""
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
    stats_list = []
    for row in conf_result.all():
        total = row.total or 0
        correct = row.correct or 0
        stats_list.append({
            "confidence": row.confidence,
            "label": CONFIDENCE_LABELS[row.confidence],
            "total": total, "correct": correct,
            "win_rate": round(correct / total * 100, 1) if total > 0 else 0.0,
        })
    existing = {c["confidence"] for c in stats_list}
    for conf in (1, 2, 3):
        if conf not in existing:
            stats_list.append({
                "confidence": conf, "label": CONFIDENCE_LABELS[conf],
                "total": 0, "correct": 0, "win_rate": 0.0,
            })
    stats_list.sort(key=lambda c: c["confidence"])
    return stats_list


async def _get_time_slot_stats(db: AsyncSession, user_id: uuid.UUID) -> list[dict]:
    """Accuracy breakdown by 2-hour ET time slot."""
    et_hour_col = func.extract(
        "hour", func.timezone("America/New_York", BountyWindow.start_time)
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
    hour_data = {int(row.et_hour): (row.total or 0, row.correct or 0) for row in slot_result.all()}

    slots = ((9, "9 AM"), (11, "11 AM"), (13, "1 PM"), (15, "3 PM"), (17, "5 PM"), (19, "7 PM"))
    result = []
    for i, (slot_hour, label) in enumerate(slots, start=1):
        t1, c1 = hour_data.get(slot_hour, (0, 0))
        t2, c2 = hour_data.get(slot_hour + 1, (0, 0))
        total, correct = t1 + t2, c1 + c2
        result.append({
            "window_index": i, "time_label": label,
            "total": total, "correct": correct,
            "win_rate": round(correct / total * 100, 1) if total > 0 else 0.0,
        })
    return result


async def _get_ticker_stats(db: AsyncSession, user_id: uuid.UUID) -> list[dict]:
    """Accuracy breakdown by stock ticker."""
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
    result = []
    for row in ticker_result.all():
        total = row.total or 0
        correct = row.correct or 0
        result.append({
            "symbol": row.symbol, "total": total, "correct": correct,
            "win_rate": round(correct / total * 100, 1) if total > 0 else 0.0,
        })
    result.sort(key=lambda t: t["symbol"])
    return result


async def _get_weekly_trend(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """This week vs last week payout comparison."""
    now_et = datetime.now(ET)
    this_week_start = now_et.date() - timedelta(days=now_et.weekday())
    last_week_start = this_week_start - timedelta(days=7)
    this_week_dt = datetime.combine(this_week_start, time(0, 0), tzinfo=ET)
    last_week_dt = datetime.combine(last_week_start, time(0, 0), tzinfo=ET)

    tw_result = await db.execute(
        select(func.coalesce(func.sum(BountyPrediction.payout), 0))
        .where(BountyPrediction.user_id == user_id, BountyPrediction.created_at >= this_week_dt)
    )
    this_week = int(tw_result.scalar() or 0)

    lw_result = await db.execute(
        select(func.coalesce(func.sum(BountyPrediction.payout), 0))
        .where(
            BountyPrediction.user_id == user_id,
            BountyPrediction.created_at >= last_week_dt,
            BountyPrediction.created_at < this_week_dt,
        )
    )
    last_week = int(lw_result.scalar() or 0)
    return {"this_week": this_week, "last_week": last_week, "change": this_week - last_week}


async def get_detailed_stats(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """Build detailed analytics for a player."""
    stats = await get_or_create_player_stats(db, user_id)

    confidence_stats = await _get_confidence_stats(db, user_id)
    time_slot_stats = await _get_time_slot_stats(db, user_id)
    ticker_stats = await _get_ticker_stats(db, user_id)
    weekly_trend = await _get_weekly_trend(db, user_id)

    rank_result = await db.execute(
        select(func.count(BountyPlayerStats.id))
        .where(BountyPlayerStats.double_dollars > stats.double_dollars)
    )
    rank = (rank_result.scalar() or 0) + 1 if stats.total_predictions > 0 else None
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
        "weekly_trend": weekly_trend,
        "board_rank": rank,
        "wanted_level_progress": {
            "current_level": stats.wanted_level,
            "max_level": WANTED_LEVEL_CAP,
            "progress_pct": round(stats.wanted_level / WANTED_LEVEL_CAP * 100, 1),
        },
    }


# ══════════════════════════════════════════════════════════════════════════════
# P1-A: Run Score & Run History
# ══════════════════════════════════════════════════════════════════════════════

async def archive_run(
    db: AsyncSession, stats: BountyPlayerStats, end_reason: str = "bust"
) -> BountyRunHistory:
    """Archive the current run to history and compute run score."""
    accuracy = (
        stats.correct_predictions / stats.total_predictions
        if stats.total_predictions > 0 else 0.0
    )
    run_score = compute_run_score(
        peak_dd=stats.peak_dd,
        peak_level=stats.peak_wanted_level,
        accuracy=accuracy,
        rounds=stats.rounds_played,
    )

    run = BountyRunHistory(
        user_id=stats.user_id,
        peak_dd=stats.peak_dd,
        peak_wanted_level=stats.peak_wanted_level,
        total_predictions=stats.total_predictions,
        correct_predictions=stats.correct_predictions,
        accuracy=round(accuracy, 4),
        rounds_played=stats.rounds_played,
        run_score=run_score,
        end_reason=end_reason,
    )
    db.add(run)

    # Update best run score (lifetime high water mark)
    if run_score > stats.best_run_score:
        stats.best_run_score = run_score

    # Update lifetime stats
    stats.lifetime_dd_earned += stats.peak_dd
    stats.runs_completed += 1

    # Emit activity event for notable runs
    if run_score > 0:
        await _emit_activity(db, stats.user_id, "run_complete", {
            "run_score": run_score, "peak_dd": stats.peak_dd,
            "peak_level": stats.peak_wanted_level, "end_reason": end_reason,
        })

    return run


def _reset_run_tracking(stats: BountyPlayerStats) -> None:
    """Reset per-run tracking columns (called on bust/reset)."""
    stats.peak_dd = STARTING_DOUBLE_DOLLARS
    stats.peak_wanted_level = 1
    stats.rounds_played = 0


async def get_run_history(
    db: AsyncSession, user_id: uuid.UUID, limit: int = 20
) -> list[dict]:
    """Get a player's run history, newest first."""
    result = await db.execute(
        select(BountyRunHistory)
        .where(BountyRunHistory.user_id == user_id)
        .order_by(BountyRunHistory.ended_at.desc())
        .limit(limit)
    )
    return [
        {
            "id": str(r.id),
            "peak_dd": r.peak_dd,
            "peak_wanted_level": r.peak_wanted_level,
            "accuracy": round(r.accuracy * 100, 1),
            "rounds_played": r.rounds_played,
            "run_score": r.run_score,
            "end_reason": r.end_reason,
            "ended_at": r.ended_at.isoformat(),
        }
        for r in result.scalars().all()
    ]


# ══════════════════════════════════════════════════════════════════════════════
# P1-B: Badges
# ══════════════════════════════════════════════════════════════════════════════

def _badge_requirement_met(
    req: dict, stats: BountyPlayerStats, progress: dict,
) -> bool:
    """Check if a single badge requirement is met."""
    rtype = req["type"]
    if rtype == "wanted_level":
        return stats.wanted_level >= req["value"]
    if rtype == "peak_dd":
        return stats.peak_dd >= req["value"]
    if rtype == "chambers_full":
        return stats.chambers >= req["value"]
    if rtype == "daily_streak":
        return stats.current_streak >= req["value"]
    if rtype == "comeback":
        return progress.get("hit_low", False) and stats.double_dollars >= req["high"]
    # Progress-counter types
    progress_keys = {
        "correct_streak": "current_correct_streak",
        "qd_streak": "current_qd_streak",
        "de_streak": "current_de_streak",
        "no_skip_rounds": "no_skip_rounds",
        "hold_wins_run": "hold_wins_run",
        "ghost_triggers_run": "ghost_triggers_run",
    }
    key = progress_keys.get(rtype)
    if key is not None:
        return progress.get(key, 0) >= req["value"]
    return False


async def check_badges(
    db: AsyncSession, stats: BountyPlayerStats, settlement_context: dict | None = None
) -> list[str]:
    """Check all badge conditions and award any newly earned badges."""
    result = await db.execute(
        select(BountyBadge.badge_id).where(BountyBadge.user_id == stats.user_id)
    )
    earned_ids = set(result.scalars().all())
    newly_earned = []
    progress = json.loads(stats.badge_progress) if stats.badge_progress else {}

    for badge_def in BADGE_DEFS:
        bid = badge_def["id"]
        if bid in earned_ids:
            continue
        if not _badge_requirement_met(badge_def["requirement"], stats, progress):
            continue

        badge = BountyBadge(
            user_id=stats.user_id, badge_id=bid,
            run_context=json.dumps({
                "dd": stats.double_dollars, "level": stats.wanted_level,
                "peak_dd": stats.peak_dd,
            }),
        )
        db.add(badge)
        newly_earned.append(bid)
        await _emit_activity(db, stats.user_id, "badge_earned", {
            "badge_id": bid, "badge_name": badge_def["name"],
        })

    stats.badge_progress = json.dumps(progress)
    return newly_earned


def update_badge_progress(
    stats: BountyPlayerStats, pred_is_correct: bool, confidence: int,
    is_holster: bool, ghost_triggered: bool, was_skip: bool
) -> None:
    """Update badge progress counters after a prediction/settlement."""
    progress = json.loads(stats.badge_progress) if stats.badge_progress else {}

    # Correct streak
    if pred_is_correct:
        progress["current_correct_streak"] = progress.get("current_correct_streak", 0) + 1
    else:
        progress["current_correct_streak"] = 0

    # QD streak
    if pred_is_correct and confidence == 2:
        progress["current_qd_streak"] = progress.get("current_qd_streak", 0) + 1
    elif confidence == 2:
        progress["current_qd_streak"] = 0

    # DE streak
    if pred_is_correct and confidence == 3:
        progress["current_de_streak"] = progress.get("current_de_streak", 0) + 1
    elif confidence == 3:
        progress["current_de_streak"] = 0

    # Hold wins this run
    if pred_is_correct and is_holster:
        progress["hold_wins_run"] = progress.get("hold_wins_run", 0) + 1

    # Ghost triggers this run
    if ghost_triggered:
        progress["ghost_triggers_run"] = progress.get("ghost_triggers_run", 0) + 1

    # Comeback tracking
    if stats.double_dollars < 500:
        progress["hit_low"] = True

    stats.badge_progress = json.dumps(progress)


def reset_run_badge_progress(stats: BountyPlayerStats) -> None:
    """Reset per-run badge progress counters (called on bust/reset)."""
    progress = json.loads(stats.badge_progress) if stats.badge_progress else {}
    progress["hold_wins_run"] = 0
    progress["ghost_triggers_run"] = 0
    progress["hit_low"] = False
    progress["no_skip_rounds"] = 0
    # Keep streak counters — they span predictions, not runs
    stats.badge_progress = json.dumps(progress)


async def get_player_badges(db: AsyncSession, user_id: uuid.UUID) -> list[dict]:
    """Get all badges with earned status."""
    result = await db.execute(
        select(BountyBadge).where(BountyBadge.user_id == user_id)
    )
    earned_map = {b.badge_id: b for b in result.scalars().all()}

    badges = []
    for badge_def in BADGE_DEFS:
        earned = earned_map.get(badge_def["id"])
        badges.append({
            "id": badge_def["id"],
            "name": badge_def["name"],
            "category": badge_def["category"],
            "description": badge_def["description"],
            "earned": earned is not None,
            "earned_at": earned.earned_at.isoformat() if earned else None,
        })
    return badges


async def get_badge_progress(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """Get badge progress for a player."""
    stats = await get_or_create_player_stats(db, user_id)
    progress = json.loads(stats.badge_progress) if stats.badge_progress else {}

    # Count earned badges
    result = await db.execute(
        select(func.count()).select_from(BountyBadge).where(BountyBadge.user_id == user_id)
    )
    earned_count = result.scalar() or 0

    return {
        "earned_count": earned_count,
        "total_count": len(BADGE_DEFS),
        "progress": progress,
    }


# ══════════════════════════════════════════════════════════════════════════════
# P1-C: Titles
# ══════════════════════════════════════════════════════════════════════════════

def _check_title_requirements(
    reqs: dict, stats: BountyPlayerStats,
    runs: list, earned_badges: set, unlocked_ids: set,
) -> bool:
    """Evaluate whether all title requirements are met."""
    if "runs_at_level_5" in reqs:
        if sum(1 for r in runs if r.peak_wanted_level >= 5) < reqs["runs_at_level_5"]:
            return False
    if "runs_at_level_8" in reqs:
        if sum(1 for r in runs if r.peak_wanted_level >= 8) < reqs["runs_at_level_8"]:
            return False
    if "accuracy_over_runs" in reqs:
        aor = reqs["accuracy_over_runs"]
        if len(runs) < aor["min_runs"]:
            return False
        avg_acc = sum(r.accuracy for r in runs[-aor["min_runs"]:]) / aor["min_runs"]
        if avg_acc < aor["min_accuracy"]:
            return False
    if "badge" in reqs and reqs["badge"] not in earned_badges:
        return False
    if "lifetime_dd" in reqs and stats.lifetime_dd_earned < reqs["lifetime_dd"]:
        return False
    if "badge_count" in reqs and len(earned_badges) < reqs["badge_count"]:
        return False
    if "best_run_score" in reqs and stats.best_run_score < reqs["best_run_score"]:
        return False
    if "title" in reqs and reqs["title"] not in unlocked_ids:
        return False
    return True


async def check_titles(db: AsyncSession, stats: BountyPlayerStats) -> list[str]:
    """Check and unlock any newly qualified titles. Returns list of newly unlocked title IDs."""
    result = await db.execute(
        select(BountyTitle.title_id).where(BountyTitle.user_id == stats.user_id)
    )
    unlocked_ids = set(result.scalars().all())

    badge_result = await db.execute(
        select(BountyBadge.badge_id).where(BountyBadge.user_id == stats.user_id)
    )
    earned_badges = set(badge_result.scalars().all())

    run_result = await db.execute(
        select(BountyRunHistory).where(BountyRunHistory.user_id == stats.user_id)
    )
    runs = list(run_result.scalars().all())

    newly_unlocked = []
    for title_def in TITLE_DEFS:
        tid = title_def["id"]
        if tid == "drifter" or tid in unlocked_ids:
            continue

        if _check_title_requirements(title_def["requirements"], stats, runs, earned_badges, unlocked_ids):
            title = BountyTitle(user_id=stats.user_id, title_id=tid)
            db.add(title)
            unlocked_ids.add(tid)
            newly_unlocked.append(tid)
            await _emit_activity(db, stats.user_id, "title_unlocked", {
                "title_id": tid, "title_name": title_def["name"],
            })

    return newly_unlocked


async def get_player_titles(db: AsyncSession, user_id: uuid.UUID) -> list[dict]:
    """Get all titles with unlocked status."""
    result = await db.execute(
        select(BountyTitle).where(BountyTitle.user_id == user_id)
    )
    unlocked_map = {t.title_id: t for t in result.scalars().all()}

    titles = []
    for title_def in TITLE_DEFS:
        unlocked = unlocked_map.get(title_def["id"])
        titles.append({
            "id": title_def["id"],
            "name": title_def["name"],
            "order": title_def["order"],
            "description": title_def["description"],
            "unlocked": title_def["id"] == "drifter" or unlocked is not None,
            "unlocked_at": unlocked.unlocked_at.isoformat() if unlocked else None,
        })
    return titles


async def equip_title(db: AsyncSession, user_id: uuid.UUID, title_id: str) -> dict:
    """Equip a title (must be unlocked or 'drifter')."""
    if title_id != "drifter":
        result = await db.execute(
            select(BountyTitle).where(
                BountyTitle.user_id == user_id,
                BountyTitle.title_id == title_id,
            )
        )
        if not result.scalars().first():
            raise BountyError("Title not unlocked")

    if title_id not in TITLE_DEFS_BY_ID:
        raise BountyError("Unknown title")

    stats = await get_or_create_player_stats(db, user_id)
    stats.active_title = title_id
    await db.commit()

    return {"title_id": title_id, "title_name": TITLE_DEFS_BY_ID[title_id]["name"]}


# ══════════════════════════════════════════════════════════════════════════════
# P1-D: Daily Streak
# ══════════════════════════════════════════════════════════════════════════════

async def update_streak(db: AsyncSession, stats: BountyPlayerStats) -> dict | None:
    """Update daily streak on prediction. Returns streak reward if milestone hit."""
    today_et = datetime.now(ET).date()

    if stats.last_streak_date == today_et:
        return None  # Already counted today

    if stats.last_streak_date is not None:
        days_since = (today_et - stats.last_streak_date).days
        if days_since == 1:
            # Consecutive day
            stats.current_streak += 1
        elif days_since == 2 and stats.streak_shield:
            # Shield forgives one missed day
            stats.streak_shield = False
            stats.current_streak += 1
        else:
            # Streak broken
            stats.current_streak = 1
    else:
        stats.current_streak = 1

    stats.last_streak_date = today_et
    stats.longest_streak = max(stats.longest_streak, stats.current_streak)

    # Award shield at threshold
    if stats.current_streak >= STREAK_SHIELD_THRESHOLD and not stats.streak_shield:
        stats.streak_shield = True

    # Check for milestone reward
    reward = STREAK_REWARDS.get(stats.current_streak)
    if reward:
        reward_result = {"streak": stats.current_streak, "reward": reward}
        # Apply DD bonus immediately
        if reward.get("type") == "dd_bonus":
            stats.double_dollars += reward["amount"]
        return reward_result

    return None


async def get_streak_info(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """Get current streak information."""
    stats = await get_or_create_player_stats(db, user_id)
    today_et = datetime.now(ET).date()

    # Check if streak is at risk (no prediction today, had one yesterday)
    at_risk = False
    if stats.last_streak_date and stats.current_streak > 0:
        days_since = (today_et - stats.last_streak_date).days
        if days_since == 1:
            at_risk = True  # Haven't predicted today yet

    return {
        "current_streak": stats.current_streak,
        "longest_streak": stats.longest_streak,
        "last_streak_date": stats.last_streak_date.isoformat() if stats.last_streak_date else None,
        "streak_shield": stats.streak_shield,
        "at_risk": at_risk,
        "next_milestone": _next_streak_milestone(stats.current_streak),
    }


def _next_streak_milestone(current: int) -> dict | None:
    """Find the next streak milestone."""
    for day, reward in sorted(STREAK_REWARDS.items()):
        if day > current:
            return {"day": day, "reward": reward}
    return None


# ══════════════════════════════════════════════════════════════════════════════
# P2-A: Iron Synergy Combos
# ══════════════════════════════════════════════════════════════════════════════

async def get_active_combos(db: AsyncSession, user_id: uuid.UUID) -> list[dict]:
    """Check which iron synergy combos are currently active."""
    result = await db.execute(
        select(BountyPlayerIron.iron_id).where(BountyPlayerIron.user_id == user_id)
    )
    equipped_ids = set(result.scalars().all())

    active = []
    for combo in IRON_COMBOS:
        if all(iron_id in equipped_ids for iron_id in combo["irons"]):
            active.append({
                "id": combo["id"],
                "name": combo["name"],
                "description": combo["description"],
                "irons": combo["irons"],
            })
    return active


def get_combo_effects(equipped_ids: set[str]) -> dict:
    """Get aggregated bonus effects from all active combos."""
    effects = {}
    for combo in IRON_COMBOS:
        if all(iron_id in equipped_ids for iron_id in combo["irons"]):
            for key, val in combo["bonus_effects"].items():
                if isinstance(val, bool):
                    effects[key] = True
                elif isinstance(val, (int, float)):
                    effects[key] = effects.get(key, 0) + val
    return effects


# ══════════════════════════════════════════════════════════════════════════════
# P3-A: Share Cards
# ══════════════════════════════════════════════════════════════════════════════

async def get_share_card_data(
    db: AsyncSession, user_id: uuid.UUID, event_type: str
) -> dict:
    """Generate share card data for a notable event."""
    stats = await get_or_create_player_stats(db, user_id)

    # Get user alias
    user = await db.get(User, user_id)
    alias = user.alias if user else "Unknown"
    title_name = TITLE_DEFS_BY_ID.get(stats.active_title or "drifter", {}).get("name", "Drifter")

    base = {
        "alias": alias,
        "title": title_name,
        "wanted_level": stats.wanted_level,
        "double_dollars": stats.double_dollars,
        "accuracy_pct": round(
            stats.correct_predictions / stats.total_predictions * 100, 1
        ) if stats.total_predictions > 0 else 0.0,
        "event_type": event_type,
    }

    if event_type == "level_up":
        base["multiplier"] = wanted_multiplier(stats.wanted_level)
    elif event_type == "high_score":
        base["best_run_score"] = stats.best_run_score
    elif event_type == "bust":
        base["bust_count"] = stats.bust_count
        base["peak_dd"] = stats.peak_dd

    return base


# ══════════════════════════════════════════════════════════════════════════════
# P3-B: Activity Feed
# ══════════════════════════════════════════════════════════════════════════════

async def _emit_activity(
    db: AsyncSession, user_id: uuid.UUID, event_type: str, data: dict
) -> None:
    """Create an activity event."""
    event = BountyActivityEvent(
        user_id=user_id,
        event_type=event_type,
        event_data=json.dumps(data),
    )
    db.add(event)


async def get_activity_feed(db: AsyncSession, limit: int = 50) -> list[dict]:
    """Get recent community activity events."""
    result = await db.execute(
        select(BountyActivityEvent, User.alias)
        .join(User, BountyActivityEvent.user_id == User.id)
        .order_by(BountyActivityEvent.created_at.desc())
        .limit(limit)
    )
    events = []
    for event, alias in result.all():
        event_data = json.loads(event.event_data) if event.event_data else {}
        events.append({
            "id": str(event.id),
            "alias": alias,
            "event_type": event.event_type,
            "event_data": event_data,
            "created_at": event.created_at.isoformat(),
        })
    return events


# ══════════════════════════════════════════════════════════════════════════════
# P2-B: Weekly Stock Events
# ══════════════════════════════════════════════════════════════════════════════

def detect_stock_event() -> tuple[str | None, str | None]:
    """Detect if today has a special stock event. Returns (event_type, event_name) or (None, None)."""
    now_et = datetime.now(ET)
    weekday = now_et.weekday()  # 0=Monday, 4=Friday

    # Mag 7 Friday
    if weekday == 4:
        return "mag7_friday", "Mag 7 Friday"

    # Sector Spotlight: rotate weekly (use ISO week number)
    week_num = now_et.isocalendar()[1]
    sector_idx = week_num % len(SECTOR_SPOTLIGHT_ROTATION)
    sector = SECTOR_SPOTLIGHT_ROTATION[sector_idx]

    # Mid-week spotlight (Wednesday)
    if weekday == 2:
        return "sector_spotlight", f"Sector Spotlight: {sector['name']}"

    # Default: no event
    return None, None


# ══════════════════════════════════════════════════════════════════════════════
# P2-C: Post-Settlement Analysis
# ══════════════════════════════════════════════════════════════════════════════

async def _get_window_stock_analysis(db: AsyncSession, window_id: uuid.UUID) -> list[dict]:
    """Build per-stock result dicts for settlement analysis."""
    stock_result = await db.execute(
        select(BountyWindowStock).where(BountyWindowStock.bounty_window_id == window_id)
    )
    stocks = []
    for sr in stock_result.scalars().all():
        pct_change = None
        if sr.open_price and sr.close_price:
            pct_change = round(
                (float(sr.close_price) - float(sr.open_price)) / float(sr.open_price) * 100, 3
            )
        context = json.loads(sr.settlement_context) if sr.settlement_context else {}
        stocks.append({
            "symbol": sr.symbol,
            "open_price": float(sr.open_price) if sr.open_price else None,
            "close_price": float(sr.close_price) if sr.close_price else None,
            "pct_change": pct_change, "result": sr.result, "context": context,
        })
    return stocks


async def _get_prediction_aggregates(db: AsyncSession, window_id: uuid.UUID) -> dict:
    """Aggregate prediction counts per symbol per direction for a window."""
    agg_result = await db.execute(
        select(BountyPrediction.symbol, BountyPrediction.prediction, func.count().label("cnt"))
        .where(BountyPrediction.bounty_window_id == window_id)
        .group_by(BountyPrediction.symbol, BountyPrediction.prediction)
    )
    aggs: dict[str, dict] = {}
    for row in agg_result.all():
        aggs.setdefault(row.symbol, {})[row.prediction] = row.cnt
    return aggs


async def get_settlement_analysis(
    db: AsyncSession, window_id: uuid.UUID, user_id: uuid.UUID
) -> dict:
    """Get post-settlement analysis for a window."""
    window = await db.get(BountyWindow, window_id)
    if not window or not window.is_settled:
        return {"settled": False}

    stocks = await _get_window_stock_analysis(db, window_id)
    prediction_aggs = await _get_prediction_aggregates(db, window_id)

    user_pred_result = await db.execute(
        select(BountyPrediction).where(
            BountyPrediction.bounty_window_id == window_id,
            BountyPrediction.user_id == user_id,
        )
    )
    user_predictions = [
        {
            "symbol": p.symbol, "prediction": p.prediction,
            "confidence": p.confidence, "is_correct": p.is_correct,
            "payout": p.payout, "leverage": p.leverage,
        }
        for p in user_pred_result.scalars().all()
    ]

    return {
        "settled": True, "window_id": str(window_id),
        "stocks": stocks, "prediction_aggregates": prediction_aggs,
        "my_predictions": user_predictions,
    }


# ══════════════════════════════════════════════════════════════════════════════
# P2-D: Performance Analytics Dashboard
# ══════════════════════════════════════════════════════════════════════════════

def _win_rate_stat(preds: list) -> dict:
    """Compute total/correct/win_rate for a list of predictions."""
    total = len(preds)
    correct = sum(1 for p in preds if p.is_correct)
    return {
        "total": total, "correct": correct,
        "win_rate": round(correct / total * 100, 1) if total > 0 else 0.0,
    }


def _analytics_leverage_stats(all_preds: list) -> dict:
    """Accuracy with leverage vs without."""
    return {
        "with_leverage": _win_rate_stat([p for p in all_preds if p.leverage > 1.0]),
        "without_leverage": _win_rate_stat([p for p in all_preds if p.leverage <= 1.0]),
    }


def _analytics_time_stats(all_preds: list) -> list[dict]:
    """Accuracy by 2-hour ET time bucket."""
    buckets: dict[str, dict] = {}
    for p in all_preds:
        et_time = p.created_at.astimezone(ET) if p.created_at else None
        if not et_time:
            continue
        hour = (et_time.hour // 2) * 2
        label = f"{hour}:00-{hour + 2}:00 ET"
        if label not in buckets:
            buckets[label] = {"total": 0, "correct": 0}
        buckets[label]["total"] += 1
        if p.is_correct:
            buckets[label]["correct"] += 1

    return [
        {"time_slot": label, **data,
         "win_rate": round(data["correct"] / data["total"] * 100, 1) if data["total"] > 0 else 0.0}
        for label, data in sorted(buckets.items())
    ]


def _analytics_rolling_trend(all_preds: list, cutoff: datetime) -> list[dict]:
    """Rolling 7-day daily accuracy trend."""
    daily: dict[str, dict] = {}
    for p in all_preds:
        if not p.created_at or p.created_at < cutoff:
            continue
        day = p.created_at.astimezone(ET).date().isoformat()
        if day not in daily:
            daily[day] = {"total": 0, "correct": 0}
        daily[day]["total"] += 1
        if p.is_correct:
            daily[day]["correct"] += 1

    return [
        {"date": day, **data,
         "win_rate": round(data["correct"] / data["total"] * 100, 1) if data["total"] > 0 else 0.0}
        for day, data in sorted(daily.items())
    ]


async def get_performance_analytics(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """Extended analytics: accuracy by confidence, leverage, time, action type, rolling trends."""
    all_preds_result = await db.execute(
        select(BountyPrediction)
        .where(BountyPrediction.user_id == user_id)
        .order_by(BountyPrediction.created_at.desc())
    )
    all_preds = list(all_preds_result.scalars().all())

    conf_stats = {conf: _win_rate_stat([p for p in all_preds if p.confidence == conf]) for conf in (1, 2, 3)}
    action_stats = {
        "directional": _win_rate_stat([p for p in all_preds if p.action_type == "directional"]),
        "holster": _win_rate_stat([p for p in all_preds if p.action_type == "holster"]),
    }

    overall_total = len(all_preds)
    overall_correct = sum(1 for p in all_preds if p.is_correct)
    overall_accuracy = overall_correct / overall_total if overall_total > 0 else 0.5

    return {
        "confidence_stats": conf_stats,
        "leverage_stats": _analytics_leverage_stats(all_preds),
        "time_stats": _analytics_time_stats(all_preds),
        "action_stats": action_stats,
        "rolling_trend": _analytics_rolling_trend(all_preds, datetime.now(timezone.utc) - timedelta(days=7)),
        "alpha_vs_random": round((overall_accuracy - 0.5) * 100, 2),
        "total_predictions": overall_total,
        "overall_accuracy": round(overall_accuracy * 100, 1),
    }
