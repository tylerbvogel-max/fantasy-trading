from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Numeric, BigInteger
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class StockActive(Base):
    __tablename__ = "stocks_active"

    symbol: Mapped[str] = mapped_column(String(10), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    price: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    price_open: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    high: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    low: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    volume: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    market_cap: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    pe_ratio: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    eps: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    high_52w: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    low_52w: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    beta: Mapped[float | None] = mapped_column(Numeric(6, 4), nullable=True)
    change_pct: Mapped[float | None] = mapped_column(Numeric(8, 4), nullable=True)
    last_updated: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class StockMaster(Base):
    __tablename__ = "stocks_master"

    symbol: Mapped[str] = mapped_column(String(10), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    sector: Mapped[str | None] = mapped_column(String(50), nullable=True)
    market_cap_tier: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
