import uuid
from datetime import date, datetime, timezone
from sqlalchemy import String, Date, DateTime, Numeric, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class PortfolioSnapshot(Base):
    __tablename__ = "portfolio_snapshots"
    __table_args__ = (
        UniqueConstraint("player_season_id", "snapshot_date", name="uq_snapshot_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    player_season_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("player_seasons.id"), nullable=False
    )
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    total_value: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    percent_gain: Mapped[float] = mapped_column(Numeric(8, 4), nullable=False)

    holdings_snapshots: Mapped[list["HoldingsSnapshot"]] = relationship(
        back_populates="portfolio_snapshot", cascade="all, delete-orphan"
    )


class HoldingsSnapshot(Base):
    __tablename__ = "holdings_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    snapshot_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("portfolio_snapshots.id"), nullable=False
    )
    stock_symbol: Mapped[str] = mapped_column(String(10), nullable=False)
    shares_owned: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    current_value: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    weight_pct: Mapped[float] = mapped_column(Numeric(6, 4), nullable=False)

    portfolio_snapshot: Mapped["PortfolioSnapshot"] = relationship(
        back_populates="holdings_snapshots"
    )
