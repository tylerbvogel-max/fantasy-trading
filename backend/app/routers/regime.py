from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.news_regime_service import get_current_regime, run_regime_assessment

router = APIRouter(prefix="/regime", tags=["regime"])


@router.get("/current")
async def current_regime(db: AsyncSession = Depends(get_db)):
    """Return the latest market regime assessment."""
    return await get_current_regime(db)


@router.post("/assess")
async def trigger_assessment(db: AsyncSession = Depends(get_db)):
    """Manually trigger a regime assessment (for testing)."""
    regime = await run_regime_assessment(db)
    return {
        "final_regime": regime.final_regime,
        "monetary_regime": regime.monetary_regime,
        "risk_regime": regime.risk_regime,
        "dominant_narrative": regime.dominant_narrative,
        "confidence": regime.llm_confidence,
    }
