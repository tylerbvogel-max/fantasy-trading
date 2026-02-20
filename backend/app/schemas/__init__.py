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

    class Config:
        from_attributes = True


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


# ── Bounty / Time Attack ──

class SpyCandlePoint(BaseModel):
    timestamp: int
    close: float


class BountyWindowResponse(BaseModel):
    id: UUID
    window_date: date
    window_index: int
    start_time: datetime
    end_time: datetime
    prediction_cutoff: datetime | None = None
    spy_open_price: float | None = None
    spy_close_price: float | None = None
    result: str | None = None
    is_settled: bool = False

    class Config:
        from_attributes = True


class BountyPickResponse(BaseModel):
    id: UUID
    prediction: str
    confidence: int
    confidence_label: str
    is_correct: bool | None = None
    payout: int = 0
    wanted_level_at_pick: int = 0
    created_at: datetime
    action_type: str = "directional"
    insurance_triggered: bool = False
    base_points: int = 0
    wanted_multiplier_used: int = 1
    leverage: float = 1.0
    margin_call_triggered: bool = False


class BountyEquippedIron(BaseModel):
    iron_id: str
    name: str
    rarity: str
    description: str
    slot_number: int


class BountyStatsResponse(BaseModel):
    double_dollars: int = 0
    wanted_level: int = 0
    total_predictions: int = 0
    correct_predictions: int = 0
    accuracy_pct: float = 0.0
    best_streak: int = 0
    notoriety: float = 0.0
    chambers: int = 2
    is_busted: bool = False
    bust_count: int = 0
    margin_call_cooldown: int = 0
    equipped_irons: list[BountyEquippedIron] = []
    pending_offering: bool = False


class BountyStockStatus(BaseModel):
    symbol: str
    name: str = ""
    open_price: float | None = None
    close_price: float | None = None
    result: str | None = None
    is_settled: bool = False
    candles: list[SpyCandlePoint] = []
    my_pick: BountyPickResponse | None = None


class BountyStatusResponse(BaseModel):
    current_window: BountyWindowResponse | None = None
    previous_window: BountyWindowResponse | None = None
    my_pick: BountyPickResponse | None = None
    previous_pick: BountyPickResponse | None = None
    player_stats: BountyStatsResponse
    next_window_time: datetime | None = None
    spy_candles: list[SpyCandlePoint] = []
    stocks: list[BountyStockStatus] = []
    ante_cost: int = 75
    skip_cost: int = 25
    max_leverage: float = 2.0


class BountySubmitRequest(BaseModel):
    bounty_window_id: UUID
    prediction: str = Field(..., pattern="^(UP|DOWN|HOLD)$")
    bet_amount: int = Field(..., ge=0, le=100)
    symbol: str = "SPY"
    leverage: float = Field(1.0, ge=1.0, le=5.0)


class BountySubmitResponse(BaseModel):
    prediction: str
    bet_amount: int
    message: str
    symbol: str = "SPY"
    leverage: float = 1.0


class BountyIronFullDef(BaseModel):
    id: str
    name: str
    rarity: str
    description: str
    boost_description: str | None = None


class BountyIronDef(BaseModel):
    id: str
    name: str
    rarity: str
    description: str


class BountyIronOfferingResponse(BaseModel):
    offering_id: UUID
    irons: list[BountyIronDef]


class BountyIronPickRequest(BaseModel):
    iron_id: str


class BountySkipRequest(BaseModel):
    bounty_window_id: UUID
    symbol: str

class BountySkipResponse(BaseModel):
    skip_cost: int
    new_balance: int
    is_busted: bool = False


class BountyResetResponse(BaseModel):
    double_dollars: int
    message: str


class ConfidenceStatEntry(BaseModel):
    confidence: int
    label: str
    total: int
    correct: int
    win_rate: float


class TimeSlotStatEntry(BaseModel):
    window_index: int
    time_label: str
    total: int
    correct: int
    win_rate: float


class TickerStatEntry(BaseModel):
    symbol: str
    total: int
    correct: int
    win_rate: float


class WeeklyTrend(BaseModel):
    this_week: int
    last_week: int
    change: int


class WantedLevelProgress(BaseModel):
    current_level: int
    max_level: int
    progress_pct: float


class BountyDetailedStats(BaseModel):
    double_dollars: int = 0
    wanted_level: int = 0
    total_predictions: int = 0
    correct_predictions: int = 0
    accuracy_pct: float = 0.0
    best_streak: int = 0
    confidence_stats: list[ConfidenceStatEntry] = []
    time_slot_stats: list[TimeSlotStatEntry] = []
    ticker_stats: list[TickerStatEntry] = []
    weekly_trend: WeeklyTrend
    board_rank: int | None = None
    wanted_level_progress: WantedLevelProgress


class BountyBoardEntry(BaseModel):
    rank: int
    alias: str
    double_dollars: int
    accuracy_pct: float
    wanted_level: int
    total_predictions: int
