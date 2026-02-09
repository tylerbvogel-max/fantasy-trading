"""
Portfolio analytics: beta, alpha, and player comparison.

Beta = Cov(Rp, Rm) / Var(Rm)
Jensen's Alpha = Rp_avg - [Rf + Beta * (Rm_avg - Rf)]
"""
import httpx
from uuid import UUID
from datetime import date, datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.snapshot import PortfolioSnapshot, BenchmarkSnapshot
from app.models.player_season import PlayerSeason
from app.models.user import User
from app.models.stock import StockActive
from app.config import get_settings

settings = get_settings()

BENCHMARKS = {
    "SPY": "S&P 500",
    "IWM": "Russell 2000",
}

# ~5% annual risk-free rate, converted to daily
RISK_FREE_DAILY = 0.05 / 252

MIN_DATA_POINTS = 20


def compute_daily_returns(values: list[float]) -> list[float]:
    """Convert a series of absolute values into daily percentage returns."""
    returns = []
    for i in range(1, len(values)):
        if values[i - 1] > 0:
            returns.append((values[i] - values[i - 1]) / values[i - 1])
        else:
            returns.append(0.0)
    return returns


def calculate_beta(portfolio_returns: list[float], benchmark_returns: list[float]) -> float:
    """Beta = Cov(Rp, Rm) / Var(Rm)"""
    n = len(portfolio_returns)
    if n < 2:
        return 0.0

    mean_p = sum(portfolio_returns) / n
    mean_m = sum(benchmark_returns) / n

    cov = sum(
        (portfolio_returns[i] - mean_p) * (benchmark_returns[i] - mean_m)
        for i in range(n)
    ) / (n - 1)

    var_m = sum(
        (benchmark_returns[i] - mean_m) ** 2
        for i in range(n)
    ) / (n - 1)

    if var_m == 0:
        return 0.0
    return round(cov / var_m, 4)


def calculate_alpha(
    portfolio_returns: list[float],
    benchmark_returns: list[float],
    beta: float,
) -> float:
    """Jensen's Alpha, annualized as a percentage."""
    n = len(portfolio_returns)
    if n < 2:
        return 0.0

    rp_avg = sum(portfolio_returns) / n
    rm_avg = sum(benchmark_returns) / n

    daily_alpha = rp_avg - (RISK_FREE_DAILY + beta * (rm_avg - RISK_FREE_DAILY))
    annualized = daily_alpha * 252 * 100
    return round(annualized, 2)


def interpret_beta(beta: float, benchmark_name: str) -> str:
    if abs(beta - 1.0) < 0.05:
        return f"Your portfolio moves almost exactly in line with {benchmark_name}."
    elif beta > 1.0:
        pct = round((beta - 1) * 100)
        return f"Your portfolio is {pct}% more volatile than {benchmark_name} — it swings harder in both directions."
    else:
        pct = round((1 - beta) * 100)
        return f"Your portfolio is {pct}% less volatile than {benchmark_name} — more defensive."


def interpret_alpha(alpha: float, benchmark_name: str) -> str:
    if abs(alpha) < 0.5:
        return f"After adjusting for risk, your performance roughly matches {benchmark_name}."
    elif alpha > 0:
        return f"Your stock-picking added {alpha:.1f}% annualized return beyond what your risk level suggests vs {benchmark_name}."
    else:
        return f"After adjusting for risk, your picks trailed {benchmark_name} by {abs(alpha):.1f}% annualized. The index fund would have been the better play."


def interpret_player_beta(beta: float, alias: str) -> str:
    if abs(beta - 1.0) < 0.05:
        return f"Your portfolio moves almost exactly in line with {alias}'s."
    elif beta > 1.0:
        pct = round((beta - 1) * 100)
        return f"Your portfolio is {pct}% more volatile than {alias}'s — you're taking bigger swings."
    else:
        pct = round((1 - beta) * 100)
        return f"Your portfolio is {pct}% less volatile than {alias}'s — you're playing it safer."


def interpret_player_alpha(alpha: float, alias: str) -> str:
    if abs(alpha) < 0.5:
        return f"After adjusting for risk, you and {alias} are performing about the same."
    elif alpha > 0:
        return f"Risk-adjusted, you're outperforming {alias} by {alpha:.1f}% annualized."
    else:
        return f"Risk-adjusted, {alias} is outperforming you by {abs(alpha):.1f}% annualized."


async def get_aligned_returns(
    db: AsyncSession,
    player_season_id: UUID,
    benchmark_symbol: str,
) -> tuple[list[float], list[float], int]:
    """Load portfolio + benchmark snapshots, align by date, compute returns.
    Returns (portfolio_returns, benchmark_returns, data_points).
    """
    # Load portfolio snapshots
    port_result = await db.execute(
        select(PortfolioSnapshot)
        .where(PortfolioSnapshot.player_season_id == player_season_id)
        .order_by(PortfolioSnapshot.snapshot_date.asc())
    )
    port_snaps = {s.snapshot_date: float(s.total_value) for s in port_result.scalars().all()}

    # Load benchmark snapshots
    bench_result = await db.execute(
        select(BenchmarkSnapshot)
        .where(BenchmarkSnapshot.symbol == benchmark_symbol)
        .order_by(BenchmarkSnapshot.snapshot_date.asc())
    )
    bench_snaps = {s.snapshot_date: float(s.close_price) for s in bench_result.scalars().all()}

    # Align by date (only dates present in both)
    common_dates = sorted(set(port_snaps.keys()) & set(bench_snaps.keys()))

    if len(common_dates) < 2:
        return [], [], len(common_dates)

    port_values = [port_snaps[d] for d in common_dates]
    bench_values = [bench_snaps[d] for d in common_dates]

    port_returns = compute_daily_returns(port_values)
    bench_returns = compute_daily_returns(bench_values)

    return port_returns, bench_returns, len(port_returns)


async def get_player_aligned_returns(
    db: AsyncSession,
    my_ps_id: UUID,
    their_ps_id: UUID,
) -> tuple[list[float], list[float], int]:
    """Load two players' snapshots, align by date, compute returns."""
    my_result = await db.execute(
        select(PortfolioSnapshot)
        .where(PortfolioSnapshot.player_season_id == my_ps_id)
        .order_by(PortfolioSnapshot.snapshot_date.asc())
    )
    my_snaps = {s.snapshot_date: float(s.total_value) for s in my_result.scalars().all()}

    their_result = await db.execute(
        select(PortfolioSnapshot)
        .where(PortfolioSnapshot.player_season_id == their_ps_id)
        .order_by(PortfolioSnapshot.snapshot_date.asc())
    )
    their_snaps = {s.snapshot_date: float(s.total_value) for s in their_result.scalars().all()}

    common_dates = sorted(set(my_snaps.keys()) & set(their_snaps.keys()))

    if len(common_dates) < 2:
        return [], [], len(common_dates)

    my_values = [my_snaps[d] for d in common_dates]
    their_values = [their_snaps[d] for d in common_dates]

    return compute_daily_returns(my_values), compute_daily_returns(their_values), len(common_dates) - 1


async def get_portfolio_analytics(
    db: AsyncSession,
    user_id: UUID,
    season_id: str,
    compare_alias: str | None = None,
) -> dict:
    """Full analytics: beta/alpha vs SPY, IWM, and optionally another player."""
    from app.schemas import BenchmarkAnalytics, PlayerComparison, PortfolioAnalytics

    # Find the player's player_season
    ps_result = await db.execute(
        select(PlayerSeason).where(
            PlayerSeason.user_id == user_id,
            PlayerSeason.season_id == season_id,
        )
    )
    ps = ps_result.scalar_one_or_none()
    if not ps:
        return PortfolioAnalytics(
            season_id=season_id,
            benchmarks=[],
            insufficient_data=True,
            min_days_required=MIN_DATA_POINTS,
            days_available=0,
        )

    # Compute against each benchmark
    benchmarks = []
    max_days = 0
    for symbol, name in BENCHMARKS.items():
        port_ret, bench_ret, data_points = await get_aligned_returns(db, ps.id, symbol)
        max_days = max(max_days, data_points)

        if data_points >= MIN_DATA_POINTS:
            beta = calculate_beta(port_ret, bench_ret)
            alpha = calculate_alpha(port_ret, bench_ret, beta)
            benchmarks.append(BenchmarkAnalytics(
                benchmark=symbol,
                benchmark_name=name,
                beta=beta,
                alpha=alpha,
                data_points=data_points,
                beta_interpretation=interpret_beta(beta, name),
                alpha_interpretation=interpret_alpha(alpha, name),
            ))
        else:
            benchmarks.append(BenchmarkAnalytics(
                benchmark=symbol,
                benchmark_name=name,
                beta=0.0,
                alpha=0.0,
                data_points=data_points,
                beta_interpretation="",
                alpha_interpretation="",
            ))

    insufficient = max_days < MIN_DATA_POINTS

    # Player comparison
    player_comparison = None
    if compare_alias:
        # Resolve alias to player_season
        their_result = await db.execute(
            select(PlayerSeason)
            .join(User, PlayerSeason.user_id == User.id)
            .where(
                User.alias.ilike(compare_alias),
                PlayerSeason.season_id == season_id,
            )
        )
        their_ps = their_result.scalar_one_or_none()

        if their_ps:
            my_ret, their_ret, data_points = await get_player_aligned_returns(
                db, ps.id, their_ps.id
            )
            if data_points >= MIN_DATA_POINTS:
                beta = calculate_beta(my_ret, their_ret)
                alpha = calculate_alpha(my_ret, their_ret, beta)
                player_comparison = PlayerComparison(
                    compare_alias=compare_alias,
                    beta=beta,
                    alpha=alpha,
                    data_points=data_points,
                    beta_interpretation=interpret_player_beta(beta, compare_alias),
                    alpha_interpretation=interpret_player_alpha(alpha, compare_alias),
                )
            else:
                player_comparison = PlayerComparison(
                    compare_alias=compare_alias,
                    beta=0.0,
                    alpha=0.0,
                    data_points=data_points,
                    beta_interpretation="",
                    alpha_interpretation=f"Need {MIN_DATA_POINTS}+ overlapping trading days. Currently have {data_points}.",
                )

    return PortfolioAnalytics(
        season_id=season_id,
        benchmarks=benchmarks,
        player_comparison=player_comparison,
        insufficient_data=insufficient,
        min_days_required=MIN_DATA_POINTS,
        days_available=max_days,
    )


async def backfill_benchmark(db: AsyncSession, symbol: str, days: int = 365) -> int:
    """Fetch historical daily candles from Finnhub and populate benchmark_snapshots."""
    now = datetime.now(timezone.utc)
    to_ts = int(now.timestamp())
    from_ts = int(to_ts - days * 86400)

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"https://finnhub.io/api/v1/stock/candle",
                params={
                    "symbol": symbol,
                    "resolution": "D",
                    "from": from_ts,
                    "to": to_ts,
                    "token": settings.finnhub_api_key,
                },
                timeout=30.0,
            )
            if resp.status_code != 200:
                return 0
            data = resp.json()
        except httpx.RequestError:
            return 0

    if data.get("s") != "ok" or "c" not in data or "t" not in data:
        return 0

    closes = data["c"]
    timestamps = data["t"]

    # Get existing dates to avoid duplicates
    existing_result = await db.execute(
        select(BenchmarkSnapshot.snapshot_date).where(BenchmarkSnapshot.symbol == symbol)
    )
    existing_dates = {row[0] for row in existing_result.all()}

    added = 0
    for close_price, ts in zip(closes, timestamps):
        snap_date = date.fromtimestamp(ts)
        if snap_date not in existing_dates:
            db.add(BenchmarkSnapshot(
                symbol=symbol,
                snapshot_date=snap_date,
                close_price=close_price,
            ))
            added += 1

    await db.commit()
    return added
