#!/usr/bin/env python3
"""
Upstox Data Fetcher for PivotBoss Market Engine
===============================================
Single-file tool that fetches historical data from Upstox API and
computes the next trading day with full scenario coverage.

Usage:
    1. Configure credentials in api/upstox.json OR pass via CLI args (see --help)
    2. Run:  python pivot_boss.py --alias NIFTY --days 5
    3. Output: prints JSON with all PivotBoss data for next trading day

Data fetched per the PivotBoss playbook:
    - Daily OHLCV for previous session(s)
    - Value Area (VAH/VPA/VAL) — computed via volume profile
    - CPR (fib_cpr / camarilla / floor pivots)
    - Next trading day (skips weekends + NSE holidays)
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional  # noqa: E402

# ────────────────────── Auto-login integration ──────────────────────
# Uses the existing api/upstox_login.py + api/upstox_client.py
_API_DIR = Path(__file__).parent / "api"
sys.path.insert(0, str(_API_DIR))
from upstox_client import UpstoxClient  # type: ignore # noqa: E402,F401
import requests
from urllib.parse import quote as _url_quote  # noqa: E402

# ────────────────────── Constants ──────────────────────

NSE_HOLIDAY_URL = "https://www.nseindia.com/api/holiday-master?type=trading"
UPSTOX_BASE = "https://api.upstox.com/v2"
REGULAR_SESSION_OPEN = 9  # 09:15 IST

# Instrument key templates for Upstox (spot/index keys)
INSTRUMENT_KEYS = {
    "NIFTY":  "NSE_INDEX|Nifty 50",
    "BANKNIFTY": "NSE_INDEX|Nifty Bank",
    "FINNIFTY": "NSE_INDEX|Nifty Financial Services",
    "MIDCAP": "NSE_INDEX|Nifty Midcap 50",
}

# Futures contract naming for indices (used for volume profile)
INDEX_FUT_NAMES = {
    "NIFTY":  "NIFTY",
    "BANKNIFTY": "BANKNIFTY",
    "FINNIFTY": "FINNIFTY",
    "MIDCAP": "MIDCPNIFTY",
}

# ────────────────────── Holiday Cache ──────────────────────

_HOLIDAY_CACHE = Path(__file__).parent / "data" / "nse_holidays.json"
_OUTPUT_DIR = Path(__file__).parent / "data"


def fetch_nse_holidays() -> list[str]:
    """
    Fetch NSE trading holidays from official JSON. Returns list of YYYY-MM-DD dates.

    Uses a cached JSON file (data/nse_holidays.json) that is refreshed annually.
    Set FORCE_REFRESH_NSE_HOLIDAYS env var to force re-download.
    """
    # Try cache first (refresh annually or when forced)
    force_refresh = os.environ.get("FORCE_REFRESH_NSE_HOLIDAYS", "").lower() in ("1", "true", "yes")
    if _HOLIDAY_CACHE.exists() and not force_refresh:
        try:
            with open(_HOLIDAY_CACHE, "r") as f:
                raw = json.load(f)
            # Check if cached holidays cover the current year
            current_year = str(datetime.now().year)
            holiday_dates = _parse_holiday_json(raw)
            covers_year = any(current_year in d for d in holiday_dates)
            if covers_year:
                return holiday_dates
        except Exception:
            pass  # fall through to fetch

    # Fetch from NSE API
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
        }
        # NSE requires session cookies — hit the homepage first
        session = requests.Session()
        session.get("https://www.nseindia.com", headers=headers, timeout=15)
        resp = session.get(NSE_HOLIDAY_URL, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        # Save to cache
        try:
            _HOLIDAY_CACHE.parent.mkdir(parents=True, exist_ok=True)
            with open(_HOLIDAY_CACHE, "w") as f:
                json.dump(data, f)
        except Exception:
            pass  # cache write failed, proceed with live data

        return _parse_holiday_json(data)
    except Exception as e:
        print(f"[WARN] Could not fetch NSE holidays ({e}). Using weekends-only fallback.", file=sys.stderr)
        return []


def _parse_holiday_json(data: dict) -> list[str]:
    """Parse NSE holiday JSON into list of YYYY-MM-DD strings."""
    holidays = []
    for payload in data.values():
        if isinstance(payload, list):
            for entry in payload:
                dt = _parse_nse_date(entry.get("tradingDate") or entry.get("Date") or entry.get("date"))
                if dt:
                    holidays.append(dt)
    return sorted(set(holidays))


def _parse_nse_date(raw: str | None) -> Optional[str]:
    """Parse NSE date format 'DD-MMM-YYYY' → 'YYYY-MM-DD'."""
    if not raw:
        return None
    for fmt in ("%d-%b-%Y", "%d-%B-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def next_trading_day(today: datetime, holidays: list[str]) -> datetime:
    """
    Given today, find the next trading day (skips T+1, T+2, ... until non-holiday
    and not a weekend). Returns the date of the next trading session.
    """
    d = today + timedelta(days=1)
    while d.weekday() >= 5 or d.strftime("%Y-%m-%d") in holidays:
        d += timedelta(days=1)
    return d


# ────────────────────── Upstox Fetch ──────────────────────

def _get_client() -> UpstoxClient:
    """Return an UpstoxClient with autologin (handles token validation + refresh)."""
    config_path = _API_DIR / "upstox.json"
    return UpstoxClient(config_path=str(config_path))


def fetch_daily_ohlc(
    client: UpstoxClient,
    symbol: str,
    to_date: str,
    days: int = 1,
) -> list[dict]:
    """
    Fetch daily OHLC candles via UpstoxClient (auto-reauths on 401).
    symbol: e.g. "NSE_EQ|INE848E01016" or "NSE_INDEX|NIFTY 50"
    to_date: YYYY-MM-DD of most recent session
    days: how many prior trading sessions to fetch
    Returns list of {timestamp, open, high, low, close, volume, oi}
    """
    from_date = (datetime.strptime(to_date, "%Y-%m-%d") - timedelta(days=days * 3)).strftime("%Y-%m-%d")
    encoded_symbol = _url_quote(symbol, safe="")
    url = f"{UPSTOX_BASE}/historical-candle/{encoded_symbol}/day/{to_date}/{from_date}"
    # Note: Upstox v2 uses 'day' (not '1day'). Symbol must be URL-encoded.
    resp = client._request_with_retry('GET', url)
    resp.raise_for_status()
    raw = resp.json()

    candles = raw.get("data", {}).get("candles", [])
    # Handle both array format [ts, o, h, l, c, v, oi] and dict format
    result = []
    for c in candles:
        if isinstance(c, list):
            result.append({
                "timestamp": c[0], "open": c[1], "high": c[2],
                "low": c[3], "close": c[4], "volume": c[5] if len(c) > 5 else 0,
                "oi": c[6] if len(c) > 6 else 0,
            })
        elif "ohlc" in c:
            oh = c["ohlc"]
            result.append({
                "timestamp": c["timestamp"],
                "open": oh["open"],
                "high": oh["high"],
                "low": oh["low"],
                "close": oh["close"],
                "volume": oh.get("volume", 0),
                "oi": c.get("oi", 0),
            })
        else:
            result.append({
                "timestamp": c.get("timestamp") or c.get("date"),
                "open": c["open"],
                "high": c["high"],
                "low": c["low"],
                "close": c["close"],
                "volume": c.get("volume", 0),
                "oi": c.get("oi", 0),
            })
    result.sort(key=lambda x: x["timestamp"])
    return result[-days:]


def fetch_intraday_ohlc(
    client: UpstoxClient,
    symbol: str,
    to_date: str,
    interval: str = "15minute",
    from_date: str = "",
) -> list[dict]:
    """
    Fetch intraday candles for opening analysis (first 15m confirmation).
    If from_date is provided, uses the range endpoint; otherwise filters to to_date.
    """
    encoded_symbol = _url_quote(symbol, safe="")
    if from_date:
        url = f"{UPSTOX_BASE}/historical-candle/{encoded_symbol}/{interval}/{to_date}/{from_date}"
    else:
        url = f"{UPSTOX_BASE}/historical-candle/{encoded_symbol}/{interval}/{to_date}"
    resp = client._request_with_retry('GET', url)
    resp.raise_for_status()
    candles = resp.json().get("data", {}).get("candles", [])
    result = []
    for c in candles:
        # Handle both array format [ts, o, h, l, c, v, oi] and dict format
        if isinstance(c, list):
            result.append({
                "timestamp": c[0], "open": c[1], "high": c[2],
                "low": c[3], "close": c[4], "volume": c[5] if len(c) > 5 else 0,
                "oi": c[6] if len(c) > 6 else 0,
            })
        elif "ohlc" in c:
            o = c["ohlc"]
            result.append({"timestamp": c["timestamp"], "open": o["open"], "high": o["high"],
                           "low": o["low"], "close": o["close"], "volume": o.get("volume", 0)})
        else:
            result.append({"timestamp": c.get("timestamp") or c.get("date"),
                           "open": c["open"], "high": c["high"], "low": c["low"],
                           "close": c["close"], "volume": c.get("volume", 0),
                           "oi": c.get("oi", 0)})
    # Filter to only candles on the target date (Upstox may return multiple days)
    target_date = to_date.replace("-", "")
    filtered = [b for b in result if b["timestamp"].replace("-", "")[:8] == target_date]
    if filtered:
        result = filtered
    result.sort(key=lambda x: x["timestamp"])  # Upstox returns descending, normalize to ascending
    return result


# ────────────────────── PivotBoss Calculations ──────────────────────

def compute_pivots(day: dict) -> dict:
    """Floor pivots + CPR from a daily bar {open,high,low,close,volume}."""
    h, l, c = day["high"], day["low"], day["close"]
    p = (h + l + c) / 3
    bc = (h + l) / 2
    tc = 2 * p - bc

    r1 = 2 * p - l
    r2 = p + (h - l)
    r3 = r1 + (h - l)
    s1 = 2 * p - h
    s2 = p - (h - l)
    s3 = s1 - (h - l)

    rng = h - l
    # Camarilla
    h5 = (h / l) * c if l != 0 else c
    h4 = c + rng * 1.1 / 2
    h3 = c + rng * 1.1 / 4
    h2 = c + rng * 1.1 / 6
    h1 = c + rng * 1.1 / 12
    l1 = c - rng * 1.1 / 12
    l2 = c - rng * 1.1 / 6
    l3 = c - rng * 1.1 / 4
    l4 = c - rng * 1.1 / 2
    l5 = c - (h5 - c)

    return {
        "P": p, "BC": bc, "TC": tc,
        "CPR_TOP": max(tc, bc), "CPR_BOTTOM": min(tc, bc),
        "CPR_WIDTH": abs(tc - bc),
        "R1": r1, "R2": r2, "R3": r3,
        "S1": s1, "S2": s2, "S3": s3,
        "H1": h1, "H2": h2, "H3": h3, "H4": h4, "H5": h5,
        "L1": l1, "L2": l2, "L3": l3, "L4": l4, "L5": l5,
        "RANGE": rng,
        "CAM_WIDTH": h3 - l3,
    }


def compute_value_area(
    prev_day: dict,
    client: UpstoxClient = None,
    symbol: str = "",
) -> dict:
    """
    Volume Profile / Value Area computation.

    Preferred: use spot intraday candles (1-min) to build a volume-by-price
    histogram for the previous session. POC = price bucket with max volume;
    VAH/VAL = expand outward from POC until 70% of total volume captured.

    Fallback (when spot volume unavailable): use closest-expiry option chain OI
    summed by strike price as a proxy volume distribution. POC = strike with
    highest total OI; VAH/VAL bracket ~70% of OI.

    Args:
        prev_day: previous daily bar {high, low, close, open, ...}
        client: UpstoxClient instance (for fetching real data)
        symbol: spot instrument key e.g. "NSE_INDEX|NIFTY 50"
    """
    h, l, c = prev_day["high"], prev_day["low"], prev_day["close"]
    rng = h - l
    day_str = prev_day["timestamp"][:10]  # YYYY-MM-DD

    # ── Tier 1: Spot volume (works for stocks) ──
    if client and symbol:
        vp = _fetch_spot_volume_profile(client, symbol, day_str)
        if vp:
            hist = vp["histogram"]
            total_vol = vp["total_volume"]
            if total_vol > 0:
                result = _compute_va_from_histogram(hist, total_vol)
                result["method"] = "spot_volume_profile"
                result["total_volume"] = total_vol
                return result

    # ── Tier 2: Merged spot OHLC + futures volume (for indices) ──
    # Fetch spot 1-min (has OHLC, no volume) and futures 1-min (has volume).
    # Merge by timestamp: use spot OHLC prices, attach futures volume.
    if client and symbol:
        fut_key = _resolve_index_futures_key(client, _alias_from_symbol(symbol))
        if fut_key:
            try:
                spot_1min = fetch_intraday_ohlc(client, symbol, day_str, interval="1minute")
                fut_1min = fetch_intraday_ohlc(client, fut_key, day_str, interval="1minute")
                # Ensure both are sorted ascending by timestamp (Upstox returns descending)
                spot_1min.sort(key=lambda x: x["timestamp"])
                fut_1min.sort(key=lambda x: x["timestamp"])
                if spot_1min and fut_1min:
                    # Build futures volume lookup by timestamp
                    fut_vol = {}
                    for bar in fut_1min:
                        ts = bar["timestamp"]
                        v = bar.get("volume", 0)
                        if v > 0:
                            fut_vol[ts] = v

                    # Build histogram using spot prices + futures volume
                    bucket_size = _bucket_size(h, l)
                    hist = {}
                    total_vol = 0
                    for bar in spot_1min:
                        ts = bar["timestamp"]
                        v = fut_vol.get(ts, 0)
                        if v > 0:
                            mid = (bar["high"] + bar["low"]) / 2
                            bucket = round(mid / bucket_size) * bucket_size
                            hist[bucket] = hist.get(bucket, 0) + v
                            total_vol += v

                    if total_vol > 0:
                        result = _compute_va_from_histogram(hist, total_vol)
                        result["method"] = "spot_ohlc_futures_volume"
                        result["total_volume"] = total_vol
                        result["futures_key"] = fut_key
                        return result
            except Exception as e:
                sys.stderr.write(f"[WARN] Merged spot+futures VP failed: {e}\n")

    # ── Tier 3: Option chain OI fallback ──
    if client and symbol:
        chain = _fetch_closest_expiry_oi(client, symbol)
        if chain:
            total_oi = sum(chain.values())
            if total_oi > 0:
                result = _compute_va_from_histogram(chain, total_oi)
                result["method"] = "closest_expiry_oi"
                result["total_oi"] = total_oi
                return result

    # ── Tier 4: Heuristic estimate ──
    return {
        "VAH": h - rng * 0.25,
        "POC": c,
        "VAL": l + rng * 0.25,
        "VALUE_WIDTH": rng * 0.5,
        "method": "heuristic",
        "note": "No volume/OI data available — using heuristic estimate.",
    }


def _compute_va_from_histogram(hist: dict[float, float], total: float) -> dict:
    """Given {price: volume}, find POC and expand to 70% VA."""
    target = total * 0.70
    poc_price = max(hist, key=lambda k: hist[k])
    accumulated = hist[poc_price]
    above = sorted(p for p in hist if p > poc_price)
    below = sorted((p for p in hist if p < poc_price), reverse=True)

    vah_price, val_price = poc_price, poc_price
    i_up, i_down = 0, 0
    while (i_up < len(above) or i_down < len(below)) and accumulated < target:
        vol_up = hist[above[i_up]] if i_up < len(above) else float('inf')
        vol_down = hist[below[i_down]] if i_down < len(below) else float('inf')
        if vol_up <= vol_down and i_up < len(above):
            accumulated += vol_up
            vah_price = above[i_up]
            i_up += 1
        elif i_down < len(below):
            accumulated += vol_down
            val_price = below[i_down]
            i_down += 1

    return {
        "VAH": vah_price,
        "POC": poc_price,
        "VAL": val_price,
        "VALUE_WIDTH": vah_price - val_price,
    }


def _alias_from_symbol(symbol: str) -> str:
    """Extract alias name from an instrument key like 'NSE_INDEX|Nifty 50' → 'NIFTY'."""
    sym = symbol.split("|")[-1].upper().replace(" ", "")
    for alias, key in INSTRUMENT_KEYS.items():
        if key.split("|")[-1].upper().replace(" ", "") == sym:
            return alias
    return sym


def _bucket_size(high: float, low: float) -> float:
    """Determine a reasonable price bucket size (₹1, ₹2, ₹5, ₹10, ₹50, etc.)."""
    rng = high - low
    if rng < 50:
        return 1.0
    elif rng < 200:
        return 2.0
    elif rng < 1000:
        return 5.0
    else:
        return 10.0


def _resolve_index_futures_key(client: UpstoxClient, alias: str) -> str | None:
    """
    Resolve the nearest-month futures contract key for an index alias.
    Uses Upstox instrument search to find FUTIDX contracts.
    Matches exact token 'NIFTY' to avoid matching 'BANKNIFTY'.
    """
    fut_name = INDEX_FUT_NAMES.get(alias, alias).upper()
    results = client.search_instrument(fut_name, exchange='NFO')
    if not results:
        return None
    # Match trading_symbol starting with fut_name followed by ' FUT'
    prefix = f"{fut_name} FUT"
    futures = [r for r in results if r.get('instrument_type') == 'FUT' and r.get('trading_symbol', '').startswith(prefix)]
    if not futures:
        return None
    # Sort by expiry (nearest first) — already generally sorted but be explicit
    futures.sort(key=lambda r: r.get('expiry', '9999'))
    return futures[0].get('instrument_key')


def _fetch_spot_volume_profile(
    client: UpstoxClient,
    symbol: str,
    day_str: str,
) -> dict | None:
    """
    Fetch 1-minute candles for a historical session and build a price-volume histogram.
    Returns None if no volume data or fetch fails.
    """
    try:
        intraday = fetch_intraday_ohlc(client, symbol, day_str, interval="1minute")
        if not intraday:
            return None
        # Check if any volume is non-zero
        total_vol = sum(b.get("volume", 0) for b in intraday)
        if total_vol == 0:
            return None

        # Use the bar's high/low range to bucket
        all_highs = [b["high"] for b in intraday]
        all_lows = [b["low"] for b in intraday]
        h, l = max(all_highs), min(all_lows)
        bucket_size = _bucket_size(h, l)

        hist = {}
        for bar in intraday:
            v = bar.get("volume", 0)
            mid = (bar["high"] + bar["low"]) / 2
            bucket = round(mid / bucket_size) * bucket_size
            hist[bucket] = hist.get(bucket, 0) + v

        return {"histogram": hist, "total_volume": total_vol, "bucket_size": bucket_size}
    except Exception as e:
        sys.stderr.write(f"[WARN] Spot volume profile fetch failed: {e}\n")
        return None


def _fetch_closest_expiry_oi(client: UpstoxClient, symbol: str) -> dict[float, float]:
    """
    Fetch closest-expiry option chain and sum OI by strike price.
    Returns {strike_price: total_oi}.
    """
    # Get expiries
    expiries = client.get_option_expiries(symbol)
    if not expiries:
        return {}
    closest_expiry = expiries[0]  # API returns sorted, nearest first
    chain = client.get_option_chain_with_oi(closest_expiry, symbol)
    if not chain:
        return {}

    oi_by_strike = {}
    for pair in chain:
        strike = pair.get("strike_price")
        if strike is None:
            continue
        call_oi = pair.get("call_options", {}).get("market_data", {}).get("oi", 0) or 0
        put_oi = pair.get("put_options", {}).get("market_data", {}).get("oi", 0) or 0
        oi_by_strike[float(strike)] = oi_by_strike.get(float(strike), 0) + call_oi + put_oi

    return oi_by_strike


def _is_narrow(width: float, range_val: float) -> bool:
    """Determine if a width is 'extremely narrow' relative to the day range."""
    if range_val == 0:
        return False
    return width / range_val < 0.10  # ponytail: 10% threshold, tune per instrument


def _is_wide(width: float, range_val: float) -> bool:
    """Determine if a width is 'extremely wide' relative to the day range."""
    if range_val == 0:
        return False
    return width / range_val > 0.50  # ponytail: 50% threshold, tune per instrument


def compute_day_type(piv: dict, va: dict, relationship: str, prev_rng: float) -> dict:
    """
    Determine the expected day type per Playbook §§12-28.

    Returns dict with:
        type: TREND | RANGE | SIDEWAYS
        bias: BULLISH | BEARISH | NEUTRAL
        forecast: what pivot widths suggest
        actual_setup: combined assessment
    """
    rng = prev_rng
    cpr_width = piv["CPR_WIDTH"]
    va_width = va["VALUE_WIDTH"]
    cam_width = piv["CAM_WIDTH"]

    forecast = "NEUTRAL"
    bias = "NEUTRAL"
    signals = []

    # CPR width → regime
    if _is_narrow(cpr_width, rng):
        signals.append("narrow_cpr")
        forecast = "TREND"
    elif _is_wide(cpr_width, rng):
        signals.append("wide_cpr")
        forecast = "RANGE"

    # Value Area width
    if _is_narrow(va_width, rng):
        signals.append("narrow_va")
        if forecast == "TREND":
            pass  # reinforces trend
        else:
            forecast = "TREND"
    elif _is_wide(va_width, rng):
        signals.append("wide_va")
        if forecast == "RANGE":
            pass  # reinforces range
        else:
            forecast = "RANGE"

    # Camarilla width
    if _is_narrow(cam_width, rng):
        signals.append("narrow_cam")
        forecast = "TREND"
    elif _is_wide(cam_width, rng):
        signals.append("wide_cam")
        forecast = "RANGE"

    # Two-day CPR relationship → bias
    if relationship == "HIGHER_VALUE":
        bias = "BULLISH"
    elif relationship == "LOWER_VALUE":
        bias = "BEARISH"
    elif relationship in ("OVERLAPPING_HIGHER",):
        bias = "MODERATELY_BULLISH"
    elif relationship in ("OVERLAPPING_LOWER",):
        bias = "MODERATELY_BEARISH"
    elif relationship == "INSIDE":
        forecast = "BREAKOUT"
        bias = "NEUTRAL"
    elif relationship == "OUTSIDE":
        bias = "NEUTRAL"

    # Determine final day type
    if forecast == "TREND":
        day_type = "TREND"
    elif forecast == "RANGE":
        day_type = "RANGE"
    else:
        day_type = "SIDEWAYS"

    return {
        "type": day_type,
        "bias": bias,
        "forecast": forecast,
        "signals": signals,
        "cpr_narrow": "narrow_cpr" in signals,
        "cpr_wide": "wide_cpr" in signals,
        "va_narrow": "narrow_va" in signals,
        "va_wide": "wide_va" in signals,
        "cam_narrow": "narrow_cam" in signals,
        "cam_wide": "wide_cam" in signals,
    }


def compute_scenario_coverage(prev_bar: dict, piv: dict, va: dict, day_type_info: dict, prev_prev_bar: dict, prev_rng: float) -> dict:
    """
    Generate all possible market scenarios per the PivotBoss playbook.

    Covers:
    - Opening cases (A through E)
    - Trigger levels
    - Primary / contingency trade plans
    - Invalidation points
    - Targets
    """
    pdh = prev_bar["high"]
    pdl = prev_bar["low"]
    pdc = prev_bar["close"]
    rng = prev_rng
    vah, poc, val = va["VAH"], va["POC"], va["VAL"]
    scenarios = {}

    # ── Opening Cases (§7-11) ──
    # Case A: In Range + In Value
    scenarios["case_a_in_range_in_value"] = {
        "condition": "PDL <= O <= PDH AND VAL <= O <= VAH",
        "bias": "NEUTRAL",
        "primary": "If price breaks VAH and accepts → LONG",
        "primary_target": "VAH extension / R1",
        "contingency": "If price breaks VAL and accepts → SHORT",
        "contingency_target": "VAL extension / S1",
        "no_trade": "Price remains inside value",
    }

    # Case B: In Range + Above Value
    scenarios["case_b_in_range_above_value"] = {
        "condition": "PDL <= O <= PDH AND O > VAH",
        "bias": "BULLISH",
        "primary": "If price accepts above VAH → LONG candidate",
        "primary_target": "R1 / R2",
        "contingency": "If price returns below VAH → CANCEL bullish thesis",
        "contingency_target": "POC / CPR",
        "failure": "VAH acts as resistance",
    }

    # Case C: In Range + Below Value
    scenarios["case_c_in_range_below_value"] = {
        "condition": "PDL <= O <= PDH AND O < VAL",
        "bias": "BEARISH",
        "primary": "If price accepts below VAL → SHORT candidate",
        "primary_target": "S1 / S2",
        "contingency": "If price reclaims VAL → CANCEL bearish thesis",
        "contingency_target": "POC / CPR",
        "failure": "VAL acts as support",
    }

    # Case D: Out of Range Above
    scenarios["case_d_out_above"] = {
        "condition": "O > PDH",
        "bias": "BULLISH" if prev_bar["open"] > piv["P"] else "MIXED",
        "primary": "If first 15m closes above PDH → bullish confirmation, LONG",
        "primary_target": "R2 / R3",
        "contingency": "If first 15m closes below PDH → failed gap, watch PDH/VAH/POC",
        "contingency_target": "Return to prior range/value",
        "failure": "Gap fill back inside prior range",
    }

    # Case E: Out of Range Below
    scenarios["case_e_out_below"] = {
        "condition": "O < PDL",
        "bias": "BEARISH" if prev_bar["open"] < piv["P"] else "MIXED",
        "primary": "If first 15m closes below PDL → bearish confirmation, SHORT",
        "primary_target": "S2 / S3",
        "contingency": "If first 15m closes above PDL → failed gap, watch PDL/VAL/POC",
        "contingency_target": "Return to prior range/value",
        "failure": "Gap fill back inside prior range",
    }

    # ── Key Trigger Levels (§14-17) ──
    scenarios["trigger_levels"] = {
        "reversal_longs": [
            {"level": poc, "desc": "POC rejection", "target": piv["H3"]},
            {"level": piv["L3"], "desc": "L3 reversal (bullish)", "target": piv["H3"]},
            {"level": val, "desc": "VAL bounce", "target": poc},
            {"level": piv["P"], "desc": "CPR support in uptrend", "target": piv["H3"]},
        ],
        "reversal_shorts": [
            {"level": poc, "desc": "POC rejection", "target": piv["L3"]},
            {"level": piv["H3"], "desc": "H3 rejection (bearish)", "target": piv["L3"]},
            {"level": vah, "desc": "VAH rejection", "target": poc},
            {"level": piv["P"], "desc": "CPR resistance in downtrend", "target": piv["L3"]},
        ],
        "breakout_longs": [
            {"level": piv["R1"], "desc": "R1 break", "target": piv["R2"]},
            {"level": piv["H4"], "desc": "H4 breakout", "target": piv["H5"]},
            {"level": pdh, "desc": "PDH break", "target": piv["R2"]},
            {"level": vah, "desc": "VAH break (accepted)", "target": piv["R1"]},
        ],
        "breakdown_shorts": [
            {"level": piv["S1"], "desc": "S1 break", "target": piv["S2"]},
            {"level": piv["L4"], "desc": "L4 breakdown", "target": piv["L5"]},
            {"level": pdl, "desc": "PDL break", "target": piv["S2"]},
            {"level": val, "desc": "VAL break (accepted)", "target": piv["S1"]},
        ],
    }

    # ── Primary + Contingency Plans ──
    relationship = day_type_info.get("bias", "NEUTRAL")
    if relationship == "BULLISH":
        scenarios["primary_plan"] = {
            "scenario": "Bullish structure (Higher Value / Narrow CPR)",
            "entry": "Buy pullbacks into CPR/POC/VAL support",
            "targets": [piv["R1"], piv["R2"], piv["H3"]],
            "stop": "Below PDL / VAL / CPR_BOTTOM",
            "contingency": "If CPR breaks down or price closes below VAL → flip to SHORT bias",
        }
    elif relationship == "BEARISH":
        scenarios["primary_plan"] = {
            "scenario": "Bearish structure (Lower Value / Narrow CPR)",
            "entry": "Sell rallies into CPR/POC/VAH resistance",
            "targets": [piv["S1"], piv["S2"], piv["L3"]],
            "stop": "Above PDH / VAH / CPR_TOP",
            "contingency": "If CPR breaks up or price closes above VAH → flip to LONG bias",
        }
    elif relationship == "MODERATELY_BULLISH":
        scenarios["primary_plan"] = {
            "scenario": "Overlapping Higher CPR",
            "entry": "Wait for support rejection into CPR → LONG",
            "targets": [piv["R1"], piv["H3"]],
            "stop": "Below CPR_BOTTOM",
            "contingency": "If price rejects CPR to downside → wait for VAL bounce",
        }
    elif relationship == "MODERATELY_BEARISH":
        scenarios["primary_plan"] = {
            "scenario": "Overlapping Lower CPR",
            "entry": "Wait for resistance rejection off CPR → SHORT",
            "targets": [piv["S1"], piv["L3"]],
            "stop": "Above CPR_TOP",
            "contingency": "If price pushes through CPR → wait for VAH rejection",
        }
    else:
        # Range or neutral
        scenarios["primary_plan"] = {
            "scenario": "Range-bound / Inside CPR",
            "entry": "Fade extremes: buy near VAL/PDL/S1, sell near VAH/PDH/R1",
            "targets": [poc, piv["R1"], piv["S1"]],
            "stop": "Beyond PDH/PDL",
            "contingency": "If breakout confirmed (first 15m) → follow breakout",
        }

    # ── Hot Zone Detection (§31) ──
    hot_zones = []
    levels = [piv["P"], vah, val, poc, piv["R1"], piv["S1"], piv["H3"], piv["L3"], piv["H4"], piv["L4"]]
    levels_sorted = sorted(set(levels))
    for i in range(len(levels_sorted) - 1):
        zone_width = levels_sorted[i+1] - levels_sorted[i]
        if zone_width < rng * 0.15:  # ponytail: zone < 15% of range = hot
            hot_zones.append({
                "top": levels_sorted[i+1],
                "bottom": levels_sorted[i],
                "width": round(zone_width, 2),
                "levels": [lv for lv in levels if levels_sorted[i] <= lv <= levels_sorted[i+1]],
            })
    scenarios["hot_zones"] = hot_zones

    # ── No-Trade Conditions (§48) ──
    scenarios["no_trade_rules"] = [
        "No trade if price in middle of value with no directional acceptance",
        "No continuation trade if forecast=trend but no breakout occurs",
        "No trade if forecast=range but price is in the middle",
        "No continuation if breakout occurs but immediately fails",
        "Wait if reversal level touched but no reversal confirmation",
    ]

    return scenarios


def generate_all_scenarios(prev_bar: dict, pivots: dict, va: dict, day_type: dict) -> dict:
    """Wrapper to compute all scenario coverage."""
    prev_prev_bar = prev_bar  # will be overridden by caller if available
    prev_rng = prev_bar["high"] - prev_bar["low"]
    return compute_scenario_coverage(prev_bar, pivots, va, day_type, prev_prev_bar, prev_rng)


def two_day_relationship(today_cpr: dict, prev_cpr: dict) -> str:
    """Classify two-day CPR relationship per Playbook §5."""
    today_bc, today_tc = today_cpr["BC"], today_cpr["TC"]
    prev_tc, prev_bc = prev_cpr["TC"], prev_cpr["BC"]

    if today_bc > prev_tc:
        return "HIGHER_VALUE"
    if today_tc < prev_bc:
        return "LOWER_VALUE"
    # Overlap detection
    today_top, today_bot = today_cpr["CPR_TOP"], today_cpr["CPR_BOTTOM"]
    prev_top, prev_bot = prev_cpr["CPR_TOP"], prev_cpr["CPR_BOTTOM"]
    overlap = min(today_top, prev_top) > max(today_bot, prev_bot)
    if overlap:
        if today_cpr["P"] > prev_cpr["P"]:
            return "OVERLAPPING_HIGHER"
        return "OVERLAPPING_LOWER"
    # Inside
    if today_top <= prev_top and today_bot >= prev_bot:
        return "INSIDE"
    # Outside
    if today_top >= prev_top and today_bot <= prev_bot:
        return "OUTSIDE"
    return "UNCHANGED"


def classify_open(open_price: float, prev_high: float, prev_low: float, va: dict) -> str:
    """Opening location classification per Playbook §12 + Cases §7-11."""
    vah, val = va["VAH"], va["VAL"]

    if open_price > prev_high:
        loc = "OUTSIDE_ABOVE"
    elif open_price < prev_low:
        loc = "OUTSIDE_BELOW"
    elif open_price > vah:
        loc = "IN_RANGE_ABOVE_VALUE"
    elif open_price < val:
        loc = "IN_RANGE_BELOW_VALUE"
    else:
        loc = "IN_RANGE_IN_VALUE"
    return loc


# ────────────────────── Output ──────────────────────

def build_scenario_report(
    symbol: str,
    client: UpstoxClient,
    prev_bar: dict,
    prev_prev_bar: dict,
    intraday: list[dict],
    next_trade_day: datetime,
) -> dict:
    """
    Assemble the full PivotBoss data packet for scenario coverage on the
    next trading day.

    - prev_bar: the most recent completed session (used to compute today's pivots)
    - prev_prev_bar: the session before that (for two-day CPR relationship)
    """
    # Today's pivots (computed from yesterday's bar)
    piv = compute_pivots(prev_bar)
    va = compute_value_area(prev_bar, client, symbol)

    # Two-day CPR relationship: today's pivots vs day-before's pivots
    prev_pivots = compute_pivots(prev_prev_bar)
    relationship = two_day_relationship(piv, prev_pivots)

    # For opening classification, we need today's open (if session has started)
    to_str = next_trade_day.strftime("%Y-%m-%d")
    today_now = datetime.now()
    today_bar = {}
    open_price = None
    # Only try to fetch if the target day is today or earlier AND we're in-session
    if next_trade_day.date() <= today_now.date():
        # Must be after 09:15 IST for regular session open
        if today_now.hour >= 9:
            try:
                today_bars = fetch_daily_ohlc(client, symbol, to_str, days=1)
                if today_bars:
                    today_bar = today_bars[-1]
                    # Verify the bar date matches our target (not stale fetch)
                    bar_date = today_bar.get("timestamp", "")[:10]
                    if bar_date == to_str:
                        open_price = today_bar.get("open", 0)
            except Exception:
                pass

    # First 15-minute candle of today's session (for opening confirmation)
    first_15m = None
    if intraday:
        # The first candle in the array is the 09:15 candle
        first_15m = intraday[0] if intraday else None

    # ── Compute day type + scenario predictions (§§3, 8-27) ──
    prev_rng = prev_bar["high"] - prev_bar["low"]  # for hot zone calc
    day_type = compute_day_type(piv, va, relationship, prev_rng)
    scenarios = compute_scenario_coverage(prev_bar, piv, va, day_type, prev_prev_bar, prev_rng)

    return {
        "symbol": symbol,
        "previous_session": {
            "date": prev_bar["timestamp"],
            "open": prev_bar["open"],
            "high": prev_bar["high"],
            "low": prev_bar["low"],
            "close": prev_bar["close"],
            "volume": prev_bar.get("volume", 0),
            "oi": prev_bar.get("oi", 0),
        },
        "pivots": {
            "P": round(piv["P"], 2), "BC": round(piv["BC"], 2), "TC": round(piv["TC"], 2),
            "CPR_TOP": round(piv["CPR_TOP"], 2), "CPR_BOTTOM": round(piv["CPR_BOTTOM"], 2),
            "CPR_WIDTH": round(piv["CPR_WIDTH"], 4),
            "R1": round(piv["R1"], 2), "R2": round(piv["R2"], 2), "R3": round(piv["R3"], 2),
            "S1": round(piv["S1"], 2), "S2": round(piv["S2"], 2), "S3": round(piv["S3"], 2),
            "H1": round(piv["H1"], 2), "H2": round(piv["H2"], 2), "H3": round(piv["H3"], 2),
            "H4": round(piv["H4"], 2), "H5": round(piv["H5"], 2),
            "L1": round(piv["L1"], 2), "L2": round(piv["L2"], 2), "L3": round(piv["L3"], 2),
            "L4": round(piv["L4"], 2), "L5": round(piv["L5"], 2),
            "RANGE": round(piv["RANGE"], 2), "CAM_WIDTH": round(piv["CAM_WIDTH"], 2),
        },
        "value_area": {
            "VAH": round(va["VAH"], 2), "POC": round(va["POC"], 2),
            "VAL": round(va["VAL"], 2), "VALUE_WIDTH": round(va["VALUE_WIDTH"], 2),
            "method": va.get("method", "unknown"),
        },
        "next_trading_day": to_str,
        "opening_classification": classify_open(open_price, prev_bar["high"], prev_bar["low"], va) if open_price else "PENDING",
        "two_day_relationship": relationship,
        "first_15m_candle": first_15m,
        "today_full": today_bar,
        "predictions": {
            "day_type": day_type,
            "scenarios": scenarios,
        },
    }


# ────────────────────── CLI ──────────────────────

def main():
    parser = argparse.ArgumentParser(description="PivotBoss data fetcher via Upstox API")
    parser.add_argument("--symbol", default=None,
                        help="Upstox instrument key e.g. 'NSE_INDEX|NIFTY 50' or 'NSE_EQ|INE848E01016'")
    parser.add_argument("--alias", default="NIFTY",
                        help="Shortcut alias (NIFTY, BANKNIFTY, FINNIFTY, MIDCAP) [default: NIFTY]")
    parser.add_argument("--days", type=int, default=5, help="Prior daily bars to fetch [default: 5]")
    args = parser.parse_args()

    # Initialize Upstox client with autologin
    print("[INFO] Initializing Upstox client (autologin)...", file=sys.stderr)
    try:
        client = _get_client()
    except Exception as e:
        print(f"[ERROR] Upstox client init failed: {e}", file=sys.stderr)
        sys.exit(1)

    if args.alias:
        alias_key = args.alias.upper()
        if alias_key not in INSTRUMENT_KEYS:
            print(f"[ERROR] Unknown alias '{args.alias}'. Use one of: {', '.join(INSTRUMENT_KEYS.keys())}", file=sys.stderr)
            parser.print_help()
            sys.exit(1)
        symbol = INSTRUMENT_KEYS[alias_key]
    elif args.symbol:
        symbol = args.symbol
    else:
        symbol = INSTRUMENT_KEYS["NIFTY"]
        print("[INFO] No --symbol or --alias given — defaulting to NIFTY", file=sys.stderr)

    # Determine today's date — find last trading session
    holidays = fetch_nse_holidays()
    today = datetime.now()

    # Step back to the most recent trading day
    last_trade = today - timedelta(days=1)
    while last_trade.weekday() >= 5 or last_trade.strftime("%Y-%m-%d") in holidays:
        last_trade -= timedelta(days=1)

    print(f"[INFO] Last trading day: {last_trade.strftime('%Y-%m-%d')}", file=sys.stderr)
    print(f"[INFO] Holidays loaded: {len(holidays)}", file=sys.stderr)

    try:
        daily = fetch_daily_ohlc(client, symbol, last_trade.strftime("%Y-%m-%d"), days=args.days)
    except Exception as e:
        print(f"[ERROR] Upstox fetch failed: {e}", file=sys.stderr)
        sys.exit(1)

    if not daily or len(daily) < 2:
        print(f"[ERROR] Need at least 2 daily bars, got {len(daily) if daily else 0}", file=sys.stderr)
        sys.exit(1)

    prev_bar = daily[-1]       # most recent completed session (Aug 14)
    prev_prev_bar = daily[-2]  # session before that (Aug 13) — for two-day CPR

    # Determine "next trading day" — if the current session is live (market open past 09:15 IST on a
    # business day), target today's session; otherwise pick the next trading day.
    session_start = today.replace(hour=9, minute=15, second=0, microsecond=0)
    if today.weekday() < 5 and today.strftime("%Y-%m-%d") not in holidays and today >= session_start:
        target_day = today
    else:
        target_day = next_trading_day(today, holidays)
    print(f"[INFO] Target session: {target_day.strftime('%Y-%m-%d')}", file=sys.stderr)

    try:
        intraday = fetch_intraday_ohlc(client, symbol, target_day.strftime("%Y-%m-%d"), "15minute")
    except Exception:
        intraday = []

    report = build_scenario_report(symbol, client, prev_bar, prev_prev_bar, intraday, target_day)
    output_json = json.dumps(report, indent=2)

    # Save to data/<symbol_alias>_<target_day>.json
    alias = args.alias.upper() if args.alias else "DEFAULT"
    output_path = _OUTPUT_DIR / f"{alias}_{target_day.strftime('%Y-%m-%d')}.json"
    _OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        f.write(output_json)
    print(f"[INFO] Report saved to {output_path}", file=sys.stderr)

    print(output_json)


if __name__ == "__main__":
    main()
