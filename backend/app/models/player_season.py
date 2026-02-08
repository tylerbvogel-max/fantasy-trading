import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Numeric, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class PlayerSeason(Base):
    __tablename__ = "player_seasons"
    __table_args__ = (
        UniqueConstraint("user_id", "season_id", name="uq_user_season"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    season_id: Mapped[str] = mapped_column(ForeignKey("seasons.id"), nullable=False)
    cash_balance: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    user: Mapped["User"] = relationship(back_populates="player_seasons")
    season: Mapped["Season"] = relationship(back_populates="player_seasons")
    holdings: Mapped[list["Holding"]] = relationship(back_populates="player_season", cascade="all, delete-orphan")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="player_season")
