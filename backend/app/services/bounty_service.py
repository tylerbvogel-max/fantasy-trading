import uuid
import httpx
from datetime import datetime, date, time, timedelta, timezone
from zoneinfo import ZoneInfo
from sqlalchemy import select, func, and_, Integer, case
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.bounty import BountyWindow, BountyWindowStock, BountyPrediction, BountyPlayerStats, SpyPriceLog
from app.models.user import User
from app.services.finnhub_service import get_stock_price, fetch_quote
from app.config import get_settings

settings = get_settings()

ET = ZoneInfo("America/New_York")

# Scoring
BASE_PAYOUT = {1: 100, 2: 200, 3: 300}
BASE_PENALTY = {1: -50, 2: -100, 3: -150}
WANTED_LEVEL_CAP = 10
CONFIDENCE_LABELS = {1: "Draw", 2: "Quick Draw", 3: "Dead Eye"}

# Rolling window duration (set to 2 for rapid testing, 120 for production)
WINDOW_DURATION_MINUTES = 2

# Stocks to create per bounty window
WINDOW_STOCKS = ["SPY", "NVDA"]

FINNHUB_BASE = "https://finnhub.io/api/v1"


class BountyError(Exception):
    def __init__(self, message: str):
        self.message = message


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

    # Create per-stock rows
    for symbol in WINDOW_STOCKS:
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
    """Get existing stats or create a new record."""
    result = await db.execute(
        select(BountyPlayerStats).where(BountyPlayerStats.user_id == user_id)
    )
    stats = result.scalars().first()
    if not stats:
        stats = BountyPlayerStats(user_id=user_id)
        db.add(stats)
        await db.commit()
        await db.refresh(stats)
    return stats


async def submit_prediction(
    db: AsyncSession,
    user_id: uuid.UUID,
    window_id: uuid.UUID,
    prediction: str,
    confidence: int,
    symbol: str = "SPY",
) -> BountyPrediction:
    """Submit a prediction for a bounty window."""
    # Validate symbol
    if symbol not in WINDOW_STOCKS:
        raise BountyError(f"Invalid stock symbol: {symbol}")

    # Validate window exists and is active
    window = await db.get(BountyWindow, window_id)
    if not window:
        raise BountyError("Bounty window not found")

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

    if prediction not in ("UP", "DOWN"):
        raise BountyError("Prediction must be UP or DOWN")
    if confidence not in (1, 2, 3):
        raise BountyError("Confidence must be 1, 2, or 3")

    stats = await get_or_create_player_stats(db, user_id)

    pred = BountyPrediction(
        user_id=user_id,
        bounty_window_id=window_id,
        symbol=symbol,
        prediction=prediction,
        confidence=confidence,
        wanted_level_at_pick=stats.wanted_level,
    )
    db.add(pred)

    stats.total_predictions += 1
    stats.last_prediction_at = now

    await db.commit()
    await db.refresh(pred)
    return pred


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
    """Settle a bounty window: fetch closing prices per stock, determine results, score predictions."""
    window = await db.get(BountyWindow, window_id)
    if not window or window.is_settled:
        return

    # Settle per-stock rows
    stock_result = await db.execute(
        select(BountyWindowStock).where(BountyWindowStock.bounty_window_id == window_id)
    )
    stock_rows = list(stock_result.scalars().all())

    # Build symbol → result map for scoring predictions
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
        if stock_row.open_price is not None:
            stock_row.result = "UP" if price >= float(stock_row.open_price) else "DOWN"
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

    # Score all predictions by matching symbol
    result = await db.execute(
        select(BountyPrediction).where(BountyPrediction.bounty_window_id == window_id)
    )
    predictions = list(result.scalars().all())

    for pred in predictions:
        stock_result_value = stock_results.get(pred.symbol, window.result)
        is_correct = pred.prediction == stock_result_value
        pred.is_correct = is_correct

        if is_correct:
            payout = BASE_PAYOUT[pred.confidence] * max(pred.wanted_level_at_pick, 1)
            pred.payout = payout
        else:
            payout = BASE_PENALTY[pred.confidence]
            pred.payout = payout

        # Update player stats
        stats = await get_or_create_player_stats(db, pred.user_id)
        stats.double_dollars = max(0, stats.double_dollars + payout)

        if is_correct:
            stats.correct_predictions += 1
            stats.wanted_level = min(stats.wanted_level + 1, WANTED_LEVEL_CAP)
            stats.best_streak = max(stats.best_streak, stats.wanted_level)
        else:
            stats.wanted_level = 0

    await db.commit()


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
    return {
        "id": pred.id,
        "prediction": pred.prediction,
        "confidence": pred.confidence,
        "confidence_label": CONFIDENCE_LABELS[pred.confidence],
        "is_correct": pred.is_correct,
        "payout": pred.payout,
        "wanted_level_at_pick": pred.wanted_level_at_pick,
        "created_at": pred.created_at,
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

    # Fetch SPY chart: Yahoo Finance (2h of 1-min data), fallback to self-logged prices
    candles = []
    if current:
        candles = await fetch_chart_yahoo("SPY")

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

        for stock_row in stock_rows:
            stock_candles = await fetch_chart_yahoo(stock_row.symbol)
            stock_pick = user_preds.get(stock_row.symbol)

            stocks_status.append({
                "symbol": stock_row.symbol,
                "open_price": float(stock_row.open_price) if stock_row.open_price else None,
                "close_price": float(stock_row.close_price) if stock_row.close_price else None,
                "result": stock_row.result,
                "is_settled": stock_row.is_settled,
                "candles": stock_candles,
                "my_pick": _pick_to_response(stock_pick) if stock_pick else None,
            })

    return {
        "current_window": _window_to_response(current) if current else None,
        "previous_window": _window_to_response(previous) if previous else None,
        "my_pick": my_pick,
        "previous_pick": previous_pick,
        "player_stats": _stats_to_response(stats),
        "next_window_time": get_next_window_time(),
        "spy_candles": candles,
        "stocks": stocks_status,
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
    """Fetch last 2 hours of 1-minute data from Yahoo Finance."""
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
                params={"interval": "1m", "range": "2h"},
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
            closes = result[0].get("indicators", {}).get("quote", [{}])[0].get("close", [])

            if not timestamps or not closes:
                return []

            return [
                {"timestamp": ts, "close": round(close, 2)}
                for ts, close in zip(timestamps, closes)
                if close is not None
            ]
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
