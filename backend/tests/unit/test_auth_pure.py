"""Unit tests for pure auth functions."""
import uuid
import pytest

from app.services.auth_service import (
    generate_token, hash_token, hash_password, verify_password,
    create_access_token, decode_access_token, validate_password,
)

pytestmark = pytest.mark.unit


class TestGenerateToken:
    def test_returns_string(self):
        token = generate_token()
        assert isinstance(token, str)
        assert len(token) > 20

    def test_unique_per_call(self):
        t1 = generate_token()
        t2 = generate_token()
        assert t1 != t2
        assert len(t1) > 0


class TestHashToken:
    def test_deterministic(self):
        h1 = hash_token("test-token")
        h2 = hash_token("test-token")
        assert h1 == h2
        assert len(h1) == 64  # SHA-256 hex

    def test_different_input_different_hash(self):
        h1 = hash_token("token-a")
        h2 = hash_token("token-b")
        assert h1 != h2
        assert len(h1) == len(h2)

    def test_not_same_as_input(self):
        token = "my-secret-token"
        hashed = hash_token(token)
        assert hashed != token
        assert len(hashed) == 64


class TestHashPassword:
    def test_returns_bcrypt_hash(self):
        hashed = hash_password("testpassword123")
        assert isinstance(hashed, str)
        assert hashed.startswith("$2b$")

    def test_different_calls_different_hashes(self):
        h1 = hash_password("same-password")
        h2 = hash_password("same-password")
        assert h1 != h2  # bcrypt uses random salt
        assert len(h1) > 0


class TestVerifyPassword:
    def test_correct_password_verifies(self):
        hashed = hash_password("mypassword")
        assert verify_password("mypassword", hashed) is True
        assert isinstance(hashed, str)

    def test_wrong_password_rejects(self):
        hashed = hash_password("mypassword")
        assert verify_password("wrongpassword", hashed) is False
        assert verify_password("", hashed) is False


class TestValidatePassword:
    def test_valid_password(self):
        validate_password("abcdefgh")
        validate_password("a" * 100)
        assert True  # no exception

    def test_too_short_raises(self):
        with pytest.raises(ValueError, match="at least 8"):
            validate_password("short")
        with pytest.raises(ValueError):
            validate_password("")


class TestAccessToken:
    def test_roundtrip(self):
        user_id = uuid.uuid4()
        token = create_access_token(user_id)
        decoded = decode_access_token(token)
        assert decoded == user_id
        assert isinstance(token, str)

    def test_invalid_token_returns_none(self):
        result = decode_access_token("not-a-jwt")
        assert result is None
        result2 = decode_access_token("")
        assert result2 is None

    def test_tampered_token_returns_none(self):
        user_id = uuid.uuid4()
        token = create_access_token(user_id)
        tampered = token[:-5] + "XXXXX"
        result = decode_access_token(tampered)
        assert result is None
        assert decode_access_token(token) == user_id
