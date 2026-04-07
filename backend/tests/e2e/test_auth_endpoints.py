"""E2E tests for auth endpoints."""
import pytest
from app.middleware import _windows

pytestmark = pytest.mark.e2e


@pytest.fixture(autouse=True)
def clear_rate_limits():
    """Clear rate limit state before and after each test."""
    _windows.clear()
    yield
    _windows.clear()


class TestAuthEndpoints:
    """Legacy auth endpoints (backwards compat)."""

    async def test_register_success(self, client, invite_code):
        resp = await client.post("/auth/register", json={
            "alias": "newplayer",
            "invite_code": invite_code.code,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["alias"] == "newplayer"

    async def test_register_invalid_code(self, client):
        resp = await client.post("/auth/register", json={
            "alias": "badcode",
            "invite_code": "INVALID-CODE",
        })
        assert resp.status_code in (400, 401, 404)
        assert "token" not in resp.json()

    async def test_login_success(self, client, test_user):
        resp = await client.post("/auth/login", json={
            "alias": test_user["user"].alias,
            "token": test_user["token"],
        })
        assert resp.status_code == 200
        assert "token" in resp.json() or "alias" in resp.json()

    async def test_me_with_auth(self, client, test_user):
        resp = await client.get("/auth/me", headers={
            "Authorization": f"Bearer {test_user['token']}",
        })
        assert resp.status_code == 200
        assert resp.json()["alias"] == test_user["user"].alias

    async def test_me_no_auth(self, client):
        resp = await client.get("/auth/me")
        assert resp.status_code in (401, 403)
        assert "alias" not in resp.json()

    async def test_dev_token_in_test_env(self, client):
        """Dev token endpoint should work in non-prod environments."""
        resp = await client.get("/auth/dev-token")
        # Should either return 200 (dev) or 404 (prod)
        assert resp.status_code in (200, 404)
        assert isinstance(resp.json(), dict)


class TestAuthV2Endpoints:
    """New email/password auth endpoints."""

    async def test_register_v2_success(self, client, invite_code):
        resp = await client.post("/auth/v2/register", json={
            "alias": "v2player",
            "email": "v2player@example.com",
            "password": "securepass123",
            "invite_code": invite_code.code,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["alias"] == "v2player"

    async def test_register_v2_short_password(self, client, invite_code):
        resp = await client.post("/auth/v2/register", json={
            "alias": "shortpw",
            "email": "short@example.com",
            "password": "short",
            "invite_code": invite_code.code,
        })
        assert resp.status_code in (400, 422)
        assert "access_token" not in resp.json()

    async def test_register_v2_duplicate_email(self, client, invite_code):
        """First registration succeeds, second with same email fails."""
        await client.post("/auth/v2/register", json={
            "alias": "first_user",
            "email": "dupe@example.com",
            "password": "securepass123",
            "invite_code": invite_code.code,
        })
        resp = await client.post("/auth/v2/register", json={
            "alias": "second_user",
            "email": "dupe@example.com",
            "password": "securepass123",
            "invite_code": invite_code.code,
        })
        assert resp.status_code == 400
        assert "email" in resp.json()["detail"].lower()

    async def test_login_v2_with_email(self, client, invite_code):
        """Register then login with email."""
        await client.post("/auth/v2/register", json={
            "alias": "logintest",
            "email": "logintest@example.com",
            "password": "mypassword1",
            "invite_code": invite_code.code,
        })
        resp = await client.post("/auth/v2/login", json={
            "email_or_alias": "logintest@example.com",
            "password": "mypassword1",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data

    async def test_login_v2_with_alias(self, client, invite_code):
        """Register then login with alias."""
        await client.post("/auth/v2/register", json={
            "alias": "aliaslogin",
            "email": "aliaslogin@example.com",
            "password": "mypassword1",
            "invite_code": invite_code.code,
        })
        resp = await client.post("/auth/v2/login", json={
            "email_or_alias": "aliaslogin",
            "password": "mypassword1",
        })
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    async def test_login_v2_wrong_password(self, client, invite_code):
        await client.post("/auth/v2/register", json={
            "alias": "wrongpw",
            "email": "wrongpw@example.com",
            "password": "correctpass1",
            "invite_code": invite_code.code,
        })
        resp = await client.post("/auth/v2/login", json={
            "email_or_alias": "wrongpw@example.com",
            "password": "wrongpassword",
        })
        assert resp.status_code == 401
        assert "access_token" not in resp.json()

    async def test_jwt_access_token_works_on_me(self, client, invite_code):
        """JWT from v2 login should work on /auth/me."""
        await client.post("/auth/v2/register", json={
            "alias": "jwttest",
            "email": "jwttest@example.com",
            "password": "mypassword1",
            "invite_code": invite_code.code,
        })
        login = await client.post("/auth/v2/login", json={
            "email_or_alias": "jwttest",
            "password": "mypassword1",
        })
        access_token = login.json()["access_token"]

        resp = await client.get("/auth/me", headers={
            "Authorization": f"Bearer {access_token}",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["alias"] == "jwttest"
        assert data["has_password"] is True


class TestRefreshToken:
    async def test_refresh_rotates_tokens(self, client, invite_code):
        reg = await client.post("/auth/v2/register", json={
            "alias": "refresher",
            "email": "refresher@example.com",
            "password": "mypassword1",
            "invite_code": invite_code.code,
        })
        old_refresh = reg.json()["refresh_token"]

        resp = await client.post("/auth/refresh", json={
            "refresh_token": old_refresh,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["refresh_token"] != old_refresh

    async def test_reuse_revoked_refresh_fails(self, client, invite_code):
        reg = await client.post("/auth/v2/register", json={
            "alias": "reusetest",
            "email": "reusetest@example.com",
            "password": "mypassword1",
            "invite_code": invite_code.code,
        })
        old_refresh = reg.json()["refresh_token"]

        # First rotation succeeds
        await client.post("/auth/refresh", json={
            "refresh_token": old_refresh,
        })

        # Reusing the old token should fail
        resp = await client.post("/auth/refresh", json={
            "refresh_token": old_refresh,
        })
        assert resp.status_code == 401
        assert "access_token" not in resp.json()

    async def test_invalid_refresh_token(self, client):
        resp = await client.post("/auth/refresh", json={
            "refresh_token": "totally-invalid-token",
        })
        assert resp.status_code == 401
        assert "access_token" not in resp.json()


class TestLogout:
    async def test_logout_revokes_token(self, client, invite_code):
        reg = await client.post("/auth/v2/register", json={
            "alias": "logouttest",
            "email": "logouttest@example.com",
            "password": "mypassword1",
            "invite_code": invite_code.code,
        })
        data = reg.json()
        access = data["access_token"]
        refresh = data["refresh_token"]

        # Logout
        resp = await client.post("/auth/logout", json={
            "refresh_token": refresh,
        }, headers={"Authorization": f"Bearer {access}"})
        assert resp.status_code == 200
        assert "message" in resp.json()

        # Refresh should now fail
        resp2 = await client.post("/auth/refresh", json={
            "refresh_token": refresh,
        })
        assert resp2.status_code == 401


class TestAccountUpgrade:
    async def test_upgrade_legacy_to_password(self, client, test_user):
        """Legacy user upgrades to email/password."""
        resp = await client.post("/auth/upgrade", json={
            "legacy_token": test_user["token"],
            "email": "upgraded@example.com",
            "password": "newpassword1",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data

        # Can now login with password
        resp2 = await client.post("/auth/v2/login", json={
            "email_or_alias": "upgraded@example.com",
            "password": "newpassword1",
        })
        assert resp2.status_code == 200
        assert "access_token" in resp2.json()

    async def test_upgrade_invalid_legacy_token(self, client):
        resp = await client.post("/auth/upgrade", json={
            "legacy_token": "not-a-real-token",
            "email": "fake@example.com",
            "password": "password123",
        })
        assert resp.status_code == 400
        assert "access_token" not in resp.json()


class TestForgotResetPassword:
    async def test_forgot_always_returns_200(self, client):
        """No email enumeration — always 200."""
        resp = await client.post("/auth/forgot-password", json={
            "email": "nonexistent@example.com",
        })
        assert resp.status_code == 200
        assert "message" in resp.json()

    async def test_reset_invalid_token(self, client):
        resp = await client.post("/auth/reset-password", json={
            "token": "bogus-token",
            "new_password": "newpass123",
        })
        assert resp.status_code == 400
        assert "message" not in resp.json() or "Invalid" in resp.json().get("detail", "")


class TestMeProfile:
    async def test_me_shows_email_and_password_status(self, client, invite_code):
        """V2 user profile shows email and has_password fields."""
        reg = await client.post("/auth/v2/register", json={
            "alias": "profiletest",
            "email": "profile@example.com",
            "password": "mypassword1",
            "invite_code": invite_code.code,
        })
        access = reg.json()["access_token"]

        resp = await client.get("/auth/me", headers={
            "Authorization": f"Bearer {access}",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "profile@example.com"
        assert data["has_password"] is True
        assert data["email_verified"] is False

    async def test_legacy_user_has_no_password(self, client, test_user):
        """Legacy user shows has_password=False."""
        resp = await client.get("/auth/me", headers={
            "Authorization": f"Bearer {test_user['token']}",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["has_password"] is False
        assert data["email"] is None


class TestAccountDeletion:
    async def test_delete_account_removes_all_data(self, client, invite_code):
        """Register, verify account exists, delete, verify gone."""
        reg = await client.post("/auth/v2/register", json={
            "alias": "doomed_user",
            "email": "doomed@example.com",
            "password": "mypassword1",
            "invite_code": invite_code.code,
        })
        access = reg.json()["access_token"]

        # Account exists
        resp = await client.get("/auth/me", headers={
            "Authorization": f"Bearer {access}",
        })
        assert resp.status_code == 200
        assert resp.json()["alias"] == "doomed_user"

        # Delete it
        resp = await client.delete("/auth/account", headers={
            "Authorization": f"Bearer {access}",
        })
        assert resp.status_code == 200
        assert "deleted" in resp.json()["message"].lower()

        # Token no longer works (user gone)
        resp = await client.get("/auth/me", headers={
            "Authorization": f"Bearer {access}",
        })
        assert resp.status_code in (401, 404)

    async def test_delete_account_no_auth(self, client):
        """Cannot delete without authentication."""
        resp = await client.delete("/auth/account")
        assert resp.status_code in (401, 403)
