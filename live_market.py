#!/usr/bin/env python3
"""
Live Market — Post-Session Opening Candle Report
================================================
Fetches NIFTY 50 (or any index/stock) opening price + first 15-minute candle
OHLC for the last completed trading session, using Upstox API.

Usage:
    python live_market.py --alias NIFTY
    python live_market.py --alias BANKNIFTY
    python live_market.py --symbol "RELIANCE"          # bare stock name
    python live_market.py --symbol "NSE_EQ|INE040A01016"  # full key
    python live_market.py --dry-run                    # no API call

Output: JSON with {date, symbol, open, first_15min: {open, high, low, close, volume}}
Saved to public/data/<alias>.json
"""

import argparse
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import quote as _url_quote
import pytz

IST = pytz.timezone("Asia/Kolkata")

# ────────────────────── Reuse pivot_boss.py system ──────────────────────
import pivot_boss

_API_DIR = Path(__file__).parent / "api"
sys.path.insert(0, str(_API_DIR))
from upstox_client import UpstoxClient  # type: ignore # noqa: E402

# Re-use constants/aliases from pivot_boss
INSTRUMENT_KEYS = pivot_boss.INSTRUMENT_KEYS
UPSTOX_BASE = pivot_boss.UPSTOX_BASE
_V3_URL = "https://api.upstox.com/v3"
_OUTPUT_DIR = pivot_boss._OUTPUT_DIR


def _resolve_symbol(alias_or_symbol: str) -> str | None:
    """
    Resolve a user-provided alias or bare symbol name to a full Upstox instrument key.

    - If it's a known alias (NIFTY, BANKNIFTY, etc.), use INSTRUMENT_KEYS.
    - If it's a bare trading name (e.g. "RELIANCE"), search instruments_NSE.json.
    - If it already contains a pipe ('|'), assume it's a full key.
    """
    if "|" in alias_or_symbol:
        return alias_or_symbol  # already a full Upstox instrument key

    upper = alias_or_symbol.upper()
    if upper in INSTRUMENT_KEYS:
        return INSTRUMENT_KEYS[upper]

    # Bare stock name — search master instruments cache
    resolved = pivot_boss._resolve_symbol_from_name(alias_or_symbol)
    return resolved


def fetch_opening_candle_report(
    client: UpstoxClient,
    symbol: str,
    target_date_str: str,
    num_minutes: int = 15,
) -> dict:
    """
    Fetch opening price + opening candle OHLC for a given trading day.

    Args:
        client: Authenticated UpstoxClient.
        symbol: Full Upstox instrument key (e.g. "NSE_INDEX|Nifty 50").
        target_date_str: YYYY-MM-DD of the trading session.
        num_minutes: Minutes to aggregate (15 for 15-min candle, 60 for Initial Balance).
    """
    today_str = datetime.now(IST).strftime("%Y-%m-%d")
    try:
        if target_date_str == today_str:
            encoded = _url_quote(symbol, safe="")
            url = f"{_V3_URL}/historical-candle/intraday/{encoded}/minutes/1"
            resp = client._request_with_retry("GET", url)
            resp.raise_for_status()
            raw_candles = resp.json().get("data", {}).get("candles", [])
            intraday = []
            for c in raw_candles:
                if isinstance(c, list):
                    intraday.append({
                        "timestamp": c[0], "open": c[1], "high": c[2],
                        "low": c[3], "close": c[4],
                        "volume": c[5] if len(c) > 5 else 0,
                        "oi": c[6] if len(c) > 6 else 0,
                    })
            intraday.sort(key=lambda x: x["timestamp"])
        else:
            intraday = pivot_boss.fetch_intraday_ohlc(
                client, symbol, target_date_str, interval="1minute"
            )
    except Exception as e:
        sys.stderr.write(f"[WARN] Intraday fetch failed: {e}\n")
        intraday = []

    # Collect required number of 1-minute candles (15m or 60m IB)
    selected_candles = intraday[:num_minutes] if intraday else []

    ohlc = None
    if selected_candles:
        ohlc = {
            "open": round(float(selected_candles[0]["open"]), 2),
            "high": round(float(max(b["high"] for b in selected_candles)), 2),
            "low": round(float(min(b["low"] for b in selected_candles)), 2),
            "close": round(float(selected_candles[-1]["close"]), 2),
            "volume": sum(b.get("volume", 0) for b in selected_candles),
            "count": len(selected_candles),
        }
    else:
        open_price = None
        try:
            ltp = client.get_spot_price(symbol)
            if ltp:
                open_price = round(float(ltp), 2)
        except Exception:
            pass
        ohlc = {
            "open": open_price,
            "high": open_price,
            "low": open_price,
            "close": open_price,
            "volume": 0,
            "count": 0,
            "status": "PENDING_CANDLES",
            "note": "Candles for this session not yet available.",
        }

    return {
        "date": target_date_str,
        "symbol": symbol,
        "open": ohlc["open"],
        "ohlc": ohlc,
    }


def _is_trading_day(d: datetime, holidays: list[str]) -> bool:
    """Check if a date is a valid trading day (not weekend, not holiday)."""
    return d.weekday() < 5 and d.strftime("%Y-%m-%d") not in holidays


def _resolve_target_date(today: datetime, holidays: list[str]) -> tuple[str, str]:
    """
    Resolve the target trading session date.

    - If today is a trading day AND current time >= 09:30 IST → today (live session)
    - Otherwise → most recent previous trading day (pre-market / after-hours)
    """
    today_str = today.strftime("%Y-%m-%d")
    is_trading_day = _is_trading_day(today, holidays)
    import pytz
    ist = pytz.timezone("Asia/Kolkata")
    ist_now = today if today.tzinfo else ist.localize(today)

    is_after_0930 = ist_now.hour >= 10 or (ist_now.hour == 9 and ist_now.minute >= 30)
    if is_trading_day and is_after_0930:
        return today_str, "today_live"
    else:
        d = today - timedelta(days=1)
        while not _is_trading_day(d, holidays):
            d -= timedelta(days=1)
        return d.strftime("%Y-%m-%d"), "previous_completed"


def main():
    parser = argparse.ArgumentParser(
        description="Fetch opening + first 15-min candle or Initial Balance (IB) OHLC for current/last session"
    )
    parser.add_argument("--alias", default=None, help="Index alias: NIFTY, BANKNIFTY, FINNIFTY, MIDCAP")
    parser.add_argument("--symbol", default=None, help="Full Upstox key or bare trading name (e.g. 'RELIANCE')")
    parser.add_argument("--IB", "--ib", action="store_true", help="Fetch first 1 hour (09:15-10:15 IST) Initial Balance data")
    parser.add_argument("--dry-run", action="store_true", help="Print resolved dates/keys without fetching data")
    args = parser.parse_args()

    # ── Resolve symbol ──
    symbol_input = args.alias or args.symbol or "NIFTY"
    symbol = _resolve_symbol(symbol_input)
    if not symbol:
        print(f"[ERROR] Could not resolve symbol '{symbol_input}'", file=sys.stderr)
        print("  Use --alias (NIFTY, BANKNIFTY, FINNIFTY, MIDCAP) or full key", file=sys.stderr)
        sys.exit(1)

    # ── Determine target trading session ──
    holidays = pivot_boss.fetch_nse_holidays()
    today = datetime.now(IST)
    is_today_trading_day = _is_trading_day(today, holidays)

    # Skip run if today is a non-trading day (weekend/holiday)
    if not is_today_trading_day:
        print(f"[INFO] Today ({today.strftime('%Y-%m-%d')}) is a non-trading day. Skipping run.", file=sys.stderr)
        if args.dry_run:
            print(json.dumps({
                "resolved_symbol": symbol,
                "target_date": today.strftime("%Y-%m-%d"),
                "session_mode": "skipped_non_trading_day",
                "holidays_count": len(holidays),
                "reason": "Today is a weekend or NSE holiday",
            }, indent=2))
        sys.exit(0)

    target_date_str, session_mode = _resolve_target_date(today, holidays)

    if args.dry_run:
        print(json.dumps({
            "resolved_symbol": symbol,
            "target_date": target_date_str,
            "session_mode": session_mode,
            "holidays_count": len(holidays),
        }, indent=2))
        return

    # ── Initialize Upstox client ──
    print(f"[INFO] Target session: {target_date_str} ({session_mode})", file=sys.stderr)
    print(f"[INFO] Symbol: {symbol}", file=sys.stderr)
    print("[INFO] Initializing Upstox client (autologin)...", file=sys.stderr)
    try:
        client = pivot_boss._get_client()
    except Exception as e:
        print(f"[ERROR] Upstox client init failed: {e}", file=sys.stderr)
        sys.exit(1)

    # ── Fetch candle data ──
    num_minutes = 60 if args.IB else 15
    try:
        live_data = fetch_opening_candle_report(client, symbol, target_date_str, num_minutes=num_minutes)
    except Exception as e:
        print(f"[ERROR] Fetch failed: {e}", file=sys.stderr)
        sys.exit(1)

    # ── Resolve output filename dynamically ──
    _rev_map = {v: k for k, v in INSTRUMENT_KEYS.items()}
    if args.alias:
        alias = args.alias.upper()
    elif symbol in _rev_map:
        alias = _rev_map[symbol]
    elif "|" in symbol_input:
        alias = pivot_boss._alias_from_symbol(symbol) if hasattr(pivot_boss, "_alias_from_symbol") else symbol.split("|")[-1][:20].replace(" ", "_").upper()
    else:
        alias = symbol_input.upper().replace(" ", "_")[:20]
    output_path = _OUTPUT_DIR / f"{alias}.json"
    _OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # ── Merge into existing NIFTY.json / BANKNIFTY.json etc. ──
    existing = {}
    if output_path.exists():
        try:
            with open(output_path, "r") as f:
                existing = json.load(f)
        except Exception:
            existing = {}

    open_price = live_data.get("open")
    candle_ohlc = live_data.get("ohlc")
    classification = "PENDING"

    if open_price is not None and existing.get("previous_session"):
        pdh = existing["previous_session"].get("high", 0)
        pdl = existing["previous_session"].get("low", 0)
        vah = existing.get("value_area", {}).get("VAH", 0)
        val = existing.get("value_area", {}).get("VAL", 0)
        if open_price >= pdh:
            classification = "OUT_ABOVE"
        elif open_price <= pdl:
            classification = "OUT_BELOW"
        elif open_price > vah:
            classification = "ABOVE_VALUE"
        elif open_price < val:
            classification = "BELOW_VALUE"
        elif pdl <= open_price <= pdh and val <= open_price <= vah:
            classification = "IN_VALUE"

    processed_candle = None
    if candle_ohlc and "status" not in candle_ohlc:
        _o = candle_ohlc.get("open"); _h = candle_ohlc.get("high"); _l = candle_ohlc.get("low"); _c = candle_ohlc.get("close")
        if _o is not None and _h is not None and _l is not None and _c is not None:
            _vah = existing.get("value_area", {}).get("VAH", 0) if existing else 0
            _val = existing.get("value_area", {}).get("VAL", 0) if existing else 0
            _body = abs(_c - _o)
            _rng = _h - _l
            if _rng == 0 or (_body / _rng) < 0.10:
                _ctype = "DOJI"
            elif _c > _o: _ctype = "BULLISH"
            else: _ctype = "BEARISH"
            if _c > _vah: _acc = "ABOVE_VALUE"
            elif _c < _val: _acc = "BELOW_VALUE"
            else: _acc = "INSIDE_VALUE"

            processed_candle = {
                "open": _o,
                "high": _h,
                "low": _l,
                "close": _c,
                "volume": candle_ohlc.get("volume", 0),
                "type": _ctype,
                "acceptance": _acc,
            }

            if args.IB:
                processed_candle["range"] = round(_h - _l, 2)
                processed_candle["width_type"] = "NARROW_IB" if (_h - _l) / (_c or 1) * 100 < 0.5 else "WIDE_IB"

    existing["opening_classification"] = classification

    if args.IB:
        existing["initial_balance"] = processed_candle
    else:
        existing["first_15m_candle"] = processed_candle

    output_json = json.dumps(existing, indent=2)
    with open(output_path, "w") as f:
        f.write(output_json)
    print(f"[INFO] Merged {'IB (1-Hour)' if args.IB else '15-min'} live data into {output_path}", file=sys.stderr)

    # print(output_json)


if __name__ == "__main__":
    main()
