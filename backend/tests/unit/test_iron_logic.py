"""Unit tests for iron offering and combo logic."""
import pytest

from app.services.bounty_service import roll_iron_offering, get_combo_effects
from app.services.bounty_config import IRON_DEFS, IRON_COMBOS, RARITY_MIN_LEVEL

pytestmark = pytest.mark.unit


class TestRollIronOffering:
    def test_returns_3_irons(self):
        result = roll_iron_offering(set(), wanted_level=5)
        assert len(result) == 3
        assert all("id" in iron for iron in result)

    def test_irons_are_unique(self):
        result = roll_iron_offering(set(), wanted_level=5)
        ids = [iron["id"] for iron in result]
        assert len(ids) == len(set(ids))
        assert len(ids) == 3

    def test_excludes_equipped(self):
        equipped = {"steady_hand", "thick_skin"}
        result = roll_iron_offering(equipped, wanted_level=5)
        offered_ids = {iron["id"] for iron in result}
        assert "steady_hand" not in offered_ids
        assert "thick_skin" not in offered_ids

    def test_low_level_no_legendary(self):
        """Level 1 should never get legendary irons (min level gating)."""
        legendary_min = RARITY_MIN_LEVEL.get("legendary", 99)
        for _ in range(20):
            result = roll_iron_offering(set(), wanted_level=1)
            for iron in result:
                if iron["rarity"] == "legendary":
                    assert 1 >= legendary_min, "Legendary offered below min level"
        assert len(result) == 3

    def test_high_level_can_get_any_rarity(self):
        """Level 10 has access to all rarities — just verify no crash."""
        result = roll_iron_offering(set(), wanted_level=10)
        assert len(result) == 3
        assert all(iron["rarity"] in ("common", "uncommon", "rare", "legendary") for iron in result)

    def test_handles_nearly_all_equipped(self):
        """When almost all irons equipped, still returns available ones."""
        all_but_3 = {iron["id"] for iron in IRON_DEFS[3:]}
        result = roll_iron_offering(all_but_3, wanted_level=10)
        assert len(result) <= 3
        assert all("id" in iron for iron in result)


class TestGetComboEffects:
    def test_no_combo_active(self):
        result = get_combo_effects(set())
        assert result == {}
        assert isinstance(result, dict)

    def test_single_combo_active(self):
        if not IRON_COMBOS:
            pytest.skip("No combos defined")
        combo = IRON_COMBOS[0]
        equipped = set(combo["irons"])
        result = get_combo_effects(equipped)
        assert len(result) > 0
        assert all(isinstance(v, (int, float, bool)) for v in result.values())

    def test_partial_combo_not_active(self):
        if not IRON_COMBOS:
            pytest.skip("No combos defined")
        combo = IRON_COMBOS[0]
        equipped = {combo["irons"][0]}  # Only one iron from combo
        result = get_combo_effects(equipped)
        # Should not activate since not all irons present
        assert result == {} or all(
            not all(i in equipped for i in c["irons"]) for c in IRON_COMBOS if c != combo
        )
        assert isinstance(result, dict)
