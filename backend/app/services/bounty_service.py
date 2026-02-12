import uuid
import httpx
from datetime import datetime, date, time, timedelta, timezone
from zoneinfo import ZoneInfo
from sqlalchemy import select, func, and_, Integer, case
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.bounty import BountyWindow, BountyPrediction, BountyPlayerStats
from app.models.user import User
from app.services.finnhub_service import get_stock_price
from app.config import get_settings

settings = get_settings()

ET = ZoneInfo("America/New_York")

# Scoring
BASE_PAYOUT = {1: 100, 2: 200, 3: 300}
BASE_PENALTY = {1: -50, 2: -100, 3: -150}
WANTED_LEVEL_CAP = 10
CONFIDENCE_LABELS = {1: "Draw", 2: "Quick Draw", 3: "Dead Eye"}

# 6 bounty windows per day (ET hours) — starts at 9 AM to catch market open
WINDOW_SCHEDULE = [(9, 0), (11, 0), (13, 0), (15, 0), (17, 0), (19, 0)]
PREDICTION_WINDOW_MINUTES = 90  # 1.5 hours for beta testing (will tighten later)

FINNHUB_BASE = "https://finnhub.io/api/v1"


class BountyError(Exception):
    def __init__(self, message: str):
        self.message = message


async def get_or_create_today_windows(db: AsyncSession) -> list[BountyWindow]:
    """Create 6 bounty windows for today if they don't exist. Skips weekends."""
    now_et = datetime.now(ET)
    today = now_et.date()

    # Skip weekends
    if today.weekday() >= 5:
        return []

    # Check if windows already exist
    result = await db.execute(
        select(BountyWindow)
        .where(BountyWindow.window_date == today)
        .order_by(BountyWindow.window_index)
    )
    existing = list(result.scalars().all())
    if existing:
        return existing

    windows = []
    for i, (hour, minute) in enumerate(WINDOW_SCHEDULE, start=1):
        start_dt = datetime.combine(today, time(hour, minute), tzinfo=ET)
        end_hour, end_minute = WINDOW_SCHEDULE[i] if i < len(WINDOW_SCHEDULE) else (22, 0)
        end_dt = datetime.combine(today, time(end_hour, end_minute), tzinfo=ET)

        window = BountyWindow(
            id=uuid.uuid4(),
            window_date=today,
            window_index=i,
            start_time=start_dt,
            end_time=end_dt,
        )
        db.add(window)
        windows.append(window)

    await db.commit()
    for w in windows:
        await db.refresh(w)
    return windows


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
    """Calculate the next window start time from WINDOW_SCHEDULE."""
    now_et = datetime.now(ET)
    today = now_et.date()

    # Check remaining windows today
    for hour, minute in WINDOW_SCHEDULE:
        window_start = datetime.combine(today, time(hour, minute), tzinfo=ET)
        if window_start > now_et:
            return window_start

    # Next business day
    next_day = today + timedelta(days=1)
    while next_day.weekday() >= 5:
        next_day += timedelta(days=1)

    first_hour, first_minute = WINDOW_SCHEDULE[0]
    return datetime.combine(next_day, time(first_hour, first_minute), tzinfo=ET)


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
) -> BountyPrediction:
    """Submit a prediction for a bounty window."""
    # Validate window exists and is active
    window = await db.get(BountyWindow, window_id)
    if not window:
        raise BountyError("Bounty window not found")

    now = datetime.now(timezone.utc)
    if now < window.start_time or now >= window.end_time:
        raise BountyError("This bounty window is not currently active")

    # Prediction cutoff disabled for beta testing
    # prediction_cutoff = window.start_time + timedelta(minutes=PREDICTION_WINDOW_MINUTES)
    # if now >= prediction_cutoff:
    #     raise BountyError("Prediction window closed — picks are locked after the first 30 minutes")

    if window.is_settled:
        raise BountyError("This bounty window has already been settled")

    # Check for existing prediction
    result = await db.execute(
        select(BountyPrediction).where(
            BountyPrediction.user_id == user_id,
            BountyPrediction.bounty_window_id == window_id,
        )
    )
    if result.scalars().first():
        raise BountyError("You've already made a prediction for this window")

    if prediction not in ("UP", "DOWN"):
        raise BountyError("Prediction must be UP or DOWN")
    if confidence not in (1, 2, 3):
        raise BountyError("Confidence must be 1, 2, or 3")

    stats = await get_or_create_player_stats(db, user_id)

    pred = BountyPrediction(
        user_id=user_id,
        bounty_window_id=window_id,
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
    """Fetch current SPY price and save as spy_open_price."""
    window = await db.get(BountyWindow, window_id)
    if not window or window.spy_open_price is not None:
        return

    price = await get_stock_price(db, "SPY")
    if price:
        window.spy_open_price = price
        await db.commit()


async def settle_window(db: AsyncSession, window_id: uuid.UUID) -> None:
    """Settle a bounty window: fetch closing price, determine result, score all predictions."""
    window = await db.get(BountyWindow, window_id)
    if not window or window.is_settled:
        return

    # Get closing SPY price
    price = await get_stock_price(db, "SPY")
    if not price:
        return

    window.spy_close_price = price

    # Determine result
    if window.spy_open_price is not None:
        window.result = "UP" if price >= float(window.spy_open_price) else "DOWN"
    else:
        window.result = "UP"  # Default if no open price recorded

    window.is_settled = True

    # Score all predictions
    result = await db.execute(
        select(BountyPrediction).where(BountyPrediction.bounty_window_id == window_id)
    )
    predictions = list(result.scalars().all())

    for pred in predictions:
        is_correct = pred.prediction == window.result
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
    prediction_cutoff = window.start_time + timedelta(minutes=PREDICTION_WINDOW_MINUTES)
    return {
        "id": window.id,
        "window_date": window.window_date,
        "window_index": window.window_index,
        "start_time": window.start_time,
        "end_time": window.end_time,
        "prediction_cutoff": prediction_cutoff,
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

    # Fetch SPY candles for the current window timeframe
    candles = []
    if current and current.start_time:
        from_ts = int(current.start_time.timestamp())
        to_ts = int(datetime.now(timezone.utc).timestamp())
        candles = await fetch_spy_candles(from_ts, to_ts)

    return {
        "current_window": _window_to_response(current) if current else None,
        "previous_window": _window_to_response(previous) if previous else None,
        "my_pick": my_pick,
        "previous_pick": previous_pick,
        "player_stats": _stats_to_response(stats),
        "next_window_time": get_next_window_time(),
        "spy_candles": candles,
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


async def fetch_spy_candles(from_ts: int, to_ts: int) -> list[dict]:
    """Fetch SPY candle data from Finnhub."""
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{FINNHUB_BASE}/stock/candle",
                params={
                    "symbol": "SPY",
                    "resolution": "5",
                    "from": from_ts,
                    "to": to_ts,
                    "token": settings.finnhub_api_key,
                },
                timeout=10.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                if data.get("s") == "ok" and data.get("t"):
                    return [
                        {"timestamp": t, "close": c}
                        for t, c in zip(data["t"], data["c"])
                    ]
        except httpx.RequestError:
            pass
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


# Time slot labels matching WINDOW_SCHEDULE
TIME_SLOT_LABELS = {1: "9 AM", 2: "11 AM", 3: "1 PM", 4: "3 PM", 5: "5 PM", 6: "7 PM"}


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

    # --- Time slot stats ---
    slot_result = await db.execute(
        select(
            BountyWindow.window_index,
            func.count(BountyPrediction.id).label("total"),
            func.count(BountyPrediction.id).filter(
                BountyPrediction.is_correct == True
            ).label("correct"),
        )
        .join(BountyWindow, BountyPrediction.bounty_window_id == BountyWindow.id)
        .where(BountyPrediction.user_id == user_id, BountyPrediction.is_correct.isnot(None))
        .group_by(BountyWindow.window_index)
    )
    time_slot_stats = []
    for row in slot_result.all():
        total = row.total or 0
        correct = row.correct or 0
        time_slot_stats.append({
            "window_index": row.window_index,
            "time_label": TIME_SLOT_LABELS.get(row.window_index, f"#{row.window_index}"),
            "total": total,
            "correct": correct,
            "win_rate": round(correct / total * 100, 1) if total > 0 else 0.0,
        })
    # Fill missing slots
    existing_slots = {s["window_index"] for s in time_slot_stats}
    for idx in range(1, 7):
        if idx not in existing_slots:
            time_slot_stats.append({
                "window_index": idx, "time_label": TIME_SLOT_LABELS.get(idx, f"#{idx}"),
                "total": 0, "correct": 0, "win_rate": 0.0,
            })
    time_slot_stats.sort(key=lambda s: s["window_index"])

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
