import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, DateTime, Numeric, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class SeasonArchive(Base):
    __tablename__ = "season_archive"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    season_id: Mapped[str] = mapped_column(ForeignKey("seasons.id"), nullable=False)
    player_season_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("player_seasons.id"), nullable=False
    )
    final_rank: Mapped[int] = mapped_column(Integer, nullable=False)
    final_value: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    percent_gain: Mapped[float] = mapped_column(Numeric(8, 4), nullable=False)
    archived_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
