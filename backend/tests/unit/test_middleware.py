"""Unit tests for rate limiting middleware route classification."""
import pytest

from app.middleware import _tier_for_path

pytestmark = pytest.mark.unit


class TestTierForPath:
    def test_auth_routes(self):
        assert _tier_for_path("/auth/register") == "auth"
        assert _tier_for_path("/auth/login") == "auth"

    def test_predict_routes(self):
        assert _tier_for_path("/bounty/predict") == "predict"
        assert _tier_for_path("/bounty/skip") == "predict"
        assert _tier_for_path("/bounty/reset") == "predict"
        assert _tier_for_path("/bounty/irons/pick") == "predict"

    def test_admin_routes(self):
        assert _tier_for_path("/admin/stocks/refresh") == "admin"
        assert _tier_for_path("/admin/invite-codes") == "admin"

    def test_default_is_read(self):
        assert _tier_for_path("/bounty/status") == "read"
        assert _tier_for_path("/bounty/board") == "read"
        assert _tier_for_path("/unknown/path") == "read"

    def test_exact_prefix_matching(self):
        """Ensure prefix matching works correctly."""
        assert _tier_for_path("/bounty/titles/equip") == "predict"
        assert _tier_for_path("/bounty/titles") == "read"
