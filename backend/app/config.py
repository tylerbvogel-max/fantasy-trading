from pydantic_settings import BaseSettings
from pydantic import field_validator
from functools import lru_cache


class Settings(BaseSettings):
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
    token_expiry_days: int = 90

    # Finnhub
    finnhub_api_key: str = ""
    price_refresh_interval_minutes: int = 15
    price_staleness_threshold_seconds: int = 300  # 5 minutes

    # App
    default_starting_cash: float = 100000.00

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
