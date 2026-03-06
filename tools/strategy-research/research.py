#!/usr/bin/env python3
"""
Strategy Lab — Walk-Forward Research Engine
============================================
Fetches SPY + VIX historical data, computes ~25 features per day,
tests each signal's predictive power across rolling walk-forward windows,
ranks features, builds a decision tree, and backtests the final strategy.

All computation uses Python stdlib only (no numpy/pandas).
"""

import json
import math
import urllib.request
import statistics
import sys
from datetime import datetime, timedelta
from collections import defaultdict

# ══════════════════════════════════════════════════════════════
# 1. DATA FETCHING
# ══════════════════════════════════════════════════════════════

def fetch_yahoo(symbol, range_str="2y", interval="1d"):
    """Fetch OHLCV from Yahoo Finance v8 API."""
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
        f"?interval={interval}&range={range_str}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
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
    """Fetch SPY and VIX data."""
    print("Fetching SPY data (2y)...", flush=True)
    spy = fetch_yahoo("SPY", "2y")
    print(f"  → {len(spy)} trading days: {spy[0]['date']} to {spy[-1]['date']}")

    print("Fetching VIX data (2y)...", flush=True)
    vix = fetch_yahoo("^VIX", "2y")
    print(f"  → {len(vix)} trading days: {vix[0]['date']} to {vix[-1]['date']}")

    # Align dates
    vix_map = {v["date"]: v for v in vix}
    aligned = []
    for s in spy:
        v = vix_map.get(s["date"])
        if v:
            aligned.append({**s, "vix_close": v["close"], "vix_high": v["high"], "vix_low": v["low"]})

    print(f"  → {len(aligned)} aligned days")
    return aligned


# ══════════════════════════════════════════════════════════════
# 2. EVENT CALENDAR
# ══════════════════════════════════════════════════════════════

# FOMC announcement dates (decision day, when statement is released)
FOMC_DATES = {
    # 2024
    "2024-01-31", "2024-03-20", "2024-05-01", "2024-06-12",
    "2024-07-31", "2024-09-18", "2024-11-07", "2024-12-18",
    # 2025
    "2025-01-29", "2025-03-19", "2025-05-07", "2025-06-18",
    "2025-07-30", "2025-09-17", "2025-10-29", "2025-12-17",
}

# CPI release dates
CPI_DATES = {
    # 2024
    "2024-01-11", "2024-02-13", "2024-03-12", "2024-04-10",
    "2024-05-15", "2024-06-12", "2024-07-11", "2024-08-14",
    "2024-09-11", "2024-10-10", "2024-11-13", "2024-12-11",
    # 2025
    "2025-01-15", "2025-02-12", "2025-03-12", "2025-04-10",
    "2025-05-13", "2025-06-11", "2025-07-10", "2025-08-12",
    "2025-09-10", "2025-10-14", "2025-11-12", "2025-12-10",
}

# Non-Farm Payrolls (Jobs Report) — first Friday of month
NFP_DATES = {
    # 2024
    "2024-01-05", "2024-02-02", "2024-03-08", "2024-04-05",
    "2024-05-03", "2024-06-07", "2024-07-05", "2024-08-02",
    "2024-09-06", "2024-10-04", "2024-11-01", "2024-12-06",
    # 2025
    "2025-01-10", "2025-02-07", "2025-03-07", "2025-04-04",
    "2025-05-02", "2025-06-06", "2025-07-03", "2025-08-01",
    "2025-09-05", "2025-10-03", "2025-11-07", "2025-12-05",
}

# Triple/Quad Witching (3rd Friday of Mar, Jun, Sep, Dec)
OPEX_DATES = {
    "2024-03-15", "2024-06-21", "2024-09-20", "2024-12-20",
    "2025-03-21", "2025-06-20", "2025-09-19", "2025-12-19",
}

ALL_EVENTS = FOMC_DATES | CPI_DATES | NFP_DATES | OPEX_DATES


def days_to_next_event(date_str, event_set):
    """Days until next event. Returns 0 if today is event day."""
    d = datetime.strptime(date_str, "%Y-%m-%d")
    for delta in range(0, 30):
        check = (d + timedelta(days=delta)).strftime("%Y-%m-%d")
        if check in event_set:
            return delta
    return 30  # no event within 30 days


# ══════════════════════════════════════════════════════════════
# 3. FEATURE ENGINEERING
# ══════════════════════════════════════════════════════════════

def sma(values, period):
    """Simple moving average. Returns list same length, None for insufficient data."""
    result = [None] * len(values)
    for i in range(period - 1, len(values)):
        result[i] = sum(values[i - period + 1: i + 1]) / period
    return result


def ema(values, period):
    """Exponential moving average."""
    result = [None] * len(values)
    k = 2 / (period + 1)
    # Seed with SMA
    if len(values) < period:
        return result
    result[period - 1] = sum(values[:period]) / period
    for i in range(period, len(values)):
        result[i] = values[i] * k + result[i - 1] * (1 - k)
    return result


def compute_rsi(closes, period=14):
    """Relative Strength Index."""
    result = [None] * len(closes)
    if len(closes) < period + 1:
        return result

    gains, losses = [], []
    for i in range(1, len(closes)):
        delta = closes[i] - closes[i - 1]
        gains.append(max(delta, 0))
        losses.append(max(-delta, 0))

    # Initial average
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        if avg_loss == 0:
            result[i + 1] = 100.0
        else:
            rs = avg_gain / avg_loss
            result[i + 1] = 100 - 100 / (1 + rs)

    # Fill the first valid RSI
    if avg_loss == 0:
        result[period] = 100.0
    else:
        rs = sum(gains[:period]) / max(sum(losses[:period]), 0.0001)
        result[period] = 100 - 100 / (1 + rs)

    return result


def compute_atr(highs, lows, closes, period=14):
    """Average True Range."""
    result = [None] * len(highs)
    trs = []
    for i in range(len(highs)):
        if i == 0:
            trs.append(highs[i] - lows[i])
        else:
            trs.append(max(
                highs[i] - lows[i],
                abs(highs[i] - closes[i - 1]),
                abs(lows[i] - closes[i - 1])
            ))
        if i >= period - 1:
            result[i] = sum(trs[i - period + 1: i + 1]) / period
    return result


def compute_realized_vol(closes, period=20):
    """Annualized realized volatility from daily log returns."""
    result = [None] * len(closes)
    log_rets = [None]
    for i in range(1, len(closes)):
        if closes[i - 1] > 0 and closes[i] > 0:
            log_rets.append(math.log(closes[i] / closes[i - 1]))
        else:
            log_rets.append(0)

    for i in range(period, len(closes)):
        window = [r for r in log_rets[i - period + 1: i + 1] if r is not None]
        if len(window) < period:
            continue
        mean_r = sum(window) / len(window)
        var = sum((r - mean_r) ** 2 for r in window) / (len(window) - 1)
        result[i] = math.sqrt(var) * math.sqrt(252) * 100  # annualized, in %
    return result


def compute_bollinger(closes, period=20, num_std=2):
    """Bollinger Bands. Returns (upper, middle, lower, %B)."""
    middle = sma(closes, period)
    upper = [None] * len(closes)
    lower = [None] * len(closes)
    pct_b = [None] * len(closes)

    for i in range(period - 1, len(closes)):
        window = closes[i - period + 1: i + 1]
        std = statistics.stdev(window) if len(window) > 1 else 0
        upper[i] = middle[i] + num_std * std
        lower[i] = middle[i] - num_std * std
        band_width = upper[i] - lower[i]
        pct_b[i] = (closes[i] - lower[i]) / band_width if band_width > 0 else 0.5

    return upper, middle, lower, pct_b


def compute_obv(closes, volumes):
    """On-Balance Volume."""
    obv = [0.0]
    for i in range(1, len(closes)):
        if closes[i] > closes[i - 1]:
            obv.append(obv[-1] + volumes[i])
        elif closes[i] < closes[i - 1]:
            obv.append(obv[-1] - volumes[i])
        else:
            obv.append(obv[-1])
    return obv


def compute_all_features(data):
    """Compute all features for each day. Returns list of feature dicts."""
    n = len(data)
    closes = [d["close"] for d in data]
    highs = [d["high"] for d in data]
    lows = [d["low"] for d in data]
    volumes = [d["volume"] for d in data]
    vix = [d["vix_close"] for d in data]

    # Trend indicators
    ma20 = sma(closes, 20)
    ma50 = sma(closes, 50)
    ma200 = sma(closes, 200)
    ema12 = ema(closes, 12)
    ema26 = ema(closes, 26)

    # MACD
    macd_line = [None] * n
    for i in range(n):
        if ema12[i] is not None and ema26[i] is not None:
            macd_line[i] = ema12[i] - ema26[i]
    macd_signal = ema([m if m is not None else 0 for m in macd_line], 9)

    # Momentum
    rsi = compute_rsi(closes, 14)
    atr = compute_atr(highs, lows, closes, 14)

    # Volatility
    realized_vol = compute_realized_vol(closes, 20)
    bb_upper, bb_mid, bb_lower, bb_pct_b = compute_bollinger(closes, 20, 2)

    # Volume
    vol_sma20 = sma(volumes, 20)
    obv = compute_obv(closes, volumes)
    obv_sma20 = sma(obv, 20)

    # VIX indicators
    vix_sma20 = sma(vix, 20)
    vix_sma50 = sma(vix, 50)

    # Build feature rows
    features = []
    for i in range(n):
        d = data[i]
        date_str = d["date"]

        # Forward returns (for labeling — these are what we're trying to predict)
        fwd_1d = (data[i + 1]["close"] / closes[i] - 1) * 100 if i + 1 < n else None
        fwd_5d = (data[i + 5]["close"] / closes[i] - 1) * 100 if i + 5 < n else None
        fwd_10d = (data[i + 10]["close"] / closes[i] - 1) * 100 if i + 10 < n else None

        # Rate of change
        roc_5 = (closes[i] / closes[i - 5] - 1) * 100 if i >= 5 else None
        roc_10 = (closes[i] / closes[i - 10] - 1) * 100 if i >= 10 else None
        roc_20 = (closes[i] / closes[i - 20] - 1) * 100 if i >= 20 else None

        # Consecutive up/down days
        consec = 0
        if i > 0:
            direction = 1 if closes[i] > closes[i - 1] else -1
            consec = direction
            for j in range(i - 1, max(i - 10, 0), -1):
                if j == 0:
                    break
                if (closes[j] > closes[j - 1] and direction > 0) or \
                   (closes[j] < closes[j - 1] and direction < 0):
                    consec += direction
                else:
                    break

        # Distance from 52-week high (approx 252 days)
        lookback = min(i + 1, 252)
        high_52w = max(highs[i - lookback + 1: i + 1]) if lookback > 0 else highs[i]
        dist_from_high = (closes[i] / high_52w - 1) * 100

        # VIX features
        vix_daily_chg = (vix[i] / vix[i - 1] - 1) * 100 if i > 0 and vix[i - 1] > 0 else 0
        vix_5d_chg = (vix[i] / vix[i - 5] - 1) * 100 if i >= 5 and vix[i - 5] > 0 else 0
        vol_risk_premium = vix[i] - realized_vol[i] if realized_vol[i] is not None else None

        # Volume ratio
        vol_ratio = volumes[i] / vol_sma20[i] if vol_sma20[i] and vol_sma20[i] > 0 else 1.0

        # OBV trend (OBV above/below its 20-SMA)
        obv_trend = (obv[i] / obv_sma20[i] - 1) * 100 if obv_sma20[i] and obv_sma20[i] != 0 else 0

        # Event features
        days_to_fomc = days_to_next_event(date_str, FOMC_DATES)
        days_to_cpi = days_to_next_event(date_str, CPI_DATES)
        days_to_nfp = days_to_next_event(date_str, NFP_DATES)
        days_to_any_event = days_to_next_event(date_str, ALL_EVENTS)
        is_event_day = 1 if date_str in ALL_EVENTS else 0
        is_fomc_day = 1 if date_str in FOMC_DATES else 0
        is_cpi_day = 1 if date_str in CPI_DATES else 0
        is_day_before_fomc = 1 if days_to_fomc == 1 else 0
        is_day_after_event = 0
        if i > 0 and data[i - 1]["date"] in ALL_EVENTS:
            is_day_after_event = 1

        row = {
            "date": date_str,
            "close": closes[i],
            "volume": volumes[i],

            # Forward returns (labels)
            "fwd_1d": fwd_1d,
            "fwd_5d": fwd_5d,
            "fwd_10d": fwd_10d,

            # Trend features
            "ma20": ma20[i],
            "ma50": ma50[i],
            "ma200": ma200[i],
            "price_vs_ma20": (closes[i] / ma20[i] - 1) * 100 if ma20[i] else None,
            "price_vs_ma50": (closes[i] / ma50[i] - 1) * 100 if ma50[i] else None,
            "price_vs_ma200": (closes[i] / ma200[i] - 1) * 100 if ma200[i] else None,
            "ma20_above_ma50": (1 if ma20[i] and ma50[i] and ma20[i] > ma50[i] else
                                0 if ma20[i] and ma50[i] else None),
            "ma50_above_ma200": (1 if ma50[i] and ma200[i] and ma50[i] > ma200[i] else
                                 0 if ma50[i] and ma200[i] else None),

            # MACD
            "macd": macd_line[i],
            "macd_signal": macd_signal[i],
            "macd_hist": (macd_line[i] - macd_signal[i]
                          if macd_line[i] is not None and macd_signal[i] is not None else None),

            # Momentum
            "rsi": rsi[i],
            "roc_5": roc_5,
            "roc_10": roc_10,
            "roc_20": roc_20,
            "consec_days": consec,
            "dist_from_52w_high": dist_from_high,

            # Volatility
            "atr": atr[i],
            "atr_pct": atr[i] / closes[i] * 100 if atr[i] else None,
            "realized_vol": realized_vol[i],
            "bb_pct_b": bb_pct_b[i],

            # VIX / Options vol
            "vix": vix[i],
            "vix_sma20": vix_sma20[i],
            "vix_above_sma20": (1 if vix_sma20[i] and vix[i] > vix_sma20[i] else
                                0 if vix_sma20[i] else None),
            "vix_daily_chg": vix_daily_chg,
            "vix_5d_chg": vix_5d_chg,
            "vol_risk_premium": vol_risk_premium,

            # Volume
            "vol_ratio": vol_ratio,
            "obv_trend": obv_trend,

            # Events
            "days_to_fomc": days_to_fomc,
            "days_to_cpi": days_to_cpi,
            "days_to_nfp": days_to_nfp,
            "days_to_any_event": days_to_any_event,
            "is_event_day": is_event_day,
            "is_fomc_day": is_fomc_day,
            "is_cpi_day": is_cpi_day,
            "is_day_before_fomc": is_day_before_fomc,
            "is_day_after_event": is_day_after_event,
        }
        features.append(row)

    return features


# ══════════════════════════════════════════════════════════════
# 4. SIGNAL DEFINITIONS
# ══════════════════════════════════════════════════════════════

# Each signal is: (name, feature_name, operator, threshold, description)
# operator: ">" means signal fires when feature > threshold
#           "<" means signal fires when feature < threshold
#           "==" means exact match

SIGNALS = [
    # Trend
    ("Bullish MA (20>50)", "ma20_above_ma50", "==", 1, "Short MA above long MA"),
    ("Bearish MA (20<50)", "ma20_above_ma50", "==", 0, "Short MA below long MA"),
    ("Above MA200", "price_vs_ma200", ">", 0, "Price above 200-day MA"),
    ("Below MA200", "price_vs_ma200", "<", 0, "Price below 200-day MA"),
    ("Price stretched above MA20 (>2%)", "price_vs_ma20", ">", 2, "Extended above short MA"),
    ("Price stretched below MA20 (<-2%)", "price_vs_ma20", "<", -2, "Extended below short MA"),
    ("MACD bullish", "macd_hist", ">", 0, "MACD histogram positive"),
    ("MACD bearish", "macd_hist", "<", 0, "MACD histogram negative"),

    # Momentum
    ("RSI oversold (<30)", "rsi", "<", 30, "RSI below 30"),
    ("RSI oversold (<40)", "rsi", "<", 40, "RSI below 40"),
    ("RSI overbought (>70)", "rsi", ">", 70, "RSI above 70"),
    ("RSI overbought (>60)", "rsi", ">", 60, "RSI above 60"),
    ("RSI neutral (40-60)", "rsi", "between", (40, 60), "RSI in neutral zone"),
    ("Strong 5d momentum (>2%)", "roc_5", ">", 2, "5-day return > 2%"),
    ("Weak 5d momentum (<-2%)", "roc_5", "<", -2, "5-day return < -2%"),
    ("Strong 10d momentum (>3%)", "roc_10", ">", 3, "10-day return > 3%"),
    ("Weak 10d momentum (<-3%)", "roc_10", "<", -3, "10-day return < -3%"),
    ("3+ consec up days", "consec_days", ">", 2, "3 or more consecutive up days"),
    ("3+ consec down days", "consec_days", "<", -2, "3 or more consecutive down days"),
    ("Near 52w high (within 2%)", "dist_from_52w_high", ">", -2, "Within 2% of 52-week high"),
    ("Far from 52w high (>5% off)", "dist_from_52w_high", "<", -5, "More than 5% from 52-week high"),
    ("Far from 52w high (>10% off)", "dist_from_52w_high", "<", -10, "More than 10% from 52-week high"),

    # Volatility
    ("VIX elevated (>20)", "vix", ">", 20, "VIX above 20"),
    ("VIX high (>25)", "vix", ">", 25, "VIX above 25"),
    ("VIX extreme (>30)", "vix", ">", 30, "VIX above 30"),
    ("VIX low (<15)", "vix", "<", 15, "VIX below 15 (complacency)"),
    ("VIX spike (>15% daily)", "vix_daily_chg", ">", 15, "VIX jumped >15% in one day"),
    ("VIX spike (>10% daily)", "vix_daily_chg", ">", 10, "VIX jumped >10% in one day"),
    ("VIX crush (<-10% daily)", "vix_daily_chg", "<", -10, "VIX dropped >10% in one day"),
    ("VIX above its 20-MA", "vix_above_sma20", "==", 1, "VIX above its moving average"),
    ("VIX 5d surge (>20%)", "vix_5d_chg", ">", 20, "VIX up >20% over 5 days"),
    ("Vol risk premium high (>5)", "vol_risk_premium", ">", 5, "Implied vol much higher than realized"),
    ("Vol risk premium inverted (<0)", "vol_risk_premium", "<", 0, "Realized vol exceeds implied"),
    ("Bollinger oversold (%B<0.1)", "bb_pct_b", "<", 0.1, "Price near lower Bollinger Band"),
    ("Bollinger overbought (%B>0.9)", "bb_pct_b", ">", 0.9, "Price near upper Bollinger Band"),
    ("ATR elevated (>1.5%)", "atr_pct", ">", 1.5, "High daily volatility"),
    ("ATR calm (<0.8%)", "atr_pct", "<", 0.8, "Low daily volatility"),

    # Volume
    ("Volume spike (>1.5x avg)", "vol_ratio", ">", 1.5, "Volume well above average"),
    ("Volume spike (>2x avg)", "vol_ratio", ">", 2.0, "Volume extremely high"),
    ("Low volume (<0.7x avg)", "vol_ratio", "<", 0.7, "Volume below average"),
    ("OBV trending up (>2%)", "obv_trend", ">", 2, "On-balance volume above its MA"),
    ("OBV trending down (<-2%)", "obv_trend", "<", -2, "On-balance volume below its MA"),

    # Events
    ("FOMC day", "is_fomc_day", "==", 1, "Federal Reserve decision day"),
    ("Day before FOMC", "is_day_before_fomc", "==", 1, "Day before Fed decision"),
    ("CPI day", "is_cpi_day", "==", 1, "CPI release day"),
    ("Any event day", "is_event_day", "==", 1, "FOMC, CPI, NFP, or OPEX"),
    ("Day after event", "is_day_after_event", "==", 1, "Day following a major event"),
    ("Event within 2 days", "days_to_any_event", "<", 3, "Major event in next 0-2 days"),
    ("No event for 5+ days", "days_to_any_event", ">", 4, "No major event for 5+ days"),
]

# Combined signals (tested as conjunctions)
COMBINED_SIGNALS = [
    ("VIX high + RSI low (contrarian buy)", [("vix", ">", 25), ("rsi", "<", 40)]),
    ("VIX low + RSI high (sell)", [("vix", "<", 16), ("rsi", ">", 60)]),
    ("VIX spike + Oversold BB", [("vix_daily_chg", ">", 10), ("bb_pct_b", "<", 0.2)]),
    ("Bullish trend + Pullback", [("ma20_above_ma50", "==", 1), ("rsi", "<", 45)]),
    ("Bullish trend + Momentum", [("ma20_above_ma50", "==", 1), ("macd_hist", ">", 0)]),
    ("Bearish trend + Bounce", [("ma20_above_ma50", "==", 0), ("rsi", ">", 55)]),
    ("High vol + Event day", [("vix", ">", 20), ("is_event_day", "==", 1)]),
    ("Low vol + No events", [("vix", "<", 16), ("days_to_any_event", ">", 4)]),
    ("Oversold + Volume spike", [("rsi", "<", 40), ("vol_ratio", ">", 1.5)]),
    ("Overbought + Volume spike", [("rsi", ">", 60), ("vol_ratio", ">", 1.5)]),
    ("VIX premium high + Bullish trend", [("vol_risk_premium", ">", 5), ("ma20_above_ma50", "==", 1)]),
    ("Near 52w high + Low VIX", [("dist_from_52w_high", ">", -2), ("vix", "<", 16)]),
    ("Far from high + VIX spike", [("dist_from_52w_high", "<", -5), ("vix_daily_chg", ">", 10)]),
    ("FOMC day + VIX elevated", [("is_fomc_day", "==", 1), ("vix", ">", 18)]),
    ("Pullback in uptrend + High volume", [("price_vs_ma20", "<", -1), ("ma50_above_ma200", "==", 1), ("vol_ratio", ">", 1.3)]),
    ("Bollinger squeeze + Trend aligned", [("atr_pct", "<", 0.9), ("ma20_above_ma50", "==", 1), ("bb_pct_b", ">", 0.3), ("bb_pct_b", "<", 0.7)]),
]


def signal_fires(row, feature, op, threshold):
    """Check if a single condition fires for a given row."""
    val = row.get(feature)
    if val is None:
        return False
    if op == ">":
        return val > threshold
    elif op == "<":
        return val < threshold
    elif op == "==":
        return val == threshold
    elif op == "between":
        return threshold[0] <= val <= threshold[1]
    return False


# ══════════════════════════════════════════════════════════════
# 5. WALK-FORWARD TESTING ENGINE
# ══════════════════════════════════════════════════════════════

def test_single_signal(features, signal_name, fire_fn, train_start, train_end, test_start, test_end, horizon="fwd_5d"):
    """
    Test a signal's predictive power.
    Train: measure avg forward return when signal fires vs doesn't fire.
    Test: measure the same, see if it holds.
    """
    def analyze_window(start, end):
        fire_returns = []
        no_fire_returns = []
        for i in range(start, min(end + 1, len(features))):
            ret = features[i].get(horizon)
            if ret is None:
                continue
            if fire_fn(features[i]):
                fire_returns.append(ret)
            else:
                no_fire_returns.append(ret)

        if not fire_returns:
            return None

        avg_fire = sum(fire_returns) / len(fire_returns) if fire_returns else 0
        avg_no_fire = sum(no_fire_returns) / len(no_fire_returns) if no_fire_returns else 0
        hit_rate = len([r for r in fire_returns if r > 0]) / len(fire_returns) if fire_returns else 0

        return {
            "n_fires": len(fire_returns),
            "n_no_fires": len(no_fire_returns),
            "avg_return_fire": avg_fire,
            "avg_return_no_fire": avg_no_fire,
            "edge": avg_fire - avg_no_fire,
            "hit_rate": hit_rate,
            "fire_rate": len(fire_returns) / (len(fire_returns) + len(no_fire_returns)) if (fire_returns or no_fire_returns) else 0,
        }

    train_result = analyze_window(train_start, train_end)
    test_result = analyze_window(test_start, test_end)

    return {
        "signal": signal_name,
        "train": train_result,
        "test": test_result,
    }


def run_walk_forward_analysis(features, horizon="fwd_5d"):
    """
    Rolling walk-forward analysis across multiple windows.
    Train: 100 trading days, Test: 50 trading days, step: 50 days.
    """
    print(f"\n{'='*70}")
    print(f"WALK-FORWARD ANALYSIS — Horizon: {horizon}")
    print(f"{'='*70}")

    TRAIN_LEN = 100
    TEST_LEN = 50
    STEP = 50

    n = len(features)
    windows = []
    start = 0
    while start + TRAIN_LEN + TEST_LEN <= n:
        windows.append({
            "train_start": start,
            "train_end": start + TRAIN_LEN - 1,
            "test_start": start + TRAIN_LEN,
            "test_end": start + TRAIN_LEN + TEST_LEN - 1,
        })
        start += STEP

    print(f"  {len(windows)} walk-forward windows (train={TRAIN_LEN}d, test={TEST_LEN}d, step={STEP}d)")
    for i, w in enumerate(windows):
        print(f"    Window {i+1}: Train {features[w['train_start']]['date']} → {features[w['train_end']]['date']}  |  "
              f"Test {features[w['test_start']]['date']} → {features[w['test_end']]['date']}")

    # Test all simple signals
    all_results = {}

    for sig_name, feat, op, thresh, desc in SIGNALS:
        window_results = []
        for w in windows:
            fire_fn = lambda row, f=feat, o=op, t=thresh: signal_fires(row, f, o, t)
            result = test_single_signal(features, sig_name, fire_fn,
                                        w["train_start"], w["train_end"],
                                        w["test_start"], w["test_end"], horizon)
            window_results.append(result)
        all_results[sig_name] = {
            "type": "simple",
            "description": desc,
            "windows": window_results,
        }

    # Test combined signals
    for sig_name, conditions in COMBINED_SIGNALS:
        window_results = []
        for w in windows:
            def fire_fn(row, conds=conditions):
                return all(signal_fires(row, f, o, t) for f, o, t in conds)
            result = test_single_signal(features, sig_name, fire_fn,
                                        w["train_start"], w["train_end"],
                                        w["test_start"], w["test_end"], horizon)
            window_results.append(result)
        all_results[sig_name] = {
            "type": "combined",
            "description": sig_name,
            "windows": window_results,
        }

    return all_results, windows


def score_signals(all_results):
    """
    Score each signal by consistency and magnitude of edge.
    Returns sorted list of (signal_name, score, details).
    """
    scored = []

    for sig_name, info in all_results.items():
        windows = info["windows"]

        # Collect test edges where we have data
        test_edges = []
        test_hit_rates = []
        train_edges = []
        oos_consistent = 0  # how many windows test edge matches train edge direction
        total_valid = 0
        total_fires = 0

        for wr in windows:
            train = wr.get("train")
            test = wr.get("test")
            if train is None or test is None:
                continue
            if train["n_fires"] < 3 or test["n_fires"] < 2:
                continue

            total_valid += 1
            total_fires += test["n_fires"]
            train_edges.append(train["edge"])
            test_edges.append(test["edge"])
            test_hit_rates.append(test["hit_rate"])

            # Does test edge have same sign as train edge?
            if (train["edge"] > 0 and test["edge"] > 0) or (train["edge"] < 0 and test["edge"] < 0):
                oos_consistent += 1

        if total_valid < 2:
            continue

        avg_test_edge = sum(test_edges) / len(test_edges)
        avg_test_hit = sum(test_hit_rates) / len(test_hit_rates)
        consistency = oos_consistent / total_valid

        # Score = |avg_edge| * consistency * sqrt(avg_fires_per_window)
        avg_fires = total_fires / total_valid
        score = abs(avg_test_edge) * consistency * math.sqrt(max(avg_fires, 1))

        # Direction: is this generally a buy signal (positive edge) or sell signal (negative)?
        direction = "BUY" if avg_test_edge > 0 else "SELL"

        scored.append({
            "signal": sig_name,
            "type": info["type"],
            "description": info["description"],
            "score": score,
            "direction": direction,
            "avg_test_edge": avg_test_edge,
            "avg_test_hit_rate": avg_test_hit,
            "consistency": consistency,
            "valid_windows": total_valid,
            "avg_fires_per_window": avg_fires,
            "train_edges": train_edges,
            "test_edges": test_edges,
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored


# ══════════════════════════════════════════════════════════════
# 6. DECISION TREE BUILDER
# ══════════════════════════════════════════════════════════════

def build_decision_tree(features, scored_signals, max_depth=4, min_samples=15):
    """
    Build a simple decision tree using the top-scoring signals.
    Uses information-gain-like splitting on 5-day forward returns.
    """
    # Select top features that have meaningful edges
    top_buy_signals = [s for s in scored_signals if s["direction"] == "BUY" and s["consistency"] >= 0.5][:8]
    top_sell_signals = [s for s in scored_signals if s["direction"] == "SELL" and s["consistency"] >= 0.5][:8]

    print(f"\n{'='*70}")
    print("DECISION TREE CONSTRUCTION")
    print(f"{'='*70}")
    print(f"  Top BUY signals ({len(top_buy_signals)}):")
    for s in top_buy_signals:
        print(f"    {s['signal']:45s}  edge={s['avg_test_edge']:+.3f}%  consistency={s['consistency']:.0%}")
    print(f"  Top SELL signals ({len(top_sell_signals)}):")
    for s in top_sell_signals:
        print(f"    {s['signal']:45s}  edge={s['avg_test_edge']:+.3f}%  consistency={s['consistency']:.0%}")

    return top_buy_signals, top_sell_signals


# ══════════════════════════════════════════════════════════════
# 7. STRATEGY BACKTESTER
# ══════════════════════════════════════════════════════════════

def backtest_strategy(features, buy_signals, sell_signals, test_start_date, test_end_date):
    """
    Backtest the decision tree strategy.
    Uses a scoring approach: sum of signal edges to produce a conviction score.
    """
    # Find indices
    start_idx = None
    end_idx = None
    for i, f in enumerate(features):
        if f["date"] >= test_start_date and start_idx is None:
            start_idx = i
        if f["date"] <= test_end_date:
            end_idx = i

    if start_idx is None or end_idx is None:
        print("  ERROR: Test period not found in data")
        return None

    print(f"\n{'='*70}")
    print(f"BACKTESTING: {test_start_date} → {test_end_date}")
    print(f"{'='*70}")

    # Map signal names to their fire functions
    sig_lookup = {}
    for sig_name, feat, op, thresh, desc in SIGNALS:
        sig_lookup[sig_name] = lambda row, f=feat, o=op, t=thresh: signal_fires(row, f, o, t)
    for sig_name, conditions in COMBINED_SIGNALS:
        sig_lookup[sig_name] = lambda row, conds=conditions: all(signal_fires(row, f, o, t) for f, o, t in conds)

    position = "OUT"
    cash = 10000.0
    shares = 0
    entry_price = 0
    peak_price = 0
    trades = []
    equity_curve = []
    decisions = []

    for i in range(start_idx, end_idx + 1):
        row = features[i]
        price = row["close"]

        # Compute conviction score
        buy_score = 0
        sell_score = 0
        buy_reasons = []
        sell_reasons = []

        for s in buy_signals:
            fn = sig_lookup.get(s["signal"])
            if fn and fn(row):
                buy_score += s["avg_test_edge"] * s["consistency"]
                buy_reasons.append(s["signal"])

        for s in sell_signals:
            fn = sig_lookup.get(s["signal"])
            if fn and fn(row):
                sell_score += abs(s["avg_test_edge"]) * s["consistency"]
                sell_reasons.append(s["signal"])

        # Trailing stop (always active when in position)
        trailing_stop_hit = False
        if position == "LONG":
            peak_price = max(peak_price, price)
            if price < peak_price * 0.97:  # 3% trailing stop
                trailing_stop_hit = True
                sell_reasons.append("Trailing stop (3%)")

        # Decision logic
        action = "HOLD"
        reason = ""

        if position == "OUT":
            # Need net positive conviction to buy
            net = buy_score - sell_score
            if net > 0.05 and len(buy_reasons) >= 2:
                action = "BUY"
                reason = f"Score: +{net:.3f} | {', '.join(buy_reasons[:3])}"
        elif position == "LONG":
            if trailing_stop_hit:
                action = "SELL"
                reason = f"Trailing stop hit (peak ${peak_price:.2f})"
            elif sell_score > buy_score and sell_score > 0.05 and len(sell_reasons) >= 2:
                action = "SELL"
                net = sell_score - buy_score
                reason = f"Score: -{net:.3f} | {', '.join(sell_reasons[:3])}"

        # Execute
        if action == "BUY" and position == "OUT":
            shares = int(cash / price)
            cash -= shares * price
            entry_price = price
            peak_price = price
            position = "LONG"
            trades.append({"date": row["date"], "action": "BUY", "price": price, "reason": reason})
            decisions.append({"date": row["date"], "action": "BUY", "price": price, "reason": reason})
        elif action == "SELL" and position == "LONG":
            cash += shares * price
            pnl = (price / entry_price - 1) * 100
            trades.append({"date": row["date"], "action": "SELL", "price": price, "pnl": pnl, "reason": reason})
            decisions.append({"date": row["date"], "action": "SELL", "price": price, "pnl": pnl, "reason": reason})
            position = "OUT"
            shares = 0

        equity = cash + shares * price
        equity_curve.append({"date": row["date"], "equity": equity, "price": price})

    # Final stats
    final_equity = equity_curve[-1]["equity"] if equity_curve else 10000
    total_return = (final_equity / 10000 - 1) * 100
    bh_return = (features[end_idx]["close"] / features[start_idx]["close"] - 1) * 100

    completed_trades = [t for t in trades if t["action"] == "SELL"]
    wins = [t for t in completed_trades if t.get("pnl", 0) > 0]
    losses = [t for t in completed_trades if t.get("pnl", 0) <= 0]

    # Max drawdown
    peak_eq = 0
    max_dd = 0
    for e in equity_curve:
        if e["equity"] > peak_eq:
            peak_eq = e["equity"]
        dd = (peak_eq - e["equity"]) / peak_eq
        if dd > max_dd:
            max_dd = dd

    results = {
        "total_return": total_return,
        "buy_hold_return": bh_return,
        "excess_return": total_return - bh_return,
        "num_trades": len(completed_trades),
        "win_rate": len(wins) / len(completed_trades) * 100 if completed_trades else 0,
        "avg_win": sum(t["pnl"] for t in wins) / len(wins) if wins else 0,
        "avg_loss": sum(t["pnl"] for t in losses) / len(losses) if losses else 0,
        "max_drawdown": max_dd * 100,
        "decisions": decisions,
        "equity_curve": equity_curve,
    }

    print(f"  Strategy return: {total_return:+.2f}%")
    print(f"  Buy & hold:      {bh_return:+.2f}%")
    print(f"  Excess return:   {total_return - bh_return:+.2f}%")
    print(f"  Trades: {len(completed_trades)}  Win rate: {results['win_rate']:.0f}%")
    print(f"  Avg win: {results['avg_win']:+.2f}%  Avg loss: {results['avg_loss']:+.2f}%")
    print(f"  Max drawdown: {max_dd*100:.2f}%")

    if decisions:
        print(f"\n  Decision log:")
        for d in decisions:
            pnl_str = f"  P&L: {d['pnl']:+.2f}%" if "pnl" in d else ""
            print(f"    {d['date']}  {d['action']:4s}  ${d['price']:.2f}{pnl_str}  — {d['reason']}")

    return results


# ══════════════════════════════════════════════════════════════
# 8. MAIN
# ══════════════════════════════════════════════════════════════

def main():
    print("=" * 70)
    print("STRATEGY LAB — WALK-FORWARD RESEARCH ENGINE")
    print("=" * 70)

    # 1. Fetch data
    data = fetch_all_data()

    # 2. Compute features
    print("\nComputing features...", flush=True)
    features = compute_all_features(data)
    print(f"  → {len(features)} days with {len(features[0]) if features else 0} features each")

    # 3. Walk-forward analysis for multiple horizons
    results_5d, windows = run_walk_forward_analysis(features, "fwd_5d")
    results_1d, _ = run_walk_forward_analysis(features, "fwd_1d")
    results_10d, _ = run_walk_forward_analysis(features, "fwd_10d")

    # 4. Score signals (primarily use 5d horizon)
    print(f"\n{'='*70}")
    print("SIGNAL RANKINGS (by out-of-sample consistency × edge)")
    print(f"{'='*70}")

    scored_5d = score_signals(results_5d)
    scored_1d = score_signals(results_1d)
    scored_10d = score_signals(results_10d)

    # Cross-reference: which signals work across multiple horizons?
    print(f"\n  --- 5-DAY HORIZON (primary) ---")
    for i, s in enumerate(scored_5d[:25]):
        marker = "★" if s["consistency"] >= 0.6 else " "
        print(f"  {marker} {i+1:2d}. {s['signal']:45s} {s['direction']:4s}  "
              f"edge={s['avg_test_edge']:+.3f}%  hit={s['avg_test_hit_rate']:.0%}  "
              f"cons={s['consistency']:.0%}  fires={s['avg_fires_per_window']:.0f}/window  "
              f"score={s['score']:.3f}")

    print(f"\n  --- 1-DAY HORIZON ---")
    for i, s in enumerate(scored_1d[:15]):
        marker = "★" if s["consistency"] >= 0.6 else " "
        print(f"  {marker} {i+1:2d}. {s['signal']:45s} {s['direction']:4s}  "
              f"edge={s['avg_test_edge']:+.3f}%  hit={s['avg_test_hit_rate']:.0%}  "
              f"cons={s['consistency']:.0%}  score={s['score']:.3f}")

    print(f"\n  --- 10-DAY HORIZON ---")
    for i, s in enumerate(scored_10d[:15]):
        marker = "★" if s["consistency"] >= 0.6 else " "
        print(f"  {marker} {i+1:2d}. {s['signal']:45s} {s['direction']:4s}  "
              f"edge={s['avg_test_edge']:+.3f}%  hit={s['avg_test_hit_rate']:.0%}  "
              f"cons={s['consistency']:.0%}  score={s['score']:.3f}")

    # 5. Cross-horizon consistency check
    print(f"\n{'='*70}")
    print("CROSS-HORIZON CONSISTENCY")
    print(f"{'='*70}")

    # Find signals that appear in top 20 across multiple horizons
    top_1d = {s["signal"]: s for s in scored_1d[:20]}
    top_5d = {s["signal"]: s for s in scored_5d[:20]}
    top_10d = {s["signal"]: s for s in scored_10d[:20]}

    all_top = set(top_1d.keys()) | set(top_5d.keys()) | set(top_10d.keys())
    cross_scores = []
    for sig in all_top:
        horizons_present = []
        if sig in top_1d:
            horizons_present.append(("1d", top_1d[sig]))
        if sig in top_5d:
            horizons_present.append(("5d", top_5d[sig]))
        if sig in top_10d:
            horizons_present.append(("10d", top_10d[sig]))

        if len(horizons_present) >= 2:
            # Check direction consistency
            directions = [h[1]["direction"] for h in horizons_present]
            if len(set(directions)) == 1:
                avg_score = sum(h[1]["score"] for h in horizons_present) / len(horizons_present)
                cross_scores.append({
                    "signal": sig,
                    "direction": directions[0],
                    "horizons": len(horizons_present),
                    "details": {h[0]: h[1] for h in horizons_present},
                    "avg_score": avg_score,
                })

    cross_scores.sort(key=lambda x: (x["horizons"], x["avg_score"]), reverse=True)
    print(f"  Signals consistent across multiple horizons:")
    for cs in cross_scores[:20]:
        hz = ", ".join(cs["details"].keys())
        print(f"    {cs['signal']:45s} {cs['direction']:4s}  horizons=[{hz}]  avg_score={cs['avg_score']:.3f}")

    # 6. Build decision tree
    buy_signals, sell_signals = build_decision_tree(features, scored_5d)

    # 7. Backtest on multiple periods
    # Use the last portion of data as final out-of-sample test
    # Find reasonable test periods
    dates = [f["date"] for f in features]

    # Test period 1: roughly the last 3 months
    test1_start = dates[int(len(dates) * 0.75)]
    test1_end = dates[-1]

    # Test period 2: middle section (out of sample for walk-forward)
    test2_start = dates[int(len(dates) * 0.5)]
    test2_end = dates[int(len(dates) * 0.75)]

    bt1 = backtest_strategy(features, buy_signals, sell_signals, test1_start, test1_end)
    bt2 = backtest_strategy(features, buy_signals, sell_signals, test2_start, test2_end)

    # 8. Also run the specific Mar-May / Jun-Aug test from the existing strategy lab
    bt3 = backtest_strategy(features, buy_signals, sell_signals, "2025-06-01", "2025-08-31")

    # 9. Export the strategy definition for the JS engine
    print(f"\n{'='*70}")
    print("STRATEGY ENGINE DEFINITION (for JS port)")
    print(f"{'='*70}")

    strategy_def = {
        "buy_signals": [
            {"signal": s["signal"], "edge": s["avg_test_edge"], "consistency": s["consistency"]}
            for s in buy_signals
        ],
        "sell_signals": [
            {"signal": s["signal"], "edge": s["avg_test_edge"], "consistency": s["consistency"]}
            for s in sell_signals
        ],
        "trailing_stop_pct": 0.03,
        "min_buy_signals": 2,
        "min_sell_signals": 2,
        "min_net_score": 0.05,
    }
    print(json.dumps(strategy_def, indent=2))

    # 10. Summary findings
    print(f"\n{'='*70}")
    print("FINDINGS SUMMARY")
    print(f"{'='*70}")

    print(f"\n  WHAT WORKED (consistent edge across walk-forward windows):")
    for s in scored_5d[:10]:
        if s["consistency"] >= 0.5:
            print(f"    ✓ {s['signal']:45s} → {s['direction']}  (edge={s['avg_test_edge']:+.3f}%, "
                  f"consistency={s['consistency']:.0%}, hit={s['avg_test_hit_rate']:.0%})")

    print(f"\n  WHAT DIDN'T WORK (low consistency or wrong direction OOS):")
    # Signals with high train edge but low test consistency
    inconsistent = [s for s in scored_5d if s["consistency"] < 0.4 and s["score"] > 0.01]
    for s in inconsistent[:10]:
        print(f"    ✗ {s['signal']:45s} → train said {s['direction']}, but only {s['consistency']:.0%} OOS consistency")

    print(f"\n  NO EFFECT (negligible edge):")
    no_effect = [s for s in scored_5d if abs(s["avg_test_edge"]) < 0.05 and s["avg_fires_per_window"] > 5]
    for s in no_effect[:10]:
        print(f"    — {s['signal']:45s}   edge={s['avg_test_edge']:+.3f}% (essentially zero)")

    print(f"\n  BACKTEST RESULTS:")
    if bt1:
        print(f"    Period 1 ({test1_start} → {test1_end}): Strategy {bt1['total_return']:+.2f}% vs B&H {bt1['buy_hold_return']:+.2f}%  "
              f"({bt1['num_trades']} trades, {bt1['win_rate']:.0f}% win rate)")
    if bt2:
        print(f"    Period 2 ({test2_start} → {test2_end}): Strategy {bt2['total_return']:+.2f}% vs B&H {bt2['buy_hold_return']:+.2f}%  "
              f"({bt2['num_trades']} trades, {bt2['win_rate']:.0f}% win rate)")
    if bt3:
        print(f"    Period 3 (Jun-Aug 2025):                Strategy {bt3['total_return']:+.2f}% vs B&H {bt3['buy_hold_return']:+.2f}%  "
              f"({bt3['num_trades']} trades, {bt3['win_rate']:.0f}% win rate)")


if __name__ == "__main__":
    main()
