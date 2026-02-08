from pydantic import BaseModel, Field
from datetime import datetime, date
from uuid import UUID


# ── Auth ──

class RegisterRequest(BaseModel):
    alias: str = Field(..., min_length=2, max_length=50)
    invite_code: str = Field(..., min_length=4, max_length=20)


class RegisterResponse(BaseModel):
    user_id: UUID
    alias: str
    token: str
    message: str


class LoginRequest(BaseModel):
    alias: str
    token: str


class LoginResponse(BaseModel):
    user_id: UUID
    alias: str
    is_admin: bool
    token: str


class UserProfile(BaseModel):
    id: UUID
    alias: str
    is_admin: bool
    created_at: datetime
    active_seasons: list["SeasonSummary"] = []

    class Config:
        from_attributes = True


# ── Seasons ──

class SeasonCreate(BaseModel):
    id: str = Field(..., max_length=20)
    name: str = Field(..., max_length=100)
    season_type: str = Field(default="open", max_length=30)
    allowed_stocks: list[str] | None = None
    start_date: datetime
    starting_cash: float = 100000.00
    description: str | None = None


class SeasonSummary(BaseModel):
    id: str
    name: str
    season_type: str
    is_active: bool
    starting_cash: float
    player_count: int = 0
    start_date: datetime
    end_date: datetime | None = None

    class Config:
        from_attributes = True


class SeasonDetail(SeasonSummary):
    allowed_stocks: list[str] | None = None
    description: str | None = None


class JoinSeasonResponse(BaseModel):
    player_season_id: UUID
    season_id: str
    cash_balance: float
    message: str


# ── Trading ──

class TradeRequest(BaseModel):
    season_id: str
    stock_symbol: str = Field(..., max_length=10)
    transaction_type: str = Field(..., pattern="^(BUY|SELL)$")
    shares: float = Field(..., gt=0)


class TradeResponse(BaseModel):
    transaction_id: UUID
    stock_symbol: str
    transaction_type: str
    shares: float
    price_per_share: float
    total_amount: float
    new_cash_balance: float
    executed_at: datetime


class TradeValidation(BaseModel):
    is_valid: bool
    stock_symbol: str
    current_price: float
    estimated_total: float
    available_cash: float | None = None
    available_shares: float | None = None
    message: str


class TransactionHistory(BaseModel):
    id: UUID
    stock_symbol: str
    transaction_type: str
    shares: float
    price_per_share: float
    total_amount: float
    executed_at: datetime

    class Config:
        from_attributes = True


# ── Portfolio ──

class HoldingResponse(BaseModel):
    stock_symbol: str
    stock_name: str = ""
    shares_owned: float
    average_purchase_price: float
    current_price: float = 0
    current_value: float = 0
    gain_loss: float = 0
    gain_loss_pct: float = 0
    weight_pct: float = 0


class PortfolioSummary(BaseModel):
    season_id: str
    season_name: str
    cash_balance: float
    holdings_value: float
    total_value: float
    percent_gain: float
    holdings: list[HoldingResponse] = []


class PortfolioHistoryPoint(BaseModel):
    date: date
    total_value: float
    percent_gain: float


# ── Stocks ──

class StockQuote(BaseModel):
    symbol: str
    name: str
    price: float | None
    price_open: float | None = None
    high: float | None = None
    low: float | None = None
    volume: int | None = None
    market_cap: int | None = None
    pe_ratio: float | None = None
    eps: float | None = None
    high_52w: float | None = None
    low_52w: float | None = None
    beta: float | None = None
    change_pct: float | None = None
    last_updated: datetime | None = None

    class Config:
        from_attributes = True


# ── Leaderboard ──

class LeaderboardEntry(BaseModel):
    rank: int
    alias: str
    total_value: float
    percent_gain: float
    holdings_count: int = 0


# ── Admin ──

class InviteCodeCreate(BaseModel):
    code: str | None = None  # Auto-generate if not provided
    max_uses: int = 1
    expires_at: datetime | None = None


class InviteCodeResponse(BaseModel):
    code: str
    max_uses: int
    times_used: int
    expires_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True
