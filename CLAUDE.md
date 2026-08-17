# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PivotBoss Market Engine — Python-based trading analysis tool that fetches historical market data from Upstox API and computes pivot points, value areas, CPR (Central Pivot Range), Camarilla levels, and trading scenarios. Designed for pre-market analysis to determine expected market regime, opening relationship, and trade plans.

**No build system** — pure Python scripts executed directly.

## Core Structure

```
pivot_boss/
├── upstox_data_fetcher.py      # Main CLI: fetch data → compute pivots → output scenarios
├── api/
│   ├── upstox_client.py        # Reusable Upstox client (historical data, option chains, WebSocket)
│   ├── upstox_login.py         # OAuth authentication module (auto OTP/TOTP/PIN flow)
│   └── upstox.json             # Credentials (Never commit this file)
├── data/
│   ├── nse_holidays.json       # Caches NSE trading holidays (auto-refresh annually)
│   └── instruments_NSE.json    # Cached NSE master instruments (24h TTL)
├── tests/
│   └── test_holiday.py         # Simple health check for NSE holiday endpoint
├── PivotBoss_Market_Implementation_Playbook.md
└── CLAUDE.md
```

## Common Commands

### Run the main data fetcher
```bash
# Default: NIFTY index, last trading day
python upstox_data_fetcher.py

# Specify index by alias
python upstox_data_fetcher.py --alias NIFTY
python upstox_data_fetcher.py --alias BANKNIFTY
python upstox_data_fetcher.py --alias FINNIFTY
python upstox_data_fetcher.py --alias MIDCAP

# Specify by full Upstox instrument key
python upstox_data_fetcher.py --symbol "NSE_INDEX|Nifty 50"

# Fetch more historical bars for analysis
python upstox_data_fetcher.py --alias NIFTY --days 5
```

### Fresh NSE holiday fetch
```bash
# Force refresh holidays from NSE API
python -c "from upstox_data_fetcher import fetch_nse_holidays, _parse_holiday_json, _HOLIDAY_CACHE; import json; holidays = fetch_nse_holidays(); print(json.dumps(holidays, indent=2))"
```

### Validate authentication
```bash
# Test Upstox OAuth connection (runs auto-login and prints first 20 chars of token)
python -c "import sys; sys.path.insert(0, 'api'); from upstox_login import login; token = login(); print(token[:20] if token else 'Login failed')"
```

### Run API health check
```bash
python -c "from tests.test_holiday import holiday_data; print('NSE Holiday API working'); print(list(holiday_data.keys())[:3])"
```

## Dependencies

Installed globally:
- `requests` — HTTP client
- `pyotp` — TOTP generation for Upstox 2FA
- `pandas` — Data manipulation
- `websocket-client` — Real-time feed support

## Key Concepts

### PivotBoss Methodology
The tool implements the PivotBoss educational framework:
1. **Pivots**: Floor pivot points + Central Pivot Range (CPR)
2. **Camarilla**: H1-H5, L1-L5 levels for reversals and breakouts
3. **Value Area**: Volume Profile-based high/low control via Value Area High (VAH), Point of Control (POC), Value Area Low (VAL)
4. **Width Analysis**: CPR, Value Area, and Camarilla widths indicate TREND (narrow) vs RANGE (wide) regimes
5. **Two-Day CPR Relationship**: Higher/Lower/Overlapping/Inside/Outside reveals market bias
6. **Opening Classification**: 5 opening cases (A-E) + detailed location around H4/H3/CPR/L3/L4
7. **Scenario Generation**: Cases, triggers, hot zones, no-trade rules, primary/contingency plans

Documentation: `PivotBoss_Market_Implementation_Playbook.md` — reference for formulas and trading logic.

### Value Area Computation (Tiered Fallback)

Primary method prefers actual spot volume:
1. **Tier 1** (preferred): Fetch 1-minute OHLC for the session; bucket by price (₹1/2/5/10 bins) → compute volume histogram → find POC → expand 70% of total volume → VAH/VAL
2. **Tier 2** (if Tier 1 fails, for indices): Merge spot 1-min OHLC (no volume) + closest-expiry futures 1-min (has volume) → use spot prices, attach futures volume
3. **Tier 3** (if Tier 2 fails): Fetch closest-expiry option chain, sum OI by strike price as volume proxy → same 70% expansion method
4. **Tier 4** (fallback): Heuristic: `VAH = high - range*0.25`, `POC = close`, `VAL = low + range*0.25`

### Authentication Flow
Upstox uses OAuth 2.0 authorization-code flow (no long-lived passwords against trading API):
1. User logs in via browser/OTP/TOTP/PIN on Upstox login page
2. User pastes the authorization code into the script
3. Script exchanges code for access token via token endpoint
4. Access token stored in `api/upstox.json` and reused until expiry (401/UDAPI100050)
5. Auto-refresh: `UpstoxClient` validates token at init; if 401 received during API call, re-authenticates automatically

Full authentication guide: `api/how_to_login_upstox_api.md`

## API Integration Details

### UpstoxClient Methods (api/upstox_client.py)

**Core Data Fetching:**
- `get_historical_data(instrument_key, from_date, to_date, interval)` — fetches historical candles; auto-falls back from V2 → V3 API
- `get_nifty_data(from_date, to_date, interval)` — convenience wrapper for NIFTY index
- `get_option_chain_with_oi(expiry_date, underlying_key)` — fetches current expiry option chain with OI

**Instrument Search:**
- `search_instrument(symbol, exchange='NSE')` — searches by symbol; falls back to downloaded NSE master file for missing items
- `_get_master_instruments()` — downloads NSE.json.gz (24h cache)

**Auto-Authentication:**
- `validate_token()` — checks 200 OK on `/user/profile`
- `login()` — validates → if 401/UDAPI100050, calls `refresh_token()`
- `_request_with_retry(method, url)` — central retry wrapper; auto-refreshes on 401
- `refresh_token()` — calls `upstox_login.login()` → updates token → syncs to GitHub repo file

**WebSocket:**
- `websocket_connect(instruments, callback, mode='ltp')` — subscribes to instruments for real-time LTP or full market data
- `websocket_disconnect()` — cleanly stops reconnection loop

### Upstox Data Fields

In historical candles (API returns array format: `[ts, o, h, l, c, v, oi]` or dict `{"ohlc": {...}, "oi": ...}`):
- `timestamp`: ISO format string
- `open`, `high`, `low`, `close`: float
- `volume`: int (zero if not available)
- `oi`: int (open interest, optional)

Market data endpoints:
- **Market Quote**: `GET /v2/market-quote/ltp?instrument_key={key}` — current LTP
- **Historical Candle**: `GET /v2/historical-candle/{instrument_key}/{interval}/{to_date}/{from_date}` (V2) or `GET /v3/historical-candle/{key}/minutes/{minutes}/{to_date}/{from_date}` (V3)
- **Option Chain**: `GET /v2/option/chain?instrument_key={key}&expiry_date={date}`

## Day Type & Scenario Classification

`compute_day_type()` in `upstox_data_fetcher.py`:
- **TREND**: Narrow CPR + narrow Value Area + narrow Camarilla → strong directional setup
- **RANGE**: Wide CPR or wide Value Area → sideways trading range
- **SIDEWAYS**: Mixed widths or normal range → opportunistic fades

`compute_scenario_coverage()` returns:
- **Opening Cases** (A-E): Classifies open relative to previous range + value, defines bias and trade plans
- **Trigger Levels**: Reversal longs (POC, L3, VAL), reversal shorts (POC, H3, VAH), breakout longs (R1, H4, PDH, VAH), breakdown shorts (S1, L4, PDL, VAL)
- **Hot Zones**: Price ranges < 15% of daily range where multiple pivots converge
- **No-Trade Rules**: 5 scenarios where the setup is invalid or needs consolidation

## Instrument Keys

Spot/index instruments:
- `NSE_INDEX|Nifty 50` (NIFTY)
- `NSE_INDEX|Nifty Bank` (BANKNIFTY)
- `NSE_INDEX|Nifty Financial Services` (FINNIFTY)
- `NSE_INDEX|Nifty Midcap 50` (MIDCAP)
- Dynamically resolved via `INSTRUMENT_KEYS` mapping.

## Important Notes

**Never commit `api/upstox.json`** — this file contains Upstox OAuth credentials. If you need a template, check `.gitignore` or create an example file (do not commit the real credentials).

**Caching**: NSE holidays cached in `data/nse_holidays.json`; master instruments cached for 24 hours. Force refresh daily via `FORCE_REFRESH_NSE_HOLIDAYS=1` environment variable.

**Error Handling**: All Upstox API calls go through `_request_with_retry()`. If 401/UDAPI100050 returned, client auto-refreshes token once. If auto-refresh fails, request raises exception.

**Token Lifecycle**: Access token expires ~24 hours. Script auto-re-authenticates on first 401. For automatic sessions (e.g., scheduled runs or web services), implement retry with exponential backoff and token refresh on 401.