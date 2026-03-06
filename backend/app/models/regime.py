import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, Float, DateTime, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class MarketRegime(Base):
    __tablename__ = "market_regimes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    monetary_regime: Mapped[str] = mapped_column(String(20), nullable=False)
    risk_regime: Mapped[str] = mapped_column(String(20), nullable=False)
    dominant_narrative: Mapped[str | None] = mapped_column(Text, nullable=True)
    llm_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    raw_headlines: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    headline_count: Mapped[int] = mapped_column(Integer, default=0)
    quant_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    quant_vix: Mapped[float | None] = mapped_column(Float, nullable=True)
    quant_ma200_slope: Mapped[float | None] = mapped_column(Float, nullable=True)
    final_regime: Mapped[str] = mapped_column(String(30), nullable=False)
