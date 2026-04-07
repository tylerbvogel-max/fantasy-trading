"""Unit tests for title requirement checking."""
import pytest
from unittest.mock import MagicMock

from app.services.bounty_service import _check_title_requirements

pytestmark = pytest.mark.unit


def _mock_stats(**kwargs):
    stats = MagicMock()
    stats.lifetime_dd_earned = kwargs.get("lifetime_dd_earned", 0)
    stats.best_run_score = kwargs.get("best_run_score", 0)
    return stats


def _mock_run(peak_wanted_level=1, accuracy=0.5):
    run = MagicMock()
    run.peak_wanted_level = peak_wanted_level
    run.accuracy = accuracy
    return run


class TestCheckTitleRequirements:
    def test_runs_at_level_5(self):
        runs = [_mock_run(peak_wanted_level=5), _mock_run(peak_wanted_level=6)]
        stats = _mock_stats()
        assert _check_title_requirements({"runs_at_level_5": 2}, stats, runs, set(), set()) is True
        assert _check_title_requirements({"runs_at_level_5": 3}, stats, runs, set(), set()) is False

    def test_runs_at_level_8(self):
        runs = [_mock_run(peak_wanted_level=8)]
        stats = _mock_stats()
        assert _check_title_requirements({"runs_at_level_8": 1}, stats, runs, set(), set()) is True
        assert _check_title_requirements({"runs_at_level_8": 2}, stats, runs, set(), set()) is False

    def test_accuracy_over_runs(self):
        runs = [_mock_run(accuracy=0.7), _mock_run(accuracy=0.8)]
        stats = _mock_stats()
        req = {"accuracy_over_runs": {"min_runs": 2, "min_accuracy": 0.7}}
        assert _check_title_requirements(req, stats, runs, set(), set()) is True
        req2 = {"accuracy_over_runs": {"min_runs": 2, "min_accuracy": 0.9}}
        assert _check_title_requirements(req2, stats, runs, set(), set()) is False

    def test_badge_required(self):
        stats = _mock_stats()
        assert _check_title_requirements({"badge": "sheriff"}, stats, [], {"sheriff"}, set()) is True
        assert _check_title_requirements({"badge": "sheriff"}, stats, [], set(), set()) is False

    def test_lifetime_dd(self):
        stats = _mock_stats(lifetime_dd_earned=50000)
        assert _check_title_requirements({"lifetime_dd": 50000}, stats, [], set(), set()) is True
        assert _check_title_requirements({"lifetime_dd": 50001}, stats, [], set(), set()) is False

    def test_badge_count(self):
        stats = _mock_stats()
        earned = {"a", "b", "c"}
        assert _check_title_requirements({"badge_count": 3}, stats, [], earned, set()) is True
        assert _check_title_requirements({"badge_count": 4}, stats, [], earned, set()) is False

    def test_best_run_score(self):
        stats = _mock_stats(best_run_score=10000)
        assert _check_title_requirements({"best_run_score": 10000}, stats, [], set(), set()) is True
        assert _check_title_requirements({"best_run_score": 10001}, stats, [], set(), set()) is False

    def test_title_prerequisite(self):
        stats = _mock_stats()
        assert _check_title_requirements({"title": "deputy"}, stats, [], set(), {"deputy"}) is True
        assert _check_title_requirements({"title": "deputy"}, stats, [], set(), set()) is False

    def test_empty_reqs_always_true(self):
        stats = _mock_stats()
        assert _check_title_requirements({}, stats, [], set(), set()) is True
        assert isinstance(_check_title_requirements({}, stats, [], set(), set()), bool)
