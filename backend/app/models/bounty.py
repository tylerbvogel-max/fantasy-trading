import uuid
from datetime import datetime, date, timezone
from decimal import Decimal
from sqlalchemy import String, Boolean, Integer, Date, DateTime, Numeric, ForeignKey, UniqueConstraint
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


class BountyPrediction(Base):
    __tablename__ = "bounty_predictions"
    __table_args__ = (
        UniqueConstraint("user_id", "bounty_window_id", name="uq_bounty_user_window"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    bounty_window_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bounty_windows.id"), nullable=False)
    prediction: Mapped[str] = mapped_column(String(4), nullable=False)
    confidence: Mapped[int] = mapped_column(Integer, nullable=False)
    is_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    payout: Mapped[int] = mapped_column(Integer, default=0)
    wanted_level_at_pick: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
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
