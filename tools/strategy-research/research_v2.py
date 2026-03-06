#!/usr/bin/env python3
"""
Strategy Lab v2 — 50-Sample Walk-Forward Study (2012–2026)
==========================================================
Tests ONLY the signals that worked in v1 research.
Adds Fed Funds Rate (proxied by 13-week T-bill) as a context variable.
50 walk-forward samples stratified across low-rate and high-rate environments.
"""

import json
import math
import urllib.request
import statistics
import sys
from datetime import datetime, timedelta
from collections import defaultdict

# ══════════════════════════════════════════════════════════════
# DATA FETCHING
# ══════════════════════════════════════════════════════════════

def fetch_yahoo_range(symbol, start_year=2012):
    """Fetch daily OHLCV from Yahoo Finance using period1/period2."""
    p1 = int(datetime(start_year, 1, 1).timestamp())
    p2 = int(datetime(2026, 2, 21).timestamp())
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
           f"?interval=1d&period1={p1}&period2={p2}")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())

    result = data["chart"]["result"][0]
    timestamps = result["timestamp"]
    quote = result["indicators"]["quote"][0]

    candles = []
    for i, ts in enumerate(timestamps):
        c = quote["close"][i]
        if c is None:
            continue
        candles.append({
            "date": datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d"),
            "open": round(quote["open"][i] or c, 4),
            "high": round(quote["high"][i] or c, 4),
            "low": round(quote["low"][i] or c, 4),
            "close": round(c, 4),
            "volume": quote["volume"][i] or 0,
        })
    return candles


def fetch_all_data():
    print("Fetching SPY (2012–2026)...", flush=True)
    spy = fetch_yahoo_range("SPY")
    print(f"  → {len(spy)} days: {spy[0]['date']} to {spy[-1]['date']}")

    print("Fetching VIX (2012–2026)...", flush=True)
    vix_raw = fetch_yahoo_range("^VIX")
    print(f"  → {len(vix_raw)} days")

    print("Fetching 13-week T-bill / ^IRX (2012–2026)...", flush=True)
    irx_raw = fetch_yahoo_range("^IRX")
    print(f"  → {len(irx_raw)} days")

    vix_map = {v["date"]: v["close"] for v in vix_raw}
    irx_map = {v["date"]: v["close"] for v in irx_raw}

    aligned = []
    for s in spy:
        v = vix_map.get(s["date"])
        r = irx_map.get(s["date"])
        if v is not None and r is not None:
            aligned.append({**s, "vix": v, "rate": r})

    print(f"  → {len(aligned)} aligned days: {aligned[0]['date']} to {aligned[-1]['date']}")
    return aligned


# ══════════════════════════════════════════════════════════════
# INDICATOR FUNCTIONS (same as v1)
# ══════════════════════════════════════════════════════════════

def sma(values, period):
    r = [None] * len(values)
    for i in range(period - 1, len(values)):
        r[i] = sum(values[i - period + 1: i + 1]) / period
    return r


def ema(values, period):
    r = [None] * len(values)
    k = 2 / (period + 1)
    if len(values) < period:
        return r
    r[period - 1] = sum(values[:period]) / period
    for i in range(period, len(values)):
        r[i] = values[i] * k + r[i - 1] * (1 - k)
    return r


def compute_rsi(closes, period=14):
    r = [None] * len(closes)
    if len(closes) < period + 1:
        return r
    avg_gain = avg_loss = 0
    for i in range(1, period + 1):
        d = closes[i] - closes[i - 1]
        if d > 0: avg_gain += d
        else: avg_loss -= d
    avg_gain /= period
    avg_loss /= period
    r[period] = 100 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)
    for i in range(period + 1, len(closes)):
        d = closes[i] - closes[i - 1]
        avg_gain = (avg_gain * (period - 1) + max(d, 0)) / period
        avg_loss = (avg_loss * (period - 1) + max(-d, 0)) / period
        r[i] = 100 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)
    return r


def compute_atr(highs, lows, closes, period=14):
    r = [None] * len(highs)
    trs = []
    for i in range(len(highs)):
        if i == 0:
            trs.append(highs[i] - lows[i])
        else:
            trs.append(max(highs[i] - lows[i],
                           abs(highs[i] - closes[i - 1]),
                           abs(lows[i] - closes[i - 1])))
        if i >= period - 1:
            r[i] = sum(trs[i - period + 1: i + 1]) / period
    return r


def compute_realized_vol(closes, period=20):
    r = [None] * len(closes)
    log_rets = [0]
    for i in range(1, len(closes)):
        log_rets.append(math.log(closes[i] / closes[i - 1]) if closes[i] > 0 and closes[i - 1] > 0 else 0)
    for i in range(period, len(closes)):
        w = log_rets[i - period + 1: i + 1]
        mean = sum(w) / len(w)
        var = sum((x - mean) ** 2 for x in w) / (len(w) - 1)
        r[i] = math.sqrt(var) * math.sqrt(252) * 100
    return r


def compute_bollinger_pctb(closes, period=20, nstd=2):
    mid = sma(closes, period)
    pctb = [None] * len(closes)
    for i in range(period - 1, len(closes)):
        w = closes[i - period + 1: i + 1]
        std = statistics.stdev(w) if len(w) > 1 else 0
        bw = 2 * nstd * std
        pctb[i] = (closes[i] - (mid[i] - nstd * std)) / bw if bw > 0 else 0.5
    return pctb


def compute_obv(closes, volumes):
    obv = [0.0]
    for i in range(1, len(closes)):
        if closes[i] > closes[i - 1]: obv.append(obv[-1] + volumes[i])
        elif closes[i] < closes[i - 1]: obv.append(obv[-1] - volumes[i])
        else: obv.append(obv[-1])
    return obv


# ══════════════════════════════════════════════════════════════
# FEATURE COMPUTATION
# ══════════════════════════════════════════════════════════════

def compute_all_features(data):
    n = len(data)
    closes = [d["close"] for d in data]
    highs = [d["high"] for d in data]
    lows = [d["low"] for d in data]
    volumes = [d["volume"] for d in data]
    vix = [d["vix"] for d in data]
    rates = [d["rate"] for d in data]

    ma20 = sma(closes, 20)
    ma50 = sma(closes, 50)
    ema12 = ema(closes, 12)
    ema26 = ema(closes, 26)
    rsi = compute_rsi(closes, 14)
    atr = compute_atr(highs, lows, closes, 14)
    real_vol = compute_realized_vol(closes, 20)
    bb_pctb = compute_bollinger_pctb(closes, 20, 2)
    vol_sma = sma(volumes, 20)
    obv = compute_obv(closes, volumes)
    obv_sma = sma(obv, 20)

    # MACD
    macd_hist = [None] * n
    for i in range(n):
        if ema12[i] is not None and ema26[i] is not None:
            macd_line_val = ema12[i] - ema26[i]
            # Approximate signal
            macd_vals = []
            for j in range(max(0, i - 30), i + 1):
                if ema12[j] is not None and ema26[j] is not None:
                    macd_vals.append(ema12[j] - ema26[j])
            if len(macd_vals) >= 9:
                sig = ema(macd_vals, 9)[-1]
            else:
                sig = macd_vals[-1] if macd_vals else 0
            macd_hist[i] = macd_line_val - (sig or 0)

    features = []
    for i in range(n):
        fwd_5d = (data[i + 5]["close"] / closes[i] - 1) * 100 if i + 5 < n else None
        fwd_10d = (data[i + 10]["close"] / closes[i] - 1) * 100 if i + 10 < n else None

        roc5 = (closes[i] / closes[i - 5] - 1) * 100 if i >= 5 else 0
        roc10 = (closes[i] / closes[i - 10] - 1) * 100 if i >= 10 else 0

        # Consecutive days
        consec = 0
        if i > 0:
            d = 1 if closes[i] > closes[i - 1] else -1
            consec = d
            for j in range(i - 1, max(i - 10, 0), -1):
                if j == 0: break
                if (closes[j] > closes[j - 1] and d > 0) or (closes[j] < closes[j - 1] and d < 0):
                    consec += d
                else:
                    break

        lookback = min(i + 1, 252)
        high_52w = max(highs[i - lookback + 1: i + 1]) if lookback > 0 else highs[i]
        dist_from_high = (closes[i] / high_52w - 1) * 100

        vol_ratio = volumes[i] / vol_sma[i] if vol_sma[i] and vol_sma[i] > 0 else 1.0
        obv_trend = (obv[i] / obv_sma[i] - 1) * 100 if obv_sma[i] and obv_sma[i] != 0 else 0
        vrp = vix[i] - real_vol[i] if real_vol[i] is not None else None
        atr_pct = atr[i] / closes[i] * 100 if atr[i] else None
        price_vs_ma20 = (closes[i] / ma20[i] - 1) * 100 if ma20[i] else 0

        features.append({
            "date": data[i]["date"],
            "close": closes[i],
            "fwd_5d": fwd_5d,
            "fwd_10d": fwd_10d,
            "rate": rates[i],
            "vix": vix[i],
            "rsi": rsi[i],
            "ma20": ma20[i],
            "ma50": ma50[i],
            "price_vs_ma20": price_vs_ma20,
            "macd_hist": macd_hist[i],
            "bb_pctb": bb_pctb[i],
            "atr_pct": atr_pct,
            "roc_5": roc5,
            "roc_10": roc10,
            "consec_days": consec,
            "dist_from_high": dist_from_high,
            "vol_ratio": vol_ratio,
            "obv_trend": obv_trend,
            "vol_risk_premium": vrp,
        })

    return features


# ══════════════════════════════════════════════════════════════
# WINNING SIGNALS ONLY (from v1 research)
# ══════════════════════════════════════════════════════════════

BUY_SIGNALS = [
    ("Price < MA20 − 2%",       lambda f: f["price_vs_ma20"] < -2,           2.281, 1.00),
    ("VIX > 20",                lambda f: f["vix"] > 20,                      1.930, 1.00),
    ("RSI < 40",                lambda f: f["rsi"] is not None and f["rsi"] < 40, 2.044, 1.00),
    ("5d momentum < −2%",       lambda f: f["roc_5"] < -2,                    1.667, 1.00),
    ("10d momentum < −3%",      lambda f: f["roc_10"] < -3,                   1.542, 1.00),
    ("OBV below MA",            lambda f: f["obv_trend"] < -2,                1.340, 0.88),
    ("MACD bearish",            lambda f: f["macd_hist"] is not None and f["macd_hist"] < 0, 0.894, 1.00),
    ("Bollinger %B < 0.1",      lambda f: f["bb_pctb"] is not None and f["bb_pctb"] < 0.1, 2.267, 0.80),
    ("ATR > 1.5%",              lambda f: f["atr_pct"] is not None and f["atr_pct"] > 1.5, 1.692, 1.00),
    ("Vol risk premium < 0",    lambda f: f["vol_risk_premium"] is not None and f["vol_risk_premium"] < 0, 1.128, 1.00),
    ("Volume > 1.5× avg",       lambda f: f["vol_ratio"] > 1.5,               1.497, 0.83),
    ("3+ down days",            lambda f: f["consec_days"] <= -3,              1.004, 1.00),
]

SELL_SIGNALS = [
    ("Near 52w high (<2%)",     lambda f: f["dist_from_high"] > -2,            1.697, 0.86),
    ("RSI > 60",                lambda f: f["rsi"] is not None and f["rsi"] > 60, 1.501, 0.86),
    ("Trend + Momentum",        lambda f: f["ma20"] is not None and f["ma50"] is not None and f["ma20"] > f["ma50"] and f["macd_hist"] is not None and f["macd_hist"] > 0, 1.028, 1.00),
    ("MACD bullish",            lambda f: f["macd_hist"] is not None and f["macd_hist"] > 0, 0.894, 1.00),
    ("Bollinger %B > 0.9",      lambda f: f["bb_pctb"] is not None and f["bb_pctb"] > 0.9, 1.129, 0.83),
]


# ══════════════════════════════════════════════════════════════
# STRATEGY ENGINE
# ══════════════════════════════════════════════════════════════

TRAILING_STOP = 0.03
MIN_SIGNALS = 2
MIN_NET_SCORE = 0.05


def run_strategy(features, start_idx, end_idx):
    """Run the decision-tree strategy on features[start_idx:end_idx+1]."""
    position = "OUT"
    cash = 10000.0
    shares = 0
    entry_price = 0
    peak_price = 0
    trades = []
    equity_curve = []

    for i in range(start_idx, min(end_idx + 1, len(features))):
        f = features[i]
        price = f["close"]

        # Score signals
        buy_score = 0
        sell_score = 0
        buy_count = 0
        sell_count = 0
        buy_reasons = []

        for name, test_fn, edge, cons in BUY_SIGNALS:
            if test_fn(f):
                buy_score += edge * cons
                buy_count += 1
                buy_reasons.append(name)

        for name, test_fn, edge, cons in SELL_SIGNALS:
            if test_fn(f):
                sell_score += edge * cons
                sell_count += 1

        # Decision
        if position == "LONG":
            peak_price = max(peak_price, price)
            if price < peak_price * (1 - TRAILING_STOP):
                cash += shares * price
                pnl = (price / entry_price - 1) * 100
                trades.append({"pnl": pnl, "action": "SELL", "date": f["date"]})
                position = "OUT"
                shares = 0
            elif sell_score > buy_score and sell_score > MIN_NET_SCORE and sell_count >= MIN_SIGNALS:
                cash += shares * price
                pnl = (price / entry_price - 1) * 100
                trades.append({"pnl": pnl, "action": "SELL", "date": f["date"]})
                position = "OUT"
                shares = 0
        else:
            net = buy_score - sell_score
            if net > MIN_NET_SCORE and buy_count >= MIN_SIGNALS:
                shares = int(cash / price)
                cash -= shares * price
                entry_price = price
                peak_price = price
                position = "LONG"
                trades.append({"action": "BUY", "date": f["date"], "reasons": buy_reasons[:3]})

        equity_curve.append(cash + shares * price)

    # If still in position at end, mark-to-market
    final_equity = equity_curve[-1] if equity_curve else 10000
    total_return = (final_equity / 10000 - 1) * 100
    bh_return = (features[min(end_idx, len(features) - 1)]["close"] /
                 features[start_idx]["close"] - 1) * 100

    completed = [t for t in trades if t["action"] == "SELL"]
    wins = [t for t in completed if t["pnl"] > 0]

    # Max drawdown
    peak_eq = 0
    max_dd = 0
    for eq in equity_curve:
        if eq > peak_eq:
            peak_eq = eq
        dd = (peak_eq - eq) / peak_eq
        if dd > max_dd:
            max_dd = dd

    # Risk-adjusted return (subtract risk-free rate, annualized)
    avg_rate = sum(features[i]["rate"] for i in range(start_idx, min(end_idx + 1, len(features)))) / (end_idx - start_idx + 1)
    test_days = end_idx - start_idx + 1
    rf_return = avg_rate * test_days / 252  # approximate annualized → period

    return {
        "total_return": total_return,
        "bh_return": bh_return,
        "excess_return": total_return - bh_return,
        "rf_return": rf_return,
        "excess_over_rf": total_return - rf_return,
        "bh_excess_over_rf": bh_return - rf_return,
        "num_trades": len(completed),
        "win_rate": len(wins) / len(completed) * 100 if completed else 0,
        "avg_win": sum(t["pnl"] for t in wins) / len(wins) if wins else 0,
        "avg_loss": sum(t["pnl"] for t in completed if t["pnl"] <= 0) / max(len(completed) - len(wins), 1),
        "max_drawdown": max_dd * 100,
        "avg_rate": avg_rate,
        "test_days": test_days,
    }


# ══════════════════════════════════════════════════════════════
# SAMPLE GENERATION
# ══════════════════════════════════════════════════════════════

def generate_samples(features, n_samples=50):
    """
    Generate 50 walk-forward samples stratified by interest rate environment.
    Train: 120 trading days (~6 months), Test: 60 trading days (~3 months).
    Intentionally sample from low-rate and high-rate periods.
    """
    TRAIN_LEN = 120
    TEST_LEN = 60
    TOTAL_NEEDED = TRAIN_LEN + TEST_LEN  # 180 days

    n = len(features)
    if n < TOTAL_NEEDED + 50:
        print(f"  ERROR: Not enough data ({n} days)")
        return []

    # Classify each possible starting point by its average rate during the test period
    candidates = []
    for start in range(0, n - TOTAL_NEEDED, 5):  # step by 5 for efficiency
        test_start = start + TRAIN_LEN
        test_end = test_start + TEST_LEN - 1
        avg_rate = sum(features[i]["rate"] for i in range(test_start, test_end + 1)) / TEST_LEN
        candidates.append({
            "train_start": start,
            "train_end": start + TRAIN_LEN - 1,
            "test_start": test_start,
            "test_end": test_end,
            "avg_rate": avg_rate,
            "train_dates": f"{features[start]['date']} → {features[start + TRAIN_LEN - 1]['date']}",
            "test_dates": f"{features[test_start]['date']} → {features[test_end]['date']}",
        })

    # Sort by rate
    candidates.sort(key=lambda x: x["avg_rate"])

    # Stratified sampling: 25 from low-rate, 25 from high-rate
    # Split at median rate
    median_rate = candidates[len(candidates) // 2]["avg_rate"]
    low_rate = [c for c in candidates if c["avg_rate"] < median_rate]
    high_rate = [c for c in candidates if c["avg_rate"] >= median_rate]

    samples = []

    # From low-rate pool, pick 25 evenly spaced
    step = max(1, len(low_rate) // 25)
    for i in range(0, len(low_rate), step):
        if len(samples) >= 25:
            break
        samples.append(low_rate[i])

    # From high-rate pool, pick 25 evenly spaced
    step = max(1, len(high_rate) // 25)
    for i in range(0, len(high_rate), step):
        if len(samples) >= 50:
            break
        samples.append(high_rate[i])

    # Pad if needed
    while len(samples) < 50 and candidates:
        import random
        c = random.choice(candidates)
        if c not in samples:
            samples.append(c)

    return samples[:50]


# ══════════════════════════════════════════════════════════════
# SIGNAL-LEVEL ANALYSIS PER RATE ENVIRONMENT
# ══════════════════════════════════════════════════════════════

def analyze_signal_by_rate(features, signal_name, test_fn, rate_bucket, horizon="fwd_5d"):
    """Measure a signal's edge within a rate bucket."""
    fire_returns = []
    no_fire_returns = []

    for f in features:
        if f.get("rate_bucket") != rate_bucket:
            continue
        ret = f.get(horizon)
        if ret is None:
            continue
        if test_fn(f):
            fire_returns.append(ret)
        else:
            no_fire_returns.append(ret)

    if not fire_returns or len(fire_returns) < 10:
        return None

    avg_fire = sum(fire_returns) / len(fire_returns)
    avg_no = sum(no_fire_returns) / len(no_fire_returns) if no_fire_returns else 0
    hit = len([r for r in fire_returns if r > 0]) / len(fire_returns)

    return {
        "edge": avg_fire - avg_no,
        "avg_return": avg_fire,
        "hit_rate": hit,
        "n_fires": len(fire_returns),
    }


# ══════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════

def main():
    print("=" * 80)
    print("STRATEGY LAB v2 — 50-SAMPLE WALK-FORWARD STUDY (2012–2026)")
    print("WINNING SIGNALS ONLY + FED RATE ANALYSIS")
    print("=" * 80)

    # 1. Fetch data
    data = fetch_all_data()

    # 2. Compute features
    print("\nComputing features...", flush=True)
    features = compute_all_features(data)
    print(f"  → {len(features)} days with features")

    # Show rate distribution
    rates = [f["rate"] for f in features]
    print(f"\n  Rate distribution:")
    print(f"    Min: {min(rates):.2f}%  Max: {max(rates):.2f}%  Median: {sorted(rates)[len(rates)//2]:.2f}%")

    # Bucket features by rate environment
    median_rate = sorted(rates)[len(rates) // 2]
    for f in features:
        f["rate_bucket"] = "low" if f["rate"] < median_rate else "high"

    # 3. Generate 50 samples
    print(f"\nGenerating 50 walk-forward samples (train=120d, test=60d)...")
    samples = generate_samples(features, 50)
    print(f"  → {len(samples)} samples generated")

    low_samples = [s for s in samples if s["avg_rate"] < median_rate]
    high_samples = [s for s in samples if s["avg_rate"] >= median_rate]
    print(f"  → {len(low_samples)} low-rate samples (avg rate < {median_rate:.2f}%)")
    print(f"  → {len(high_samples)} high-rate samples (avg rate >= {median_rate:.2f}%)")

    # 4. Run strategy on all 50 samples
    print(f"\n{'=' * 80}")
    print("RUNNING 50 WALK-FORWARD BACKTESTS")
    print(f"{'=' * 80}")

    all_results = []
    for i, s in enumerate(samples):
        result = run_strategy(features, s["test_start"], s["test_end"])
        result["sample_id"] = i + 1
        result["avg_rate"] = s["avg_rate"]
        result["rate_env"] = "LOW" if s["avg_rate"] < median_rate else "HIGH"
        result["test_dates"] = s["test_dates"]
        result["train_dates"] = s["train_dates"]
        all_results.append(result)

    # 5. Report — all samples
    print(f"\n{'=' * 80}")
    print("INDIVIDUAL SAMPLE RESULTS")
    print(f"{'=' * 80}")
    print(f"  {'#':>3s}  {'Rate':>5s}  {'Env':4s}  {'Strat':>7s}  {'B&H':>7s}  {'Excess':>7s}  {'RF':>5s}  "
          f"{'vs RF':>7s}  {'Trades':>6s}  {'Win%':>5s}  {'MaxDD':>6s}  Test Period")

    for r in sorted(all_results, key=lambda x: x["avg_rate"]):
        print(f"  {r['sample_id']:3d}  {r['avg_rate']:5.2f}  {r['rate_env']:4s}  "
              f"{r['total_return']:+7.2f}  {r['bh_return']:+7.2f}  {r['excess_return']:+7.2f}  "
              f"{r['rf_return']:5.2f}  {r['excess_over_rf']:+7.2f}  "
              f"{r['num_trades']:6d}  {r['win_rate']:5.0f}  {r['max_drawdown']:6.2f}  {r['test_dates']}")

    # 6. Aggregate by rate environment
    print(f"\n{'=' * 80}")
    print("AGGREGATE RESULTS BY RATE ENVIRONMENT")
    print(f"{'=' * 80}")

    for env_name, env_results in [("LOW-RATE", [r for r in all_results if r["rate_env"] == "LOW"]),
                                   ("HIGH-RATE", [r for r in all_results if r["rate_env"] == "HIGH"])]:
        if not env_results:
            continue

        n = len(env_results)
        avg_ret = sum(r["total_return"] for r in env_results) / n
        avg_bh = sum(r["bh_return"] for r in env_results) / n
        avg_excess = sum(r["excess_return"] for r in env_results) / n
        avg_rf = sum(r["rf_return"] for r in env_results) / n
        avg_vs_rf = sum(r["excess_over_rf"] for r in env_results) / n
        avg_wr = sum(r["win_rate"] for r in env_results) / n
        avg_dd = sum(r["max_drawdown"] for r in env_results) / n
        avg_trades = sum(r["num_trades"] for r in env_results) / n
        avg_rate = sum(r["avg_rate"] for r in env_results) / n

        # Beat buy-and-hold rate
        beat_bh = len([r for r in env_results if r["excess_return"] > 0]) / n * 100

        # Positive return rate
        positive = len([r for r in env_results if r["total_return"] > 0]) / n * 100

        # Beat risk-free rate
        beat_rf = len([r for r in env_results if r["excess_over_rf"] > 0]) / n * 100

        median_ret = sorted([r["total_return"] for r in env_results])[n // 2]
        median_excess = sorted([r["excess_return"] for r in env_results])[n // 2]

        print(f"\n  {env_name} ({n} samples, avg rate: {avg_rate:.2f}%):")
        print(f"    Avg strategy return:     {avg_ret:+.2f}%  (median: {median_ret:+.2f}%)")
        print(f"    Avg buy & hold:          {avg_bh:+.2f}%")
        print(f"    Avg excess over B&H:     {avg_excess:+.2f}%  (median: {median_excess:+.2f}%)")
        print(f"    Avg risk-free return:    {avg_rf:.2f}%")
        print(f"    Avg excess over RF:      {avg_vs_rf:+.2f}%")
        print(f"    Beat B&H:               {beat_bh:.0f}% of samples")
        print(f"    Beat risk-free:          {beat_rf:.0f}% of samples")
        print(f"    Positive return:         {positive:.0f}% of samples")
        print(f"    Avg win rate:            {avg_wr:.0f}%")
        print(f"    Avg max drawdown:        {avg_dd:.2f}%")
        print(f"    Avg trades per period:   {avg_trades:.1f}")

    # 7. Overall aggregate
    print(f"\n  OVERALL ({len(all_results)} samples):")
    n = len(all_results)
    avg_ret = sum(r["total_return"] for r in all_results) / n
    avg_bh = sum(r["bh_return"] for r in all_results) / n
    avg_excess = sum(r["excess_return"] for r in all_results) / n
    beat_bh = len([r for r in all_results if r["excess_return"] > 0]) / n * 100
    avg_dd = sum(r["max_drawdown"] for r in all_results) / n
    avg_wr = sum(r["win_rate"] for r in all_results) / n

    print(f"    Avg strategy return:     {avg_ret:+.2f}%")
    print(f"    Avg buy & hold:          {avg_bh:+.2f}%")
    print(f"    Avg excess over B&H:     {avg_excess:+.2f}%")
    print(f"    Beat B&H:               {beat_bh:.0f}% of samples")
    print(f"    Avg win rate:            {avg_wr:.0f}%")
    print(f"    Avg max drawdown:        {avg_dd:.2f}%")

    # 8. Signal-level analysis by rate environment
    print(f"\n{'=' * 80}")
    print("SIGNAL EFFECTIVENESS BY RATE ENVIRONMENT (5-day horizon)")
    print(f"{'=' * 80}")

    print(f"\n  {'Signal':<30s}  {'Low-Rate Edge':>14s}  {'Low Hit%':>9s}  {'High-Rate Edge':>15s}  {'High Hit%':>10s}  {'Delta':>8s}")
    print(f"  {'─' * 30}  {'─' * 14}  {'─' * 9}  {'─' * 15}  {'─' * 10}  {'─' * 8}")

    for name, test_fn, edge, cons in BUY_SIGNALS:
        low = analyze_signal_by_rate(features, name, test_fn, "low")
        high = analyze_signal_by_rate(features, name, test_fn, "high")

        low_edge = f"{low['edge']:+.3f}%" if low else "  n/a"
        low_hit = f"{low['hit_rate']:.0%}" if low else "n/a"
        high_edge = f"{high['edge']:+.3f}%" if high else "   n/a"
        high_hit = f"{high['hit_rate']:.0%}" if high else "n/a"
        delta = f"{(high['edge'] if high else 0) - (low['edge'] if low else 0):+.3f}" if low and high else "  n/a"

        print(f"  {name:<30s}  {low_edge:>14s}  {low_hit:>9s}  {high_edge:>15s}  {high_hit:>10s}  {delta:>8s}")

    for name, test_fn, edge, cons in SELL_SIGNALS:
        low = analyze_signal_by_rate(features, name, test_fn, "low")
        high = analyze_signal_by_rate(features, name, test_fn, "high")

        low_edge = f"{low['edge']:+.3f}%" if low else "  n/a"
        low_hit = f"{low['hit_rate']:.0%}" if low else "n/a"
        high_edge = f"{high['edge']:+.3f}%" if high else "   n/a"
        high_hit = f"{high['hit_rate']:.0%}" if high else "n/a"
        delta = f"{(high['edge'] if high else 0) - (low['edge'] if low else 0):+.3f}" if low and high else "  n/a"

        print(f"  {name:<30s}  {low_edge:>14s}  {low_hit:>9s}  {high_edge:>15s}  {high_hit:>10s}  {delta:>8s}")

    # 9. Rate as a direct predictor
    print(f"\n{'=' * 80}")
    print("INTEREST RATE AS A DIRECT PREDICTOR")
    print(f"{'=' * 80}")

    # Bucket by rate level and measure avg forward returns
    rate_buckets = [
        ("0-0.5%",   0, 0.5),
        ("0.5-2%",   0.5, 2),
        ("2-4%",     2, 4),
        ("4-5%",     4, 5),
        ("5%+",      5, 100),
    ]

    print(f"\n  {'Rate Bucket':<12s}  {'Avg 5d Ret':>11s}  {'Avg 10d Ret':>12s}  {'Hit Rate 5d':>12s}  {'N days':>7s}  {'Avg VIX':>8s}")
    print(f"  {'─' * 12}  {'─' * 11}  {'─' * 12}  {'─' * 12}  {'─' * 7}  {'─' * 8}")

    for label, lo, hi in rate_buckets:
        bucket = [f for f in features if lo <= f["rate"] < hi and f["fwd_5d"] is not None]
        if not bucket:
            continue
        avg5 = sum(f["fwd_5d"] for f in bucket) / len(bucket)
        avg10 = sum(f["fwd_10d"] for f in bucket if f["fwd_10d"] is not None) / max(len([f for f in bucket if f["fwd_10d"] is not None]), 1)
        hit5 = len([f for f in bucket if f["fwd_5d"] > 0]) / len(bucket)
        avg_vix = sum(f["vix"] for f in bucket) / len(bucket)
        print(f"  {label:<12s}  {avg5:+11.3f}%  {avg10:+12.3f}%  {hit5:12.0%}  {len(bucket):7d}  {avg_vix:8.1f}")

    # 10. Worst samples — what went wrong?
    print(f"\n{'=' * 80}")
    print("WORST 5 SAMPLES — WHAT WENT WRONG?")
    print(f"{'=' * 80}")

    worst = sorted(all_results, key=lambda x: x["excess_return"])[:5]
    for r in worst:
        print(f"\n  Sample #{r['sample_id']} — {r['test_dates']}")
        print(f"    Rate env: {r['rate_env']} ({r['avg_rate']:.2f}%)  |  Strategy: {r['total_return']:+.2f}%  |  B&H: {r['bh_return']:+.2f}%  |  Excess: {r['excess_return']:+.2f}%")
        print(f"    Trades: {r['num_trades']}  |  Win rate: {r['win_rate']:.0f}%  |  Max DD: {r['max_drawdown']:.2f}%")

    # 11. Best samples
    print(f"\n{'=' * 80}")
    print("BEST 5 SAMPLES")
    print(f"{'=' * 80}")

    best = sorted(all_results, key=lambda x: x["excess_return"], reverse=True)[:5]
    for r in best:
        print(f"\n  Sample #{r['sample_id']} — {r['test_dates']}")
        print(f"    Rate env: {r['rate_env']} ({r['avg_rate']:.2f}%)  |  Strategy: {r['total_return']:+.2f}%  |  B&H: {r['bh_return']:+.2f}%  |  Excess: {r['excess_return']:+.2f}%")
        print(f"    Trades: {r['num_trades']}  |  Win rate: {r['win_rate']:.0f}%  |  Max DD: {r['max_drawdown']:.2f}%")

    # 12. Correlation between rate level and strategy performance
    print(f"\n{'=' * 80}")
    print("RATE vs STRATEGY PERFORMANCE CORRELATION")
    print(f"{'=' * 80}")

    rate_vals = [r["avg_rate"] for r in all_results]
    excess_vals = [r["excess_return"] for r in all_results]
    ret_vals = [r["total_return"] for r in all_results]

    # Simple correlation
    n = len(rate_vals)
    mean_r = sum(rate_vals) / n
    mean_e = sum(excess_vals) / n
    mean_ret = sum(ret_vals) / n
    cov_re = sum((rate_vals[i] - mean_r) * (excess_vals[i] - mean_e) for i in range(n)) / n
    std_r = math.sqrt(sum((r - mean_r) ** 2 for r in rate_vals) / n)
    std_e = math.sqrt(sum((e - mean_e) ** 2 for e in excess_vals) / n)
    corr_excess = cov_re / (std_r * std_e) if std_r > 0 and std_e > 0 else 0

    cov_rret = sum((rate_vals[i] - mean_r) * (ret_vals[i] - mean_ret) for i in range(n)) / n
    std_ret = math.sqrt(sum((r - mean_ret) ** 2 for r in ret_vals) / n)
    corr_return = cov_rret / (std_r * std_ret) if std_r > 0 and std_ret > 0 else 0

    print(f"  Correlation (rate vs excess return over B&H): {corr_excess:+.3f}")
    print(f"  Correlation (rate vs absolute strategy return): {corr_return:+.3f}")
    if abs(corr_excess) > 0.3:
        direction = "better" if corr_excess > 0 else "worse"
        print(f"  → Moderate correlation: strategy performs {direction} in higher-rate environments")
    elif abs(corr_excess) < 0.1:
        print(f"  → Weak/no correlation: rate environment has little effect on strategy edge")
    else:
        print(f"  → Mild correlation present but not strong")


if __name__ == "__main__":
    main()
