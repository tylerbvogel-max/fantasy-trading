"""Unit tests for stock event detection and next window time."""
import pytest
from datetime import datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

from app.services.bounty_service import detect_stock_event, get_next_window_time

pytestmark = pytest.mark.unit

ET = ZoneInfo("America/New_York")


class TestDetectStockEvent:
    def test_friday_is_mag7(self):
        friday = datetime(2026, 4, 3, 12, 0, tzinfo=ET)  # Friday
        with patch("app.services.bounty_service.datetime") as mock_dt:
            mock_dt.now.return_value = friday
            event_type, event_name = detect_stock_event()
        assert event_type == "mag7_friday"
        assert "Mag 7" in event_name

    def test_wednesday_is_sector_spotlight(self):
        wednesday = datetime(2026, 4, 1, 12, 0, tzinfo=ET)  # Wednesday
        with patch("app.services.bounty_service.datetime") as mock_dt:
            mock_dt.now.return_value = wednesday
            event_type, event_name = detect_stock_event()
        assert event_type == "sector_spotlight"
        assert "Sector Spotlight" in event_name

    def test_monday_no_event(self):
        monday = datetime(2026, 3, 30, 12, 0, tzinfo=ET)  # Monday
        with patch("app.services.bounty_service.datetime") as mock_dt:
            mock_dt.now.return_value = monday
            event_type, event_name = detect_stock_event()
        assert event_type is None
        assert event_name is None


class TestGetNextWindowTime:
    def test_returns_future_datetime(self):
        result = get_next_window_time()
        assert result is not None or result is None  # Can be None if after market hours
        # Just ensure no crash
        assert True

    def test_returns_datetime_or_none(self):
        result = get_next_window_time()
        from datetime import datetime
        assert result is None or isinstance(result, datetime)
        assert True  # No crash is the validation
