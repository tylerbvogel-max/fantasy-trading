"""Unit tests for pure regime service functions."""
import pytest

from app.services.news_regime_service import (
    _build_regime_prompt,
    _validate_regime_result,
    _quant_only_regime,
)

pytestmark = pytest.mark.unit


class TestBuildRegimePrompt:
    def test_contains_sections(self):
        headlines = [{"source": "Reuters", "title": "Fed holds rates", "description": "As expected"}]
        quant = {"rate": 5.25, "vix": 15.0, "ma200_slope": 2.0}
        result = _build_regime_prompt(headlines, quant)
        assert "HEADLINES" in result
        assert "QUANTITATIVE DATA" in result

    def test_empty_headlines(self):
        result = _build_regime_prompt([], {"rate": 5.0})
        assert "HEADLINES" in result
        assert isinstance(result, str)

    def test_headline_limit_30(self):
        headlines = [{"source": "X", "title": f"H{i}", "description": ""} for i in range(50)]
        result = _build_regime_prompt(headlines, {})
        # Only first 30 should be included
        assert "[X] H29" in result
        assert "[X] H30" not in result


class TestValidateRegimeResult:
    def test_valid_input_passes_through(self):
        result = _validate_regime_result({
            "monetary_regime": "hawkish",
            "risk_regime": "risk_off",
            "confidence": 0.8,
        })
        assert result["monetary_regime"] == "hawkish"
        assert result["risk_regime"] == "risk_off"

    def test_invalid_monetary_normalized(self):
        result = _validate_regime_result({
            "monetary_regime": "crazy",
            "risk_regime": "neutral",
            "confidence": 0.5,
        })
        assert result["monetary_regime"] == "neutral"
        assert result["risk_regime"] == "neutral"

    def test_confidence_clamped(self):
        high = _validate_regime_result({"monetary_regime": "neutral", "risk_regime": "neutral", "confidence": 5.0})
        low = _validate_regime_result({"monetary_regime": "neutral", "risk_regime": "neutral", "confidence": -1.0})
        assert high["confidence"] == 1.0
        assert low["confidence"] == 0.0


class TestQuantOnlyRegime:
    def test_high_vix_risk_off(self):
        result = _quant_only_regime({"vix": 35.0, "rate": 5.0, "ma200_slope": 0})
        assert result["risk_regime"] == "risk_off"
        assert result["confidence"] == 0.5

    def test_low_vix_low_rate_risk_on(self):
        result = _quant_only_regime({"vix": 12.0, "rate": 1.5, "ma200_slope": 3.0})
        assert result["risk_regime"] == "risk_on"
        assert "Low VIX" in result["dominant_narrative"]

    def test_none_values_neutral(self):
        result = _quant_only_regime({})
        assert result["risk_regime"] == "neutral"
        assert result["monetary_regime"] == "neutral"

    def test_negative_ma200_slope(self):
        result = _quant_only_regime({"vix": 20.0, "rate": 3.0, "ma200_slope": -3.0})
        assert result["risk_regime"] == "risk_off"
        assert "MA200" in result["dominant_narrative"]
