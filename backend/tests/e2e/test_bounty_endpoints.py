"""E2E tests for bounty endpoints."""
import pytest

pytestmark = pytest.mark.e2e


class TestBountyEndpoints:
    async def test_status_requires_auth(self, client):
        resp = await client.get("/bounty/status")
        assert resp.status_code in (401, 403)
        assert "detail" in resp.json()

    async def test_status_with_auth(self, client, test_user):
        resp = await client.get("/bounty/status", headers={
            "Authorization": f"Bearer {test_user['token']}",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "player_stats" in data
        assert "next_window_time" in data

    async def test_board_alltime(self, client, test_user):
        resp = await client.get("/bounty/board?period=alltime", headers={
            "Authorization": f"Bearer {test_user['token']}",
        })
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_board_weekly(self, client, test_user):
        resp = await client.get("/bounty/board?period=weekly", headers={
            "Authorization": f"Bearer {test_user['token']}",
        })
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_badges(self, client, test_user):
        resp = await client.get("/bounty/badges", headers={
            "Authorization": f"Bearer {test_user['token']}",
        })
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_titles(self, client, test_user):
        resp = await client.get("/bounty/titles", headers={
            "Authorization": f"Bearer {test_user['token']}",
        })
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_irons_all(self, client):
        """Iron catalog is public (no auth)."""
        resp = await client.get("/bounty/irons/all")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 75

    async def test_streak(self, client, test_user):
        resp = await client.get("/bounty/streak", headers={
            "Authorization": f"Bearer {test_user['token']}",
        })
        assert resp.status_code == 200
        assert "current_streak" in resp.json()

    async def test_analytics(self, client, test_user):
        resp = await client.get("/bounty/analytics", headers={
            "Authorization": f"Bearer {test_user['token']}",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "confidence_stats" in data
        assert "leverage_stats" in data
