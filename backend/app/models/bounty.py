import uuid
from datetime import datetime, date, timezone
from decimal import Decimal
from sqlalchemy import String, Boolean, Integer, Float, Date, DateTime, Numeric, ForeignKey, UniqueConstraint
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
    confidence: Mapped[int] = mapped_column(Integer, nullable=False)
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
