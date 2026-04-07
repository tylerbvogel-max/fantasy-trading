from pydantic_settings import BaseSettings
from pydantic import field_validator
from functools import lru_cache


class Settings(BaseSettings):
    # Environment: "dev", "prod", "test"
    environment: str = "dev"

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/fantasy_trading"

    @field_validator("database_url", mode="before")
    @classmethod
    def fix_db_scheme(cls, v: str) -> str:
        # Render provides postgresql://, SQLAlchemy async needs postgresql+asyncpg://
        if v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    # Auth
    secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 90
    require_invite_code: bool = True

    # Email (Resend)
    resend_api_key: str = ""
    app_url: str = "http://localhost:8000"
    email_from: str = "Bounty Hunter <noreply@bountyhunter.game>"

    # Finnhub
    finnhub_api_key: str = ""

    # News & Regime Detection
    news_api_key: str = ""
    anthropic_api_key: str = ""
    price_refresh_interval_minutes: int = 15
    price_staleness_threshold_seconds: int = 300  # 5 minutes

    # App
    default_starting_cash: float = 100000.00

    # Bounty window duration (minutes): 2 for dev, 120 for production
    bounty_window_minutes: int = 2

    # CORS: comma-separated allowed origins (empty = allow all in dev)
    cors_origins: str = ""

    class Config:
        env_file = ".env"

    @property
    def is_prod(self) -> bool:
        return self.environment == "prod"

    @property
    def allowed_origins(self) -> list[str]:
        if self.cors_origins:
            return [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        if self.is_prod:
            return []  # No wildcard in prod — must be explicitly set
        return ["*"]


@lru_cache()
def get_settings() -> Settings:
    return Settings()
