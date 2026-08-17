# PivotBoss Market Implementation Playbook
## If This Happens → Do This → Else Do That

> A paraphrased, implementation-oriented guide based on PivotBoss educational material. It converts the framework into decision trees suitable for manual trading, backtesting, and later Pine/Python automation. Qualitative terms such as "extremely narrow" are deliberately not assigned arbitrary thresholds.

---

# 1. Master Trading Flow

```text
PREVIOUS SESSION
      ↓
VALUE + RANGE
      ↓
PIVOTS / CPR / CAMARILLA
      ↓
WIDTH + TWO-DAY RELATIONSHIP
      ↓
EXPECTED MARKET REGIME
      ↓
TODAY'S OPEN
      ↓
OPENING RELATIONSHIP
      ↓
ACCEPTANCE / REJECTION
      ↓
ACTUAL MARKET BEHAVIOR
      ↓
TRADE LOCATION
      ↓
PRICE-ACTION TRIGGER
      ↓
ENTRY
      ↓
INVALIDATION
      ↓
TARGET
      ↓
CONTINGENCY
```

PivotBoss examples explicitly use a pre-market theory, opening confirmation, and a contingency plan when the market disproves the original thesis. citeturn0search7turn0search11

---

# 2. Required Data

Calculate/obtain:

```text
PDH = Previous Day High
PDL = Previous Day Low
PDC = Previous Day Close

VAH = Value Area High
POC = Point of Control / VPOC
VAL = Value Area Low

P
R1 R2 R3 R4
S1 S2 S3 S4

TC
BC

H1 H2 H3 H4 H5
L1 L2 L3 L4 L5

Weekly pivots/CPR
Monthly pivots/CPR
Yearly pivots/CPR

O = Regular-session open
```

---

# 3. Formula Engine

## CPR

```text
P  = (H + L + C) / 3
BC = (H + L) / 2
TC = 2P - BC

CPR_TOP    = max(TC, BC)
CPR_BOTTOM = min(TC, BC)

CPR_WIDTH = CPR_TOP - CPR_BOTTOM
```

PivotBoss uses the distance between TC and BC for CPR width analysis. citeturn0search0

## Floor Pivots

```text
R1 = 2P - L
R2 = P + (H - L)
R3 = R1 + (H - L)

S1 = 2P - H
S2 = P - (H - L)
S3 = S1 - (H - L)
```

## Camarilla

```text
RANGE = H - L

H5 = (H / L) × C
H4 = C + RANGE × 1.1 / 2
H3 = C + RANGE × 1.1 / 4
H2 = C + RANGE × 1.1 / 6
H1 = C + RANGE × 1.1 / 12

L1 = C - RANGE × 1.1 / 12
L2 = C - RANGE × 1.1 / 6
L3 = C - RANGE × 1.1 / 4
L4 = C - RANGE × 1.1 / 2
L5 = C - (H5 - C)
```

PivotBoss defines H3/L3 primarily as reversal levels and H4/L4 as breakout levels, with H5/L5 as breakout targets. citeturn0search3

---

# 4. Width Analysis

PivotBoss applies width analysis to CPR, Value Area, and Camarilla. An **extremely narrow** structure forecasts greater potential for trending/breakout behavior; an **extremely wide** structure forecasts greater potential for sideways/trading-range behavior. The operative word is "extremely." citeturn0search0turn0search1turn0search2

## CPR

```text
if CPR is extremely narrow:
    forecast = TREND / BREAKOUT

else if CPR is extremely wide:
    forecast = RANGE / SIDEWAYS

else:
    forecast = NEUTRAL
```

## Value Area

```text
VALUE_WIDTH = VAH - VAL

if VALUE_WIDTH is extremely narrow:
    forecast += BREAKOUT tendency

else if VALUE_WIDTH is extremely wide:
    forecast += RANGE tendency
```

## Camarilla

```text
CAM_WIDTH = H3 - L3

if CAM_WIDTH is extremely narrow:
    forecast += TREND tendency

else if CAM_WIDTH is extremely wide:
    forecast += RANGE tendency
```

Do not convert "extremely" into a fixed percentage without testing the instrument and timeframe.

---

# 5. Two-Day CPR Relationship

## Higher Value

```text
if Today's BC > Yesterday's TC:
    relationship = HIGHER_VALUE
    bias = BULLISH
```

Action:

```text
if price pulls back into support
and bullish confirmation appears:
    LONG candidate

else:
    wait
```

## Overlapping Higher

```text
if today's CPR shifts higher
and overlaps yesterday's:
    relationship = OVERLAPPING_HIGHER
    bias = MODERATELY_BULLISH
```

Action:

```text
if support rejects price upward:
    LONG candidate

else if price accepts below prior value:
    bullish thesis weakened

else:
    wait
```

## Lower Value

```text
if Today's TC < Yesterday's BC:
    relationship = LOWER_VALUE
    bias = BEARISH
```

Action:

```text
if price rallies into resistance
and bearish confirmation appears:
    SHORT candidate

else if price accepts above prior value:
    bearish thesis weakened

else:
    wait
```

PivotBoss gives a Lower Value example where the plan is to sell into modest strength while the bearish structure remains intact. citeturn0search6

## Overlapping Lower

```text
if today's CPR shifts lower
and overlaps yesterday's:
    relationship = OVERLAPPING_LOWER
    bias = MODERATELY_BEARISH
```

## Unchanged

```text
if today's CPR remains approximately at the prior location:
    relationship = UNCHANGED
    bias = NEUTRAL
```

Action:

```text
if breakout + acceptance:
    follow breakout

else:
    remain patient
```

## Inside CPR

```text
if Today's CPR is contained within Yesterday's CPR:
    relationship = INSIDE
    forecast = COMPRESSION / BREAKOUT
```

Then:

```text
if upper boundary breaks + accepts:
    LONG

else if lower boundary breaks + accepts:
    SHORT

else:
    WAIT
```

PivotBoss uses Inside Value/Inside relationships as compression/breakout conditions. citeturn0search4turn0search8

## Outside CPR

```text
if today's CPR expands beyond the prior CPR:
    relationship = OUTSIDE
```

Action:

```text
if clear acceptance develops on one side:
    follow that side

else:
    expect unstable/mixed behavior
```

---

# 6. Opening Engine

At the regular-session open:

```text
O = Today's Open
```

Compare O with:

```text
PDH
PDL
VAH
VAL
```

---

# 7. Opening Case A — In Range + In Value

Condition:

```text
PDL <= O <= PDH
AND
VAL <= O <= VAH
```

Classification:

```text
IN_RANGE + IN_VALUE
```

Action:

```text
if price remains inside value:
    WAIT

else if price breaks VAH and accepts:
    LONG

else if price breaks VAL and accepts:
    SHORT

else:
    NO TRADE
```

PivotBoss examples note that an open within prior range and value can indicate continued sideways development rather than immediate large movement. citeturn0search4

---

# 8. Opening Case B — In Range + Above Value

Condition:

```text
PDL <= O <= PDH
AND
O > VAH
```

Classification:

```text
IN_RANGE + ABOVE_VALUE
```

Initial bias:

```text
BULLISH
```

Decision tree:

```text
if price accepts above VAH:
    LONG candidate

else if price retests VAH
and rejects upward:
    LONG candidate

else if price returns below VAH:
    bullish thesis weakened

if price accepts back inside value:
    CANCEL bullish continuation thesis
```

---

# 9. Opening Case C — In Range + Below Value

Condition:

```text
PDL <= O <= PDH
AND
O < VAL
```

Initial bias:

```text
BEARISH
```

Decision tree:

```text
if price accepts below VAL:
    SHORT candidate

else if price retests VAL
and rejects downward:
    SHORT candidate

else if price reclaims VAL:
    bearish thesis weakened

if price accepts back inside value:
    CANCEL bearish continuation thesis
```

---

# 10. Opening Case D — Out of Range Above

Condition:

```text
O > PDH
```

If also:

```text
O > VAH
```

then:

```text
OUT_OF_RANGE
+
OUT_OF_VALUE
+
ABOVE
```

PivotBoss describes an opening beyond the prior day's range as a sign of changed sentiment and active search for new value. citeturn0search7

### First 15-minute confirmation

```text
if O > PDH:

    if first_15m_close > PDH:
        bullish opening confirmed

    else if first_15m_close < PDH:
        failed gap / rejection

    else:
        WAIT
```

PivotBoss's documented breakout example waits for the first 15-minute candle to confirm direction after an opening outside the prior range. citeturn0search7

### Confirmed

```text
LONG BIAS
```

Then prefer:

```text
pullback
retest of PDH
support confirmation
continuation
```

### Rejected

```text
do not chase LONG

watch:
    PDH
    VAH
    POC
    prior range
```

---

# 11. Opening Case E — Out of Range Below

Condition:

```text
O < PDL
```

Decision:

```text
if first_15m_close < PDL:
    bearish opening confirmed

else if first_15m_close > PDL:
    failed gap / rejection

else:
    WAIT
```

Confirmed:

```text
SHORT BIAS
```

Rejected:

```text
do not chase SHORT
watch PDL / VAL / POC / prior range
```

---

# 12. Opening Location Classification

For your implementation you can additionally classify:

```text
if O > H4:
    OPEN_ABOVE_H4

else if H3 < O <= H4:
    OPEN_H3_H4

else if CPR_TOP < O <= H3:
    OPEN_CPR_H3

else if CPR_BOTTOM <= O <= CPR_TOP:
    OPEN_INSIDE_CPR

else if L3 <= O < CPR_BOTTOM:
    OPEN_L3_CPR

else if L4 <= O < L3:
    OPEN_L4_L3

else:
    OPEN_BELOW_L4
```

This is an implementation extension for your KGS system, not a claim that PivotBoss publishes this exact seven-state opening classification.

---

# 13. Acceptance vs Rejection

## Acceptance

```text
if price moves outside a reference
AND
closes outside
AND
holds outside
AND
follow-through occurs:
    ACCEPTED
```

Possible references:

```text
VAH
VAL
PDH
PDL
H4
L4
CPR
Floor Pivot
```

## Rejection

```text
if price moves outside a reference
AND
fails to hold
AND
returns inside:
    REJECTED
```

### Rule

```text
ACCEPTANCE → continuation framework
REJECTION  → reversal / return-to-value framework
```

---

# 14. H3 Reversal

PivotBoss's basic Camarilla action:

```text
if price reaches H3:

    if bearish reversal confirmation:
        SHORT
        TARGET = L3

    else:
        WAIT
```

H3 is primarily a reversal level. citeturn0search3

Failure:

```text
if price accepts above H3:
    stop fading H3
    watch H4
```

---

# 15. L3 Reversal

```text
if price reaches L3:

    if bullish reversal confirmation:
        LONG
        TARGET = H3

    else:
        WAIT
```

L3 is primarily a reversal level. citeturn0search3

Failure:

```text
if price accepts below L3:
    stop fading L3
    watch L4
```

---

# 16. H4 Breakout

```text
if price reaches H4:

    if price rejects:
        no breakout trade

    else if price closes above H4
    and accepts:
        LONG
        TARGET = H5
```

PivotBoss defines H4 as the breakout layer and H5 as the target. citeturn0search3turn0search5

Failed breakout:

```text
if price breaks H4
but returns below H4:
    breakout_failed = TRUE
    watch H3 / value / prior resistance
```

---

# 17. L4 Breakdown

```text
if price reaches L4:

    if price rejects:
        no breakdown trade

    else if price closes below L4
    and accepts:
        SHORT
        TARGET = L5
```

Failed breakdown:

```text
if price breaks L4
but returns above L4:
    breakdown_failed = TRUE
    watch L3 / value / prior support
```

---

# 18. Wide Camarilla

```text
if H3-L3 is extremely wide:
    RANGE_MODE = TRUE
```

Then:

```text
if price is near L3/L2/L1
and bullish rejection:
    LONG candidate

if price is near H3/H2/H1
and bearish rejection:
    SHORT candidate
```

PivotBoss specifically notes that wide Camarilla pivots support expectations of sideways/range behavior and can justify shorter moves/tighter stops. citeturn0search2

---

# 19. Narrow Camarilla

```text
if H3-L3 is extremely narrow:
    BREAKOUT_MODE = TRUE
```

Then:

```text
if price breaks upside structure
and accepts:
    LONG

else if price breaks downside structure
and accepts:
    SHORT

else:
    WAIT
```

---

# 20. Inside-Day Algorithm

Condition:

```text
Today's High < Yesterday's High
AND
Today's Low > Yesterday's Low
```

Classification:

```text
INSIDE_DAY
```

Action:

```text
if outer upper boundary breaks + accepts:
    LONG

else if outer lower boundary breaks + accepts:
    SHORT

else:
    WAIT
```

PivotBoss examples describe Inside Day as a breakout relationship and emphasize watching the outer boundaries of the two-day range. citeturn0search8

---

# 21. Initial Balance

Define:

```text
IBH = Initial Balance High
IBL = Initial Balance Low

IB_RANGE = IBH - IBL
```

PivotBoss describes the Initial Balance as the base of the day's auction. A narrow IB is easier to break; a wide IB is harder to break. citeturn0search19

### Narrow IB

```text
if IB_RANGE is narrow:

    breakout potential = HIGHER
```

Then:

```text
if IBH breaks + accepts:
    bullish range extension candidate

else if IBL breaks + accepts:
    bearish range extension candidate

else:
    WAIT
```

---

# 22. Double-Distribution Trend Day

```text
if Initial Balance is narrow
AND
IB breaks
AND
initiative participants drive price away from value:

    DAY_TYPE = DOUBLE_DISTRIBUTION_TREND
```

Action:

```text
trade direction of range extension

avoid repeatedly fading the move

watch for development of new value
```

PivotBoss's source describes this exact sequence: narrow initial balance, breakout, then movement toward new value. citeturn0search19

---

# 23. Trend-Day Engine

High-level implementation:

```text
if:
    extremely narrow pivot
    AND
    opening displacement
    AND
    acceptance outside value/range
    AND
    initiative behavior:

    DAY_TYPE = TREND
```

Action:

```text
UP:
    buy pullbacks/support

DOWN:
    sell rallies/resistance
```

Do not repeatedly fade a confirmed initiative trend.

---

# 24. Trading-Range Engine

```text
if:
    extremely wide pivot
    AND
    open inside range/value
    AND
    repeated rejection at extremes
    AND
    no sustained initiative behavior:

    DAY_TYPE = RANGE
```

Action:

```text
LOWER EXTREME + bullish rejection → LONG
UPPER EXTREME + bearish rejection → SHORT
```

If breakout becomes accepted:

```text
RANGE_THESIS = INVALID
switch to breakout framework
```

---

# 25. Sideways-Day Engine

```text
if:
    wide/normal structure
    AND
    low participation
    AND
    no meaningful range extension
    AND
    price remains balanced:

    DAY_TYPE = SIDEWAYS
```

Action:

```text
if no clean setup:
    NO TRADE
```

---

# 26. Trend-Following Pivot Rule

Core implementation:

```text
if higher-timeframe trend == BULLISH:
    prioritize support

else if higher-timeframe trend == BEARISH:
    prioritize resistance

else:
    wait for clearer structure
```

At a support level:

```text
if bullish rejection:
    LONG candidate
```

At resistance:

```text
if bearish rejection:
    SHORT candidate
```

---

# 27. CPR Support in Uptrend

```text
if trend == BULLISH
AND
price pulls into CPR:

    if bullish rejection:
        LONG

    else:
        WAIT
```

Do not buy CPR merely because price touches it.

---

# 28. CPR Resistance in Downtrend

```text
if trend == BEARISH
AND
price rallies into CPR:

    if bearish rejection:
        SHORT

    else:
        WAIT
```

---

# 29. Floor Pivot Breakout

```text
if price breaks R1
AND
accepts above:
    LONG continuation
    TARGET = R2

if price breaks R2
AND
accepts above:
    TARGET = R3
```

Bearish:

```text
if price breaks S1
AND
accepts below:
    SHORT continuation
    TARGET = S2

if price breaks S2
AND
accepts below:
    TARGET = S3
```

These are implementation rules using the standard Floor Pivot ladder.

---

# 30. Floor Pivot Reversal

```text
if price reaches a major pivot
AND
context supports reversal
AND
reversal candle appears:

    trade reversal

else:
    WAIT
```

---

# 31. Hot Zone

A Hot Zone is created when independent methods converge around the same price.

Example:

```text
Daily CPR
+
Weekly CPR
+
VAH
+
H3
```

If they cluster:

```text
HOT_ZONE = TRUE
```

Then:

```text
if price reaches zone:

    if bullish rejection:
        LONG

    else if bearish rejection:
        SHORT

    else if clean acceptance through:
        BREAKOUT / CONTINUATION

    else:
        WAIT
```

The zone is a location, not an automatic entry.

---

# 32. Double Pivot Zone

Examples:

```text
R1 ≈ H3
S1 ≈ L3
```

Implementation:

```text
if price enters DPZ:

    if rejection:
        reversal candidate

    else if acceptance through:
        continuation candidate
```

---

# 33. Higher-Timeframe Confluence

Example:

```text
Monthly resistance
+
Weekly resistance
+
Daily H3
```

Then:

```text
if bearish rejection:
    SHORT candidate

else if bullish acceptance:
    resistance failed
    target next higher-timeframe level
```

Same logic for support.

---

# 34. Pivot + Value Confluence

```text
if R1 ≈ VAH:
    resistance_zone = TRUE

if S1 ≈ VAL:
    support_zone = TRUE
```

At resistance:

```text
rejection → SHORT / long-profit management
acceptance → LONG continuation
```

At support:

```text
rejection → LONG
acceptance below → SHORT continuation
```

---

# 35. Pivot + Camarilla Confluence

```text
if R1 ≈ H3:
    resistance_zone

if S1 ≈ L3:
    support_zone
```

Decision:

```text
rejection → reversal
acceptance → breakout
```

---

# 36. VPOC + Pivot Confluence

If:

```text
VPOC ≈ H4
```

then:

```text
H4 has volume confluence
```

If H4 breaks:

```text
first target = next major volume area if closer
then H5 if acceptance continues
```

PivotBoss examples explicitly use VPOC/HVA as important target/support references around Camarilla levels. citeturn0search5turn0search10

---

# 37. Gap + Value Decision Tree

## Gap above

```text
if O > PDH
AND O > VAH:

    bullish_candidate = TRUE

    if first 15m closes above:
        CONFIRMED

    else:
        WAIT / FAILURE WATCH
```

## Gap below

```text
if O < PDL
AND O < VAL:

    bearish_candidate = TRUE

    if first 15m closes below:
        CONFIRMED

    else:
        WAIT / FAILURE WATCH
```

---

# 38. Failed Gap

## Gap up failure

```text
O > PDH
→ price trades above
→ candle closes back below PDH
```

Then:

```text
gap_up_failed = TRUE
```

Action:

```text
avoid chasing long
watch return toward prior range/value
```

## Gap down failure

```text
O < PDL
→ price trades below
→ candle closes back above PDL
```

Then:

```text
gap_down_failed = TRUE
```

Action:

```text
avoid chasing short
watch return toward prior range/value
```

---

# 39. Return-to-Value Algorithm

```text
if price moves outside VAH/VAL
AND
cannot hold
AND
returns into value:

    STATE = RETURN_TO_VALUE
```

Potential targets:

```text
POC
opposite value boundary
central pivot
nearest accepted-value reference
```

---

# 40. Acceptance Outside Value

```text
if price > VAH
AND
closes above
AND
holds above
AND
continues:

    STATE = ACCEPTED_ABOVE_VALUE
```

Action:

```text
favor LONG pullbacks
avoid automatically fading
```

Mirror for below VAL.

---

# 41. Wick Reversal

## Bullish

```text
if price reaches support
AND
lower wick rejects
AND
close is away from low:

    LONG candidate
```

## Bearish

```text
if price reaches resistance
AND
upper wick rejects
AND
close is away from high:

    SHORT candidate
```

The location matters more than the candle shape by itself.

---

# 42. Outside Reversal

```text
if current candle expands beyond previous range
AND
expansion fails
AND
price reverses through prior range:

    reversal candidate
```

Downside failure:

```text
LONG
```

Upside failure:

```text
SHORT
```

---

# 43. Doji

```text
if doji occurs at major support/resistance:
    WAIT for next directional confirmation
```

Do not:

```text
doji anywhere → automatic trade
```

---

# 44. Extreme Reversal

```text
if price is extended
AND
price reaches major pivot/hot zone
AND
strong rejection occurs:

    counter-trend reversal candidate
```

Without rejection:

```text
WAIT
```

---

# 45. Conflict Resolution

## Narrow CPR but market stays balanced

```text
forecast = TREND
actual = BALANCE
```

Action:

```text
trust actual behavior
wait for breakout
```

## Wide CPR but market gaps strongly

```text
forecast = RANGE
actual = INITIATIVE
```

Action:

```text
do not fade automatically
wait for acceptance/rejection
```

## Bullish CPR but bearish opening

```text
pre-market = BULLISH
open = BEARISH
```

Action:

```text
if bearish acceptance continues:
    invalidate bullish thesis

else if bearish move rejects support:
    bullish thesis can recover
```

---

# 46. Primary + Contingency Plan

Every trade idea should be written as:

```text
PRIMARY:
IF X
THEN Y

CONTINGENCY:
IF NOT X
THEN Z

NO-TRADE:
IF neither condition occurs
THEN WAIT
```

Example:

```text
PRIMARY:
Open above CPR
→ buy weakness into CPR
→ target higher levels

CONTINGENCY:
Gap below CPR
→ sell strength into CPR
→ target lower levels

NO TRADE:
Price remains trapped around CPR
→ wait
```

PivotBoss examples explicitly use this primary/contingency approach. citeturn0search11

---

# 47. Complete Live Decision Tree

```text
START
  │
  ├─ Calculate CPR / Pivots / Camarilla / Value
  │
  ├─ Determine widths
  │      ├─ Narrow → TREND candidate
  │      ├─ Wide   → RANGE candidate
  │      └─ Normal → NEUTRAL
  │
  ├─ Determine two-day relationship
  │      ├─ Higher
  │      ├─ Overlap Higher
  │      ├─ Unchanged
  │      ├─ Overlap Lower
  │      ├─ Lower
  │      ├─ Inside
  │      └─ Outside
  │
  ├─ 09:15 OPEN
  │      │
  │      ├─ Above PDH?
  │      │      ├─ YES → first 15m confirmation
  │      │      └─ NO
  │      │
  │      ├─ Below PDL?
  │      │      ├─ YES → first 15m confirmation
  │      │      └─ NO
  │      │
  │      └─ Inside range
  │             ├─ Above VAH?
  │             ├─ Below VAL?
  │             └─ Inside value?
  │
  ├─ Acceptance or rejection?
  │      ├─ Acceptance → continuation
  │      ├─ Rejection → reversal / return to value
  │      └─ Neither → WAIT
  │
  ├─ Is price at important location?
  │      ├─ VAH / VAL / POC
  │      ├─ CPR
  │      ├─ H3 / L3
  │      ├─ H4 / L4
  │      ├─ Floor Pivot
  │      └─ Hot Zone
  │
  ├─ Trigger?
  │      ├─ Wick reversal
  │      ├─ Outside reversal
  │      ├─ Extreme reversal
  │      ├─ Doji + confirmation
  │      └─ Breakout acceptance
  │
  ├─ ENTER
  │
  ├─ INVALIDATION
  │
  ├─ TARGET
  │
  └─ CONTINGENCY
```

---

# 48. No-Trade Rules

```text
if price is in middle of value
and no directional acceptance:
    NO TRADE

if forecast = trend
but price has no breakout:
    WAIT

if forecast = range
but price is in the middle:
    WAIT for extreme

if breakout occurs
but immediately fails:
    NO continuation trade

if reversal level is touched
but no reversal confirmation:
    WAIT

if primary and contingency plans are both invalid:
    NO TRADE
```

---

# 49. Backtesting Rules

Every signal must use only information available at that time.

At 09:15 you may use:

```text
Previous High
Previous Low
Previous Close
Previous VAH
Previous POC
Previous VAL
Today's calculated CPR
Today's calculated pivots
Today's calculated Camarilla
```

Do not use future session values to generate an opening signal.

Recommended state machine:

```text
PREMARKET
    ↓
OPEN_CLASSIFIED
    ↓
WAIT_CONFIRMATION
    ↓
CONFIRMED_LONG
or
CONFIRMED_SHORT
or
NO_TRADE
    ↓
ACTIVE_TRADE
    ↓
TARGET
or
STOP
or
INVALIDATED
```

---

# 50. Backtest Each Method Separately

Do not only test the combined strategy.

Test:

```text
1. Narrow CPR
2. Wide CPR
3. Narrow Value Area
4. Wide Value Area
5. Narrow Camarilla
6. Wide Camarilla
7. Higher Value
8. Lower Value
9. Inside Value
10. Inside Day
11. Gap Above PDH
12. Gap Below PDL
13. H3 Reversal
14. L3 Reversal
15. H4 Breakout
16. L4 Breakdown
17. CPR Pullback
18. Hot Zone Reversal
19. Return-to-Value
20. Initial Balance Breakout
```

Measure:

```text
Win rate
Average R
Expectancy
Maximum drawdown
False-breakout rate
Average favorable excursion
Average adverse excursion
Time to target
Time in trade
```

---

# 51. Implementation Architecture

For Pine/Python:

```text
data.py
pivots.py
cpr.py
camarilla.py
market_profile.py
width_analysis.py
opening_analysis.py
day_type.py
confluence.py
price_action.py
trade_plan.py
risk.py
backtester.py
```

Each module should return facts.

Example:

```python
opening_state = {
    "range_relation": "OUTSIDE_ABOVE",
    "value_relation": "OUTSIDE_ABOVE",
    "bias": "BULLISH",
    "first_15m_confirmed": False,
}
```

The trade engine then decides whether a position is permitted.

---

# 52. Final Real-Time Questions

At any moment ask:

```text
1. What regime was forecast?

2. What did the market actually do?

3. Where did we open relative to prior range?

4. Where did we open relative to prior value?

5. Has the opening condition been accepted or rejected?

6. Is price at a meaningful pivot/value/Camarilla zone?

7. Is that zone support or resistance in the current trend?

8. Is there a valid reversal or breakout trigger?

9. Where is the thesis invalidated?

10. What is the next structural target?

11. What is the contingency if the thesis fails?
```

If the answer to the critical confirmation questions is unclear:

```text
WAIT.
```

---

# 53. One-Page Live Checklist

```text
PREMARKET
[ ] PDH
[ ] PDL
[ ] PDC
[ ] VAH
[ ] POC
[ ] VAL
[ ] CPR
[ ] Floor Pivots
[ ] Camarilla
[ ] Weekly levels
[ ] Monthly levels

FORECAST
[ ] CPR width
[ ] Value width
[ ] Camarilla width
[ ] Two-day CPR relationship
[ ] Value relationship
[ ] Expected day type

OPEN
[ ] In range?
[ ] Outside range?
[ ] In value?
[ ] Above value?
[ ] Below value?
[ ] Above H4?
[ ] H3-H4?
[ ] CPR?
[ ] L3-CPR?
[ ] L4-L3?
[ ] Below L4?

CONFIRMATION
[ ] First 15m confirmation if gap
[ ] Acceptance?
[ ] Rejection?
[ ] Trend?
[ ] Range?

LOCATION
[ ] VAH/VAL/POC
[ ] CPR
[ ] H3/L3
[ ] H4/L4
[ ] Floor Pivot
[ ] Hot Zone

TRIGGER
[ ] Wick
[ ] Outside reversal
[ ] Extreme reversal
[ ] Doji confirmation
[ ] Breakout acceptance

TRADE
[ ] Entry
[ ] Invalidation
[ ] Target 1
[ ] Target 2
[ ] Contingency
```

---

# 54. Core Rules to Memorize

```text
NARROW → prepare for trend
WIDE → prepare for range

HIGHER VALUE → bullish
LOWER VALUE → bearish

INSIDE VALUE → breakout watch

OPEN OUTSIDE RANGE → sentiment changed; wait for confirmation

FIRST 15m CONFIRMATION → important for opening-breakout setups

H3 → reversal
L3 → reversal

H4 → breakout
L4 → breakdown

H4 → H5 target
L4 → L5 target

CPR → support in uptrend
CPR → resistance in downtrend

ACCEPTANCE → continuation
REJECTION → reversal / return to value

HOT ZONE → location, not automatic entry

FORECAST ≠ TRADE

PRICE MUST CONFIRM THE THESIS
```

---

# 55. Source-Derived vs Implementation Rules

## Supported directly by PivotBoss material

- CPR width forecasting
- Value Area width forecasting
- Camarilla width forecasting
- H3/L3 reversal
- H4/L4 breakout
- H5/L5 targets
- Opening outside prior range
- First 15-minute confirmation
- Higher/Lower/Inside/Outside pivot relationships
- Initial Balance
- Market Profile / Value Area
- VPOC and volume-area confluence
- Pivot trend
- Hot-zone/confluence thinking
- Primary/contingency trade plans

These are supported by PivotBoss's official educational sources. citeturn0search0turn0search1turn0search2turn0search3turn0search5turn0search7turn0search11

## Implementation additions

The following are deliberately presented as implementation recommendations rather than direct quotations/rules from PivotBoss:

- deterministic `if / elif / else` state machine
- seven-state opening-location classifier around H4/H3/CPR/L3/L4
- software module architecture
- exact backtest fields
- conflict-resolution priority
- explicit no-trade states
- automation-oriented pseudocode
- combining multiple PivotBoss concepts into one algorithm
- translating qualitative confirmation into programmatic conditions

These should be backtested independently before being treated as trading rules.

---

# 56. Final Operating Model

```text
                 PIVOTBOSS MARKET ENGINE

                       PREVIOUS DAY
                            │
              ┌─────────────┴─────────────┐
              │                           │
            RANGE                       VALUE
         PDH / PDL                 VAH / POC / VAL
              │                           │
              └─────────────┬─────────────┘
                            ↓
                     PIVOT STRUCTURE
                            │
            ┌───────────────┼───────────────┐
            ↓               ↓               ↓
           CPR          FLOOR PIVOTS     CAMARILLA
            │               │               │
            └───────────────┼───────────────┘
                            ↓
                     WIDTH ANALYSIS
                            ↓
                    TWO-DAY RELATIONSHIP
                            ↓
                     OPENING RELATIONSHIP
                            ↓
                   ACCEPTANCE / REJECTION
                            ↓
                     MARKET DAY TYPE
                            ↓
                      TRADE LOCATION
                            ↓
                    PRICE-ACTION TRIGGER
                            ↓
                         ENTRY
                            ↓
                    INVALIDATION
                            ↓
                         TARGET
                            ↓
                       CONTINGENCY
```

The key operating philosophy is:

> **Forecast first, observe the open, let price prove or disprove the forecast, trade only at meaningful locations, and always define what invalidates the thesis.**

