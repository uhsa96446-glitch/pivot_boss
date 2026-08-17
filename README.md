# NIFTY Command Center V2 — Strategy Dashboard & Data Specification

The **NIFTY Command Center** is a PivotBoss-aligned trading execution dashboard designed for Market Profile & Central Pivot Range (CPR) context analysis.

---

## 🚀 Quick Start

- **Development Server**: `npm run dev` (Access at `http://localhost:3000`)
- **Production Build**: `npm run build`
- **Data Source**: `public/data/NIFTY.json`

---

## 📊 Data Specification (`NIFTY.json`)

The dashboard consumes `public/data/NIFTY.json` in two phases: **Pre-Market** (before 09:15 AM) and **Post-Market Open** (after 09:15 AM / 09:30 AM).

### 1. `opening_classification` Expectations

#### Pre-Market Phase (Before 09:15 AM)
Set `opening_classification` to `"PENDING"` when running your pre-market analysis script.
```json
"opening_classification": "PENDING"
```
*The dashboard will display a yellow `PRE-MARKET PREPARATION` badge and prompt the trader to review all 5 playbooks.*

#### Post-Market Open Phase (After 09:15 AM)
Update `opening_classification` to one of the 5 PivotBoss opening states based on where NIFTY opens relative to the Value Area (`VAL` to `VAH`) and Session Range (`PDL` to `PDH`):

| Enum Value | Opening Condition | Playbook Triggered |
| :--- | :--- | :--- |
| `"IN_VALUE"` | `PDL <= Open <= PDH` AND `VAL <= Open <= VAH` | **CASE A · IN RANGE / VALUE** |
| `"ABOVE_VALUE"` | `PDL <= Open <= PDH` AND `Open > VAH` | **CASE B · IN RANGE / ABOVE VALUE** |
| `"BELOW_VALUE"` | `PDL <= Open <= PDH` AND `Open < VAL` | **CASE C · IN RANGE / BELOW VALUE** |
| `"OUT_ABOVE"` | `Open > PDH` | **CASE D · ABOVE PDH (Gap Up)** |
| `"OUT_BELOW"` | `Open < PDL` | **CASE E · BELOW PDL (Gap Down)** |

Example Post-Open JSON:
```json
"opening_classification": "BELOW_VALUE"
```

---

### 2. `first_15m_candle` Expectations

#### Pre-Market Phase (Before 09:30 AM)
Set to `null` before the first 15-minute candle closes.
```json
"first_15m_candle": null
```

#### Post-Market Open Phase (After 09:30 AM)

##### Minimal Format (OHLC only):
```json
"first_15m_candle": {
  "open": 24520.00,
  "high": 24565.50,
  "low": 24510.25,
  "close": 24548.10
}
```

##### Extended Format (Recommended):
Include candle type classification and value area acceptance to display enriched metrics in the dashboard header:
```json
"first_15m_candle": {
  "open": 24520.00,
  "high": 24565.50,
  "low": 24510.25,
  "close": 24548.10,
  "type": "BULLISH",           // Values: "BULLISH", "BEARISH", "DOJI"
  "acceptance": "INSIDE_VALUE" // Values: "INSIDE_VALUE", "ABOVE_VALUE", "BELOW_VALUE", "REJECTED"
}
```

---

## 🛠️ Complete `NIFTY.json` Schema Example

```json
{
  "symbol": "NIFTY",
  "date": "2026-08-14",
  "previous_session": {
    "date": "2026-08-14",
    "open": 24530.0,
    "high": 24580.0,
    "low": 24471.6,
    "close": 24541.15
  },
  "next_trading_day": "2026-08-17",
  "opening_classification": "PENDING",
  "two_day_relationship": "LOWER_VALUE",
  "first_15m_candle": null,
  "value_area": {
    "VAH": 24402.0,
    "POC": 24372.0,
    "VAL": 24326.0,
    "VALUE_WIDTH": 76.0
  }
}
```
