import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Integer, DateTime, Numeric, Text, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class InteractionType(Base):
    """Phase 2: Defines available interaction mechanics."""
    __tablename__ = "interaction_types"

    interaction_type: Mapped[str] = mapped_column(String(30), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    cooldown_hours: Mapped[int] = mapped_column(Integer, default=24)
    cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class PlayerInteraction(Base):
    """Phase 2: Logs interaction events between players."""
    __tablename__ = "player_interactions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    interaction_type: Mapped[str] = mapped_column(
        ForeignKey("interaction_types.interaction_type"), nullable=False
    )
    initiator_player_season_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("player_seasons.id"), nullable=False
    )
    target_player_season_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("player_seasons.id"), nullable=False
    )
    season_id: Mapped[str] = mapped_column(ForeignKey("seasons.id"), nullable=False)
    stock_symbol: Mapped[str | None] = mapped_column(String(10), nullable=True)
    shares_affected: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    additional_details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    related_transaction_ids: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
