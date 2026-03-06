"""
News-driven regime detection service.

Fetches financial headlines from NewsAPI, combines with quantitative market data,
and uses Claude Haiku to classify the current market regime (risk_on/neutral/risk_off).
The regime determines which strategy signals are active in the Strategy Lab backtest.
"""
import json
import httpx
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.regime import MarketRegime
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

NEWSAPI_BASE = "https://newsapi.org/v2"
NEWSAPI_SOURCES = "reuters,bloomberg,the-wall-street-journal,financial-times,associated-press"

# Stale regime threshold — fall back to quant-only after 24h
REGIME_STALE_HOURS = 24


async def fetch_headlines() -> list[dict]:
    """Fetch top financial headlines from NewsAPI.org."""
    if not settings.news_api_key:
        logger.warning("NEWS_API_KEY not set, skipping headline fetch")
        return []

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{NEWSAPI_BASE}/top-headlines",
                params={
                    "sources": NEWSAPI_SOURCES,
                    "pageSize": 50,
                    "apiKey": settings.news_api_key,
                },
                timeout=15.0,
            )
            if resp.status_code != 200:
                logger.warning(f"NewsAPI returned {resp.status_code}: {resp.text[:200]}")
                return []

            data = resp.json()
            articles = data.get("articles", [])
            return [
                {
                    "title": a.get("title", ""),
                    "description": a.get("description", ""),
                    "source": a.get("source", {}).get("name", ""),
                    "publishedAt": a.get("publishedAt", ""),
                }
                for a in articles
                if a.get("title")
            ]
        except httpx.RequestError as e:
            logger.error(f"NewsAPI fetch failed: {e}")
            return []


async def fetch_quant_inputs() -> dict:
    """Fetch quantitative market inputs from Yahoo Finance: ^IRX (rate), ^VIX, SPY MA200 slope."""
    result = {"rate": None, "vix": None, "ma200_slope": None}

    async with httpx.AsyncClient() as client:
        # Fetch ^IRX (13-week T-bill rate) and ^VIX
        for symbol, key in [("^IRX", "rate"), ("^VIX", "vix")]:
            try:
                resp = await client.get(
                    f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
                    params={"range": "5d", "interval": "1d"},
                    headers={"User-Agent": "Mozilla/5.0"},
                    timeout=10.0,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    closes = (
                        data.get("chart", {})
                        .get("result", [{}])[0]
                        .get("indicators", {})
                        .get("quote", [{}])[0]
                        .get("close", [])
                    )
                    # Get last non-null close
                    valid = [c for c in closes if c is not None]
                    if valid:
                        result[key] = valid[-1]
            except (httpx.RequestError, ValueError, KeyError) as e:
                logger.error(f"Yahoo {symbol} fetch failed: {e}")

        # Fetch SPY for MA200 slope
        try:
            resp = await client.get(
                "https://query1.finance.yahoo.com/v8/finance/chart/SPY",
                params={"range": "1y", "interval": "1d"},
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=15.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                closes = (
                    data.get("chart", {})
                    .get("result", [{}])[0]
                    .get("indicators", {})
                    .get("quote", [{}])[0]
                    .get("close", [])
                )
                valid_closes = [c for c in closes if c is not None]
                if len(valid_closes) >= 200:
                    # MA200 = average of last 200 closes
                    ma200_now = sum(valid_closes[-200:]) / 200
                    # MA200 from 20 days ago
                    ma200_prev = sum(valid_closes[-220:-20]) / 200
                    # Annualized slope as percentage
                    result["ma200_slope"] = ((ma200_now / ma200_prev) - 1) * 100 * (252 / 20)
        except (httpx.RequestError, ValueError, KeyError) as e:
            logger.error(f"Yahoo SPY MA200 fetch failed: {e}")

    return result


async def assess_regime(headlines: list[dict], quant: dict) -> dict | None:
    """Use Claude Haiku to assess market regime from headlines + quant data."""
    if not settings.anthropic_api_key:
        logger.warning("ANTHROPIC_API_KEY not set, skipping LLM regime assessment")
        return None

    # Build headline text (limit to ~30 headlines for prompt size)
    headline_texts = []
    for h in headlines[:30]:
        source = h.get("source", "")
        title = h.get("title", "")
        desc = h.get("description", "")
        headline_texts.append(f"[{source}] {title}" + (f" — {desc}" if desc else ""))

    headlines_block = "\n".join(headline_texts)

    quant_block = (
        f"- 13-week T-bill rate (^IRX): {quant.get('rate', 'N/A')}%\n"
        f"- VIX: {quant.get('vix', 'N/A')}\n"
        f"- SPY MA200 slope (annualized): {quant.get('ma200_slope', 'N/A')}%"
    )

    prompt = f"""You are a financial market regime classifier. Analyze the following recent financial headlines and quantitative data to determine the current market regime.

HEADLINES:
{headlines_block}

QUANTITATIVE DATA:
{quant_block}

Classify the market into:
- monetary_regime: "dovish" (Fed easing, rate cuts expected), "neutral" (stable policy), or "hawkish" (Fed tightening, rate hikes expected/ongoing)
- risk_regime: "risk_on" (bullish sentiment, low volatility, stable growth), "neutral" (mixed signals), "risk_off" (bearish, high uncertainty, defensive positioning), or "crisis" (acute market stress, panic)
- dominant_narrative: One sentence summarizing the prevailing market theme
- confidence: 0.0 to 1.0, how confident you are in this assessment

Respond with ONLY valid JSON, no other text:
{{"monetary_regime": "...", "risk_regime": "...", "dominant_narrative": "...", "confidence": 0.0}}"""

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        )
        response_text = message.content[0].text.strip()

        # Strip markdown code fences if present (e.g. ```json ... ```)
        if response_text.startswith("```"):
            lines = response_text.split("\n")
            # Remove first line (```json) and last line (```)
            lines = [l for l in lines if not l.strip().startswith("```")]
            response_text = "\n".join(lines).strip()

        # Parse JSON response
        result = json.loads(response_text)

        # Validate expected fields
        valid_monetary = {"dovish", "neutral", "hawkish"}
        valid_risk = {"risk_on", "neutral", "risk_off", "crisis"}

        if result.get("monetary_regime") not in valid_monetary:
            result["monetary_regime"] = "neutral"
        if result.get("risk_regime") not in valid_risk:
            result["risk_regime"] = "neutral"
        result["confidence"] = max(0.0, min(1.0, float(result.get("confidence", 0.5))))

        return result

    except json.JSONDecodeError as e:
        logger.error(f"LLM returned invalid JSON: {e} | raw: {response_text[:300]}")
        return None
    except Exception as e:
        logger.error(f"LLM regime assessment failed: {e}")
        return None


def _quant_only_regime(quant: dict) -> dict:
    """Fallback regime determination using only quantitative data (no headlines/LLM)."""
    vix = quant.get("vix")
    rate = quant.get("rate")
    ma200_slope = quant.get("ma200_slope")

    # Default to neutral
    regime = "neutral"
    narrative = "Regime determined from quantitative data only (no headlines available)"

    if vix is not None and vix > 30:
        regime = "risk_off"
        narrative = f"VIX at {vix:.1f} indicates elevated market stress"
    elif vix is not None and vix > 25:
        regime = "risk_off"
        narrative = f"VIX at {vix:.1f} suggests heightened uncertainty"
    elif vix is not None and vix < 14 and (rate is None or rate < 2):
        regime = "risk_on"
        narrative = f"Low VIX ({vix:.1f}) and accommodative rates suggest risk-on environment"
    elif ma200_slope is not None and ma200_slope < -2:
        regime = "risk_off"
        narrative = f"Negative MA200 slope ({ma200_slope:.1f}%) indicates deteriorating trend"

    return {
        "monetary_regime": "neutral",
        "risk_regime": regime,
        "dominant_narrative": narrative,
        "confidence": 0.5,
        "final_regime": regime,
    }


def _compute_final_regime(llm: dict, quant: dict) -> str:
    """Apply conflict resolution rules between LLM assessment and quantitative guardrails."""
    vix = quant.get("vix")
    rate = quant.get("rate")
    ma200_slope = quant.get("ma200_slope")
    llm_risk = llm.get("risk_regime", "neutral")
    confidence = llm.get("confidence", 0.5)

    # Map LLM risk_regime to final regime
    regime_map = {
        "risk_on": "risk_on",
        "neutral": "neutral",
        "risk_off": "risk_off",
        "crisis": "risk_off",
    }
    regime = regime_map.get(llm_risk, "neutral")

    # Rule 1: VIX > 30 → always risk_off (hard override)
    if vix is not None and vix > 30:
        return "risk_off"

    # Rule 2: VIX > 25 + LLM says risk_on → downgrade to neutral
    if vix is not None and vix > 25 and regime == "risk_on":
        return "neutral"

    # Rule 3: Rate > 5% + LLM says risk_on → downgrade to neutral
    if rate is not None and rate > 5 and regime == "risk_on":
        return "neutral"

    # Rule 4: MA200 slope < -2% + LLM says risk_on → downgrade to neutral
    if ma200_slope is not None and ma200_slope < -2 and regime == "risk_on":
        return "neutral"

    # Rule 5: VIX < 14 + rate < 2% + LLM says risk_off (low confidence) → upgrade to neutral
    if (vix is not None and vix < 14 and
            rate is not None and rate < 2 and
            regime == "risk_off" and confidence < 0.8):
        return "neutral"

    # Rule 6: crisis already mapped above
    # Rule 7: trust LLM
    return regime


async def store_regime(
    db: AsyncSession,
    llm_result: dict | None,
    quant: dict,
    headlines: list[dict],
    final_regime: str,
) -> MarketRegime:
    """Persist a regime assessment to the database."""
    regime = MarketRegime(
        monetary_regime=llm_result.get("monetary_regime", "neutral") if llm_result else "neutral",
        risk_regime=llm_result.get("risk_regime", "neutral") if llm_result else quant.get("risk_regime", "neutral"),
        dominant_narrative=llm_result.get("dominant_narrative") if llm_result else "Quant-only assessment",
        llm_confidence=llm_result.get("confidence") if llm_result else None,
        raw_headlines=[{"title": h.get("title", ""), "source": h.get("source", "")} for h in headlines[:50]],
        headline_count=len(headlines),
        quant_rate=quant.get("rate"),
        quant_vix=quant.get("vix"),
        quant_ma200_slope=quant.get("ma200_slope"),
        final_regime=final_regime,
    )
    db.add(regime)
    await db.commit()
    await db.refresh(regime)
    logger.info(f"Stored regime assessment: {final_regime} (confidence: {regime.llm_confidence})")
    return regime


async def get_current_regime(db: AsyncSession) -> dict:
    """Return the latest valid regime. Falls back gracefully if stale or missing."""
    result = await db.execute(
        select(MarketRegime)
        .order_by(MarketRegime.timestamp.desc())
        .limit(1)
    )
    regime = result.scalars().first()

    if regime is None:
        return {
            "final_regime": "neutral",
            "monetary_regime": "neutral",
            "risk_regime": "neutral",
            "dominant_narrative": "No regime assessment available yet",
            "confidence": None,
            "quant_rate": None,
            "quant_vix": None,
            "quant_ma200_slope": None,
            "last_updated": None,
            "is_stale": True,
        }

    age = datetime.now(timezone.utc) - regime.timestamp
    is_stale = age > timedelta(hours=REGIME_STALE_HOURS)

    return {
        "final_regime": regime.final_regime,
        "monetary_regime": regime.monetary_regime,
        "risk_regime": regime.risk_regime,
        "dominant_narrative": regime.dominant_narrative,
        "confidence": regime.llm_confidence,
        "quant_rate": regime.quant_rate,
        "quant_vix": regime.quant_vix,
        "quant_ma200_slope": regime.quant_ma200_slope,
        "headline_count": regime.headline_count,
        "last_updated": regime.timestamp.isoformat(),
        "is_stale": is_stale,
    }


async def run_regime_assessment(db: AsyncSession) -> MarketRegime:
    """Full pipeline: fetch headlines + quant → LLM assess → conflict resolve → store."""
    logger.info("Starting regime assessment...")

    # Fetch inputs in parallel
    import asyncio
    headlines, quant = await asyncio.gather(
        fetch_headlines(),
        fetch_quant_inputs(),
    )

    logger.info(f"Fetched {len(headlines)} headlines, quant: rate={quant.get('rate')}, vix={quant.get('vix')}, ma200_slope={quant.get('ma200_slope')}")

    # Determine regime
    if not headlines and not settings.anthropic_api_key:
        # Pure quant fallback
        fallback = _quant_only_regime(quant)
        return await store_regime(db, None, quant, [], fallback["final_regime"])

    llm_result = await assess_regime(headlines, quant)

    if llm_result is None:
        # LLM failed, use quant-only fallback
        fallback = _quant_only_regime(quant)
        return await store_regime(db, None, quant, headlines, fallback["final_regime"])

    # Conflict resolution
    final_regime = _compute_final_regime(llm_result, quant)

    return await store_regime(db, llm_result, quant, headlines, final_regime)
