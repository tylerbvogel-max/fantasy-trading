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
    knowledge_score: int = 0

    class Config:
        from_attributes = True


# ── Seasons ──

class SeasonCreate(BaseModel):
    id: str = Field(..., max_length=20)
    name: str = Field(..., max_length=100)
    season_type: str = Field(default="open", max_length=30)
    mode: str = Field(default="league", max_length=20)
    allowed_stocks: list[str] | None = None
    start_date: datetime
    end_date: datetime | None = None
    starting_cash: float = 100000.00
    description: str | None = None


class SeasonSummary(BaseModel):
    id: str
    name: str
    season_type: str
    mode: str = "league"
    is_active: bool
    starting_cash: float
    player_count: int = 0
    start_date: datetime
    end_date: datetime | None = None
    max_trades_per_player: int | None = None

    class Config:
        from_attributes = True


class SeasonDetail(SeasonSummary):
    allowed_stocks: list[str] | None = None
    description: str | None = None


class PlayerSeasonCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=50)
    starting_cash: float = Field(default=100000.0, ge=10000, le=1000000)
    duration_days: int = Field(default=14, ge=1, le=31)
    max_trades_per_player: int | None = Field(default=None, ge=1, le=1000)
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


# ── Analytics ──

class BenchmarkAnalytics(BaseModel):
    benchmark: str
    benchmark_name: str
    beta: float
    alpha: float
    data_points: int
    beta_interpretation: str
    alpha_interpretation: str


class PlayerComparison(BaseModel):
    compare_alias: str
    beta: float
    alpha: float
    data_points: int
    beta_interpretation: str
    alpha_interpretation: str


class PortfolioAnalytics(BaseModel):
    season_id: str
    benchmarks: list[BenchmarkAnalytics] = []
    player_comparison: PlayerComparison | None = None
    insufficient_data: bool = False
    min_days_required: int = 20
    days_available: int = 0


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


# ── Education ──

class TopicSummary(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    fact_count: int = 0
    completed_count: int = 0
    progress_pct: float = 0.0


class FactDetail(BaseModel):
    id: str
    title: str
    explanation: str
    question: "QuizQuestionResponse | None" = None
    is_mastered: bool = False
    is_locked: bool = False
    retry_available_at: datetime | None = None


class QuizQuestionResponse(BaseModel):
    id: str
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    difficulty: int = 1


class QuizAnswerRequest(BaseModel):
    question_id: str
    selected_option: str = Field(..., pattern="^[A-D]$")


class QuizAnswerResponse(BaseModel):
    is_correct: bool
    correct_option: str
    explanation: str
    points_earned: int
    retry_available_at: datetime | None = None
    knowledge_score: int


class UserKnowledgeScore(BaseModel):
    total_score: int
    questions_answered: int
    questions_correct: int
    topics_mastered: int


# ── Education Admin ──

class TopicCreate(BaseModel):
    id: str = Field(..., max_length=50)
    name: str = Field(..., max_length=100)
    description: str = Field(..., max_length=500)
    icon: str = Field(default="book-outline", max_length=50)
    display_order: int = 0


class TopicUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    icon: str | None = None
    display_order: int | None = None
    is_active: bool | None = None


class FactCreate(BaseModel):
    id: str = Field(..., max_length=50)
    topic_id: str = Field(..., max_length=50)
    title: str = Field(..., max_length=200)
    explanation: str
    display_order: int = 0
    question_text: str
    option_a: str = Field(..., max_length=300)
    option_b: str = Field(..., max_length=300)
    option_c: str = Field(..., max_length=300)
    option_d: str = Field(..., max_length=300)
    correct_option: str = Field(..., pattern="^[A-D]$")
    difficulty: int = Field(1, ge=1, le=5)


class FactUpdate(BaseModel):
    title: str | None = None
    explanation: str | None = None
    display_order: int | None = None
    is_active: bool | None = None
    question_text: str | None = None
    option_a: str | None = None
    option_b: str | None = None
    option_c: str | None = None
    option_d: str | None = None
    correct_option: str | None = Field(default=None, pattern="^[A-D]$")
