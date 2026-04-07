"""
Config sync tests — verify backend constants match simulation config.

NPR-7150: North Star cohesion requires all four pillars (UI, backend, sim, docs)
to share identical tunable constants. This test parses tools/bounty-sim/config.mjs
and asserts parity with backend/app/services/bounty_config.py.
"""
import re
from pathlib import Path

import pytest

from app.services.bounty_config import (
    ANTE_BASE,
    DIR_SCORING,
    HOL_SCORING,
    MAX_CHAMBERS,
    NOTORIETY_DOWN_THRESHOLD,
    NOTORIETY_UP_THRESHOLD,
    NOTORIETY_WEIGHT,
    STARTING_CHAMBERS,
    STARTING_DOUBLE_DOLLARS,
    WANTED_MULT,
    WANTED_OVERFLOW_BASE,
)

pytestmark = pytest.mark.unit

# Path to the simulation config (relative to backend/)
SIM_CONFIG_PATH = Path(__file__).resolve().parents[2] / ".." / "tools" / "bounty-sim" / "config.mjs"


def _read_sim_config() -> str:
    """Read the simulation config.mjs file."""
    assert SIM_CONFIG_PATH.exists(), f"Sim config not found at {SIM_CONFIG_PATH}"
    return SIM_CONFIG_PATH.read_text()


def _extract_js_object(text: str, name: str) -> dict:
    """Extract a simple JS object literal like `export const NAME = { ... };`."""
    pattern = rf"export const {name}\s*=\s*\{{([^}}]+)\}}"
    match = re.search(pattern, text)
    assert match, f"Could not find {name} in sim config"
    body = match.group(1)
    # Parse key: value pairs (handles both `1: 13` and `"win": 13`)
    pairs = re.findall(r"""['"]?(\w+)['"]?\s*:\s*(-?[\d.]+)""", body)
    return {k: float(v) if "." in v else int(v) for k, v in pairs}


def _extract_js_scalar(text: str, name: str):
    """Extract `export const NAME = value;`."""
    pattern = rf"export const {name}\s*=\s*(-?[\d.]+)"
    match = re.search(pattern, text)
    assert match, f"Could not find {name} in sim config"
    val = match.group(1)
    return float(val) if "." in val else int(val)


class TestConfigSync:
    """Verify backend ↔ simulation constant parity."""

    def test_dir_scoring_sync(self):
        """DIR_SCORING tables must match between backend and sim."""
        src = _read_sim_config()
        sim_obj = _extract_js_object(src, "DIR_SCORING")
        # Sim uses nested objects; extract the full block manually
        pattern = r"export const DIR_SCORING\s*=\s*\{([\s\S]*?)\};\s*\n"
        match = re.search(pattern, src)
        assert match, "Could not find DIR_SCORING block"
        block = match.group(1)
        # Parse each confidence level
        for conf in [1, 2, 3]:
            win_match = re.search(
                rf"{conf}\s*:\s*\{{\s*win:\s*(\d+),\s*lose:\s*(\d+)\s*\}}", block
            )
            assert win_match, f"Could not parse DIR_SCORING conf {conf}"
            sim_win, sim_lose = int(win_match.group(1)), int(win_match.group(2))
            assert sim_win == DIR_SCORING[conf]["win"], f"DIR_SCORING[{conf}].win mismatch"
            assert sim_lose == DIR_SCORING[conf]["lose"], f"DIR_SCORING[{conf}].lose mismatch"

    def test_hol_scoring_sync(self):
        """HOL_SCORING tables must match between backend and sim."""
        src = _read_sim_config()
        pattern = r"export const HOL_SCORING\s*=\s*\{([\s\S]*?)\};\s*\n"
        match = re.search(pattern, src)
        assert match, "Could not find HOL_SCORING block"
        block = match.group(1)
        for conf in [1, 2, 3]:
            win_match = re.search(
                rf"{conf}\s*:\s*\{{\s*win:\s*(\d+),\s*lose:\s*(\d+)\s*\}}", block
            )
            assert win_match, f"Could not parse HOL_SCORING conf {conf}"
            sim_win, sim_lose = int(win_match.group(1)), int(win_match.group(2))
            assert sim_win == HOL_SCORING[conf]["win"], f"HOL_SCORING[{conf}].win mismatch"
            assert sim_lose == HOL_SCORING[conf]["lose"], f"HOL_SCORING[{conf}].lose mismatch"

    def test_wanted_mult_sync(self):
        """WANTED_MULT table and overflow base must match."""
        src = _read_sim_config()
        sim_mult = _extract_js_object(src, "WANTED_MULT")
        for level in range(1, 11):
            assert sim_mult[str(level)] == WANTED_MULT[level], (
                f"WANTED_MULT[{level}] mismatch: sim={sim_mult[str(level)]}, backend={WANTED_MULT[level]}"
            )
        sim_overflow = _extract_js_scalar(src, "WANTED_OVERFLOW_BASE")
        assert sim_overflow == WANTED_OVERFLOW_BASE

    def test_notoriety_sync(self):
        """Notoriety weights and thresholds must match."""
        src = _read_sim_config()
        sim_weight = _extract_js_object(src, "NOTORIETY_WEIGHT")
        for conf in [1, 2, 3]:
            assert sim_weight[str(conf)] == NOTORIETY_WEIGHT[conf], (
                f"NOTORIETY_WEIGHT[{conf}] mismatch"
            )
        sim_up = _extract_js_scalar(src, "NOTORIETY_UP_THRESHOLD")
        sim_down = _extract_js_scalar(src, "NOTORIETY_DOWN_THRESHOLD")
        assert sim_up == NOTORIETY_UP_THRESHOLD
        assert sim_down == NOTORIETY_DOWN_THRESHOLD

    def test_economy_sync(self):
        """Ante, starting balance, and chambers must match."""
        src = _read_sim_config()
        assert _extract_js_scalar(src, "ANTE_BASE") == ANTE_BASE
        assert _extract_js_scalar(src, "STARTING_BALANCE") == STARTING_DOUBLE_DOLLARS
        assert _extract_js_scalar(src, "STARTING_CHAMBERS") == STARTING_CHAMBERS
        assert _extract_js_scalar(src, "MAX_CHAMBERS") == MAX_CHAMBERS
