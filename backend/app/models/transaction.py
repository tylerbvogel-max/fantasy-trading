import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Numeric, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    player_season_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("player_seasons.id"), nullable=False
    )
    season_id: Mapped[str] = mapped_column(ForeignKey("seasons.id"), nullable=False)
    stock_symbol: Mapped[str] = mapped_column(String(10), nullable=False)
    transaction_type: Mapped[str] = mapped_column(String(4), nullable=False)  # BUY or SELL
    shares: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    price_per_share: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    total_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    executed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    player_season: Mapped["PlayerSeason"] = relationship(back_populates="transactions")
