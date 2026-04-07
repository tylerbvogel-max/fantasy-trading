"""
NASA NPR 7150.2D Test Traceability Matrix.

Maps requirement IDs to test files/functions that verify them.
Run `python -m tests.nasa_compliance` to print the matrix.
"""

REQUIREMENT_MAP = {
    "NPR-7150-SV-01": {
        "description": "Scoring algorithm verification",
        "tests": [
            "tests/unit/test_bounty_config.py",
            "tests/unit/test_scoring.py",
            "tests/integration/test_settlement.py",
        ],
    },
    "NPR-7150-SV-02": {
        "description": "Wanted level transition safety",
        "tests": [
            "tests/unit/test_bounty_config.py::TestWantedMultiplier",
            "tests/unit/test_scoring.py::TestComputeNotorietyDelta",
            "tests/integration/test_settlement.py",
        ],
    },
    "NPR-7150-SV-03": {
        "description": "Margin call and bust logic",
        "tests": [
            "tests/unit/test_bounty_config.py::TestMarginCallChance",
            "tests/unit/test_scoring.py::TestCheckMarginCall",
            "tests/integration/test_prediction_flow.py::TestSubmitPrediction::test_margin_call_cooldown_blocks_leverage",
        ],
    },
    "NPR-7150-SV-04": {
        "description": "Hold threshold computation",
        "tests": [
            "tests/unit/test_bounty_config.py::TestComputeHoldThreshold",
        ],
    },
    "NPR-7150-SV-05": {
        "description": "Iron effect aggregation and offering",
        "tests": [
            "tests/unit/test_iron_logic.py",
        ],
    },
    "NPR-7150-SV-06": {
        "description": "Badge requirement evaluation",
        "tests": [
            "tests/unit/test_badge_logic.py",
        ],
    },
    "NPR-7150-SV-07": {
        "description": "Title requirement evaluation",
        "tests": [
            "tests/unit/test_title_logic.py",
        ],
    },
    "NPR-7150-AUTH-01": {
        "description": "Authentication and authorization (legacy + JWT + refresh tokens)",
        "tests": [
            "tests/unit/test_auth_pure.py",
            "tests/e2e/test_auth_endpoints.py::TestAuthEndpoints",
            "tests/e2e/test_auth_endpoints.py::TestAuthV2Endpoints",
            "tests/e2e/test_auth_endpoints.py::TestRefreshToken",
            "tests/e2e/test_auth_endpoints.py::TestLogout",
            "tests/e2e/test_auth_endpoints.py::TestAccountUpgrade",
            "tests/e2e/test_auth_endpoints.py::TestForgotResetPassword",
            "tests/e2e/test_auth_endpoints.py::TestMeProfile",
        ],
    },
    "NPR-7150-RL-01": {
        "description": "Rate limiting enforcement",
        "tests": [
            "tests/unit/test_middleware.py",
            "tests/e2e/test_rate_limiting.py",
        ],
    },
    "NPR-7150-ECON-01": {
        "description": "Economy balance (ante, skip cost, leverage carry)",
        "tests": [
            "tests/unit/test_bounty_config.py::TestSkipCost",
            "tests/integration/test_prediction_flow.py::TestSubmitPrediction::test_ante_deducted_first_pick_only",
            "tests/integration/test_prediction_flow.py::TestSubmitPrediction::test_leverage_carry_cost",
            "tests/integration/test_prediction_flow.py::TestSubmitSkip",
        ],
    },
    "NPR-7150-REGIME-01": {
        "description": "Market regime classification",
        "tests": [
            "tests/unit/test_regime_pure.py",
        ],
    },
    "NPR-7150-ANALYTICS-01": {
        "description": "Analytics computation correctness",
        "tests": [
            "tests/unit/test_analytics_pure.py",
            "tests/unit/test_response_formatters.py",
        ],
    },
    "NPR-7150-EVENT-01": {
        "description": "Stock event detection",
        "tests": [
            "tests/unit/test_stock_event.py",
        ],
    },
    "NPR-7150-COHESION-01": {
        "description": "Backend ↔ simulation config parity (North Star)",
        "tests": [
            "tests/unit/test_config_sync.py",
        ],
    },
}


def print_matrix():
    """Print the traceability matrix."""
    print("=" * 70)
    print("NASA NPR 7150.2D — Test Traceability Matrix")
    print("=" * 70)
    for req_id, info in REQUIREMENT_MAP.items():
        print(f"\n{req_id}: {info['description']}")
        for test in info["tests"]:
            print(f"  → {test}")
    print(f"\nTotal requirements mapped: {len(REQUIREMENT_MAP)}")
    print("=" * 70)


if __name__ == "__main__":
    print_matrix()
