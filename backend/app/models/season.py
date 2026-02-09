from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Numeric, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Season(Base):
    __tablename__ = "seasons"

    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    season_type: Mapped[str] = mapped_column(String(30), nullable=False, default="open")
    allowed_stocks: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    starting_cash: Mapped[float] = mapped_column(Numeric(12, 2), default=100000.00)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    mode: Mapped[str] = mapped_column(String(20), nullable=False, default="league")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    player_seasons: Mapped[list["PlayerSeason"]] = relationship(back_populates="season")
