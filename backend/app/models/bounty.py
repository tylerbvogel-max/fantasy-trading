import uuid
from datetime import datetime, date, timezone
from decimal import Decimal
from sqlalchemy import String, Boolean, Integer, Float, Date, DateTime, Numeric, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class BountyWindow(Base):
    __tablename__ = "bounty_windows"
    __table_args__ = (
        UniqueConstraint("window_date", "window_index", name="uq_bounty_window_date_index"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    window_date: Mapped[date] = mapped_column(Date, nullable=False)
    window_index: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    spy_open_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    spy_close_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    result: Mapped[str | None] = mapped_column(String(4), nullable=True)
    is_settled: Mapped[bool] = mapped_column(Boolean, default=False)
    # P2-B: Weekly stock events
    event_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    event_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class BountyWindowStock(Base):
    """Per-stock data within a bounty window."""
    __tablename__ = "bounty_window_stocks"
    __table_args__ = (
        UniqueConstraint("bounty_window_id", "symbol", name="uq_bounty_window_stock"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    bounty_window_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bounty_windows.id"), nullable=False)
    symbol: Mapped[str] = mapped_column(String(10), nullable=False)
    open_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    close_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    result: Mapped[str | None] = mapped_column(String(4), nullable=True)
    is_settled: Mapped[bool] = mapped_column(Boolean, default=False)
    # P2-C: Post-settlement analysis context (JSON)
    settlement_context: Mapped[str | None] = mapped_column(Text, nullable=True)


class BountyPrediction(Base):
    __tablename__ = "bounty_predictions"
    __table_args__ = (
        UniqueConstraint("user_id", "bounty_window_id", "symbol", name="uq_bounty_user_window_symbol"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    bounty_window_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bounty_windows.id"), nullable=False)
    symbol: Mapped[str] = mapped_column(String(10), nullable=False, default="SPY")
    prediction: Mapped[str] = mapped_column(String(4), nullable=False)
    confidence: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bet_amount: Mapped[int] = mapped_column(Integer, default=0)
    is_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    payout: Mapped[int] = mapped_column(Integer, default=0)
    wanted_level_at_pick: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    # New columns for sim mechanics
    action_type: Mapped[str] = mapped_column(String(20), default="directional")
    insurance_triggered: Mapped[bool] = mapped_column(Boolean, default=False)
    base_points: Mapped[int] = mapped_column(Integer, default=0)
    wanted_multiplier_used: Mapped[int] = mapped_column(Integer, default=1)
    leverage: Mapped[float] = mapped_column(Float, default=1.0)
    margin_call_triggered: Mapped[bool] = mapped_column(Boolean, default=False)


class SpyPriceLog(Base):
    """Rolling log of SPY prices for chart display."""
    __tablename__ = "spy_price_log"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class BountyPlayerStats(Base):
    __tablename__ = "bounty_player_stats"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
    double_dollars: Mapped[int] = mapped_column(Integer, default=0)
    wanted_level: Mapped[int] = mapped_column(Integer, default=0)
    total_predictions: Mapped[int] = mapped_column(Integer, default=0)
    correct_predictions: Mapped[int] = mapped_column(Integer, default=0)
    best_streak: Mapped[int] = mapped_column(Integer, default=0)
    last_prediction_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # New columns for sim mechanics
    notoriety: Mapped[float] = mapped_column(Float, default=0.0)
    chambers: Mapped[int] = mapped_column(Integer, default=2)
    skip_count_this_window: Mapped[int] = mapped_column(Integer, default=0)
    is_busted: Mapped[bool] = mapped_column(Boolean, default=False)
    bust_count: Mapped[int] = mapped_column(Integer, default=0)
    margin_call_cooldown: Mapped[int] = mapped_column(Integer, default=0)
    saloon_used: Mapped[bool] = mapped_column(Boolean, default=False)
    phoenix_used: Mapped[bool] = mapped_column(Boolean, default=False)
    # P1-A: Run Score tracking
    peak_dd: Mapped[int] = mapped_column(Integer, default=0)
    peak_wanted_level: Mapped[int] = mapped_column(Integer, default=0)
    rounds_played: Mapped[int] = mapped_column(Integer, default=0)
    best_run_score: Mapped[int] = mapped_column(Integer, default=0)
    # P1-C: Titles
    lifetime_dd_earned: Mapped[int] = mapped_column(Integer, default=0)
    runs_completed: Mapped[int] = mapped_column(Integer, default=0)
    active_title: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # P1-D: Daily Streaks
    current_streak: Mapped[int] = mapped_column(Integer, default=0)
    longest_streak: Mapped[int] = mapped_column(Integer, default=0)
    last_streak_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    streak_shield: Mapped[bool] = mapped_column(Boolean, default=False)
    # P1-B: Badge progress (JSON blob for tracking partial progress)
    badge_progress: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON


class BountyRunHistory(Base):
    """Archived completed runs for Run Score leaderboard."""
    __tablename__ = "bounty_run_history"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    peak_dd: Mapped[int] = mapped_column(Integer, default=0)
    peak_wanted_level: Mapped[int] = mapped_column(Integer, default=0)
    total_predictions: Mapped[int] = mapped_column(Integer, default=0)
    correct_predictions: Mapped[int] = mapped_column(Integer, default=0)
    accuracy: Mapped[float] = mapped_column(Float, default=0.0)
    rounds_played: Mapped[int] = mapped_column(Integer, default=0)
    run_score: Mapped[int] = mapped_column(Integer, default=0)
    end_reason: Mapped[str] = mapped_column(String(20), default="bust")  # bust, reset, active
    ended_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class BountyBadge(Base):
    """Earned badges (permanent, cross-run)."""
    __tablename__ = "bounty_badges"
    __table_args__ = (
        UniqueConstraint("user_id", "badge_id", name="uq_bounty_badge_user"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    badge_id: Mapped[str] = mapped_column(String(50), nullable=False)
    earned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    run_context: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON snapshot


class BountyTitle(Base):
    """Unlocked titles (permanent, cross-run)."""
    __tablename__ = "bounty_titles"
    __table_args__ = (
        UniqueConstraint("user_id", "title_id", name="uq_bounty_title_user"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    title_id: Mapped[str] = mapped_column(String(50), nullable=False)
    unlocked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class BountyActivityEvent(Base):
    """Community activity feed events."""
    __tablename__ = "bounty_activity_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)  # level_up, badge_earned, high_score, bust
    event_data: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class BountyPlayerIron(Base):
    """Player's equipped irons."""
    __tablename__ = "bounty_player_irons"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    iron_id: Mapped[str] = mapped_column(String(50), nullable=False)
    slot_number: Mapped[int] = mapped_column(Integer, nullable=False)
    equipped_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class BountyIronOffering(Base):
    """Pending iron choices after a window settles."""
    __tablename__ = "bounty_iron_offerings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    bounty_window_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bounty_windows.id"), nullable=True)
    offered_iron_ids: Mapped[str] = mapped_column(String(500), nullable=False)  # JSON array string
    chosen_iron_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
