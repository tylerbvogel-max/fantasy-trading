import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Numeric, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Holding(Base):
    __tablename__ = "holdings"
    __table_args__ = (
        UniqueConstraint("player_season_id", "stock_symbol", name="uq_holding_stock"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    player_season_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("player_seasons.id"), nullable=False
    )
    stock_symbol: Mapped[str] = mapped_column(String(10), nullable=False)
    shares_owned: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    average_purchase_price: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )

    player_season: Mapped["PlayerSeason"] = relationship(back_populates="holdings")
