"""E2E tests for rate limiting middleware."""
import pytest
from app.middleware import _windows

pytestmark = pytest.mark.e2e


@pytest.fixture(autouse=True)
def clear_rate_limits():
    """Clear rate limit state before and after each test."""
    _windows.clear()
    yield
    _windows.clear()


class TestRateLimiting:
    async def test_health_exempt(self, client):
        """Health check is never rate limited."""
        for _ in range(200):
            resp = await client.get("/health")
        assert resp.status_code == 200
        assert isinstance(resp.json(), dict)

    async def test_auth_tier_blocks_after_10(self, client, invite_code):
        """Auth endpoints limited to 10/min."""
        for i in range(10):
            await client.post("/auth/register", json={
                "alias": f"ratelim_{i}",
                "invite_code": invite_code.code,
            })

        resp = await client.post("/auth/register", json={
            "alias": "ratelim_11",
            "invite_code": invite_code.code,
        })
        assert resp.status_code == 429
        assert "Rate limit" in resp.json()["detail"]
