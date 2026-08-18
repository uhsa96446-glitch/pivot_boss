export function buildState(data) {
    const p = data.previous_session || {},
        pv = data.pivots || {},
        va = data.value_area || {},
        pred = data.predictions || {},
        s = pred.scenarios || {},
        day = pred.day_type || {},
        first15m = data.first_15m_candle || null,
        ib = data.initial_balance || null;

    // Use live candle close (IB close or 15m close) if available, else current session close, else previous close
    const close = ib?.close || first15m?.close || data.today_full?.close || p.close || 0;
    const prevClose = p.close || 0;
    const openClass = data.opening_classification || "PENDING";

    const inValue = (close >= va.VAL && close <= va.VAH) || openClass === "IN_VALUE";
    const aboveValue = close > va.VAH || openClass === "ABOVE_VALUE" || openClass === "OUT_ABOVE";
    const belowValue = close < va.VAL || openClass === "BELOW_VALUE" || openClass === "OUT_BELOW";

    const cprTop = Math.max(pv.TC || 0, pv.BC || 0);
    const cprBottom = Math.min(pv.TC || 0, pv.BC || 0);
    const hasGPZ =
        (pv.L3 >= cprBottom && pv.L3 <= cprTop) ||
        (pv.H3 >= cprBottom && pv.H3 <= cprTop);

    let participant = "BALANCED AUCTION";
    if (aboveValue) participant = "INITIATIVE BUYER / BULLISH";
    if (belowValue) participant = "INITIATIVE SELLER / BEARISH";

    let action = "WAIT",
        tone = "yellow",
        headline = "Wait for price to reach a decision area.";

    if (belowValue) {
        action = "LOOK FOR SHORT";
        tone = "red";
        headline = `Price (${close}) accepted below VAL (${va.VAL}) — Initiative Bearish. Look for short entries toward S1/S2.`;
    } else if (aboveValue) {
        action = "LOOK FOR LONG";
        tone = "green";
        headline = `Price (${close}) accepted above VAH (${va.VAH}) — Initiative Bullish. Look for long entries toward R1/R2.`;
    } else {
        action = "WAIT (IN VALUE)";
        tone = "yellow";
        headline = `Price (${close}) is inside value area (${va.VAL} - ${va.VAH}) — avoid trading the middle. Watch VAH & VAL extremes.`;
    }

    // Calculate Camarilla Opening Location (Section 12 of Playbook)
    const openPrice = first15m?.open || ib?.open || data.today_full?.open || close;
    let camOpenClass = "INSIDE_CAM";
    if (pv.H5 && openPrice > pv.H5) camOpenClass = "ABOVE_H5";
    else if (pv.H4 && openPrice > pv.H4) camOpenClass = "ABOVE_H4";
    else if (pv.H3 && pv.H4 && openPrice > pv.H3 && openPrice <= pv.H4) camOpenClass = "H3_H4_ZONE";
    else if (pv.H3 && openPrice > cprTop && openPrice <= pv.H3) camOpenClass = "CPR_H3_ZONE";
    else if (openPrice >= cprBottom && openPrice <= cprTop) camOpenClass = "INSIDE_CPR";
    else if (pv.L3 && openPrice >= pv.L3 && openPrice < cprBottom) camOpenClass = "L3_CPR_ZONE";
    else if (pv.L3 && pv.L4 && openPrice >= pv.L4 && openPrice < pv.L3) camOpenClass = "L4_L3_ZONE";
    else if (pv.L5 && openPrice < pv.L5) camOpenClass = "BELOW_L5";
    else if (pv.L4 && openPrice < pv.L4) camOpenClass = "BELOW_L4";

    // CPR Width Forecast (Section 4 of Playbook)
    const cprWidth = pv.CPR_WIDTH || (cprTop - cprBottom);
    let cprWidthForecast = "NORMAL";
    if (cprWidth > 0) {
        const relWidthPct = (cprWidth / (close || 1)) * 100;
        if (relWidthPct < 0.25) cprWidthForecast = "NARROW (TREND)";
        else if (relWidthPct > 0.6) cprWidthForecast = "WIDE (RANGE)";
    }

    // PivotBoss Dual-Bias Regime Engine (Macro 2-Day CPR + Micro Opening Action) §4, §5, §10, §11, §45
    const isOpenAboveH5 = pv.H5 && openPrice > pv.H5;
    const isOpenBelowL5 = pv.L5 && openPrice < pv.L5;
    const isGapUp = openClass === "OUT_ABOVE" || openClass === "OUTSIDE_ABOVE";
    const isGapDown = openClass === "OUT_BELOW" || openClass === "OUTSIDE_BELOW";

    // 1. MACRO STRUCTURAL BIAS (2-Day CPR Relationship & Squeeze Analysis - §5)
    const twoDay = data.two_day_relationship || "LOWER_VALUE";
    const isHigherVal = twoDay === "HIGHER_VALUE" || twoDay === "OVERLAPPING_HIGHER";
    const isLowerVal = twoDay === "LOWER_VALUE" || twoDay === "OVERLAPPING_LOWER";
    const isInsideCPR = twoDay === "INSIDE";
    const isNarrowCPR = cprWidthForecast.includes("NARROW");
    const isWideCPR = cprWidthForecast.includes("WIDE");

    let macroBias = "NEUTRAL";
    if (isHigherVal) macroBias = "BULLISH";
    else if (isLowerVal) macroBias = "BEARISH";
    else if (isInsideCPR) macroBias = "COMPRESSION";

    // 2. MICRO INTRADAY ACTION (15m Opening Acceptance vs Rejection - §10, §11)
    const pdh = p.high || 0;
    const pdl = p.low || 0;
    const candleClose = first15m?.close || close;
    const has15mClosed = Boolean(first15m && first15m.close);

    const is15mAcceptedAbovePDH = has15mClosed && candleClose > pdh;
    const is15mAcceptedBelowPDL = has15mClosed && candleClose < pdl;
    const is15mRejected = has15mClosed
        ? (isGapUp && candleClose < pdh) || (isGapDown && candleClose > pdl) || first15m.acceptance === "REJECTED" || first15m.acceptance === "INSIDE_VALUE"
        : false;

    // 3. SYNTHESIZE REGIME — Exhaustive Macro × Micro Combination Matrix (§4, §5, §10, §11, §45)
    //
    // MACRO:  BULLISH | BEARISH | COMPRESSION | NEUTRAL
    // MICRO:  GAP_UP_ACCEPTED | GAP_UP_REJECTED | GAP_DOWN_ACCEPTED | GAP_DOWN_REJECTED | IN_RANGE
    //
    // All 20 combinations are handled explicitly below, with WILD MOVE as priority override.

    let regime = "SIDEWAYS / BALANCED";
    let regimeTone = "yellow";
    let regimeDesc = `Macro: ${macroBias} · Balanced Auction. Fade VAL/L3 & VAH/H3; avoid the middle.`;

    // ── PRIORITY 0: Extreme Displacement Override (Wild Move) ──────────────────
    if (isOpenAboveH5 || isOpenBelowL5 || (hasGPZ && isNarrowCPR)) {
        regime = "WILD MOVE (HIGH VOLATILITY)";
        regimeTone = "purple";
        regimeDesc = `Macro: ${macroBias} · Micro: Open beyond H5/L5 (extreme shock). Reduce size 50%; wait for IB before entering.`;
    }

    // ── PRIORITY 1: GAP UP scenarios ───────────────────────────────────────────
    // Micro: Gap Up Accepted (15m close > PDH) — Initiative Buy Breakout
    else if (isGapUp && is15mAcceptedAbovePDH) {
        if (macroBias === "BULLISH") {
            regime = "STRONG BULLISH (INITIATIVE)";
            regimeTone = "green";
            regimeDesc = `Macro: Higher CPR (${twoDay}) + Micro: Gap Up Accepted. MAX BULLISH. Add on VWAP/PDH pullbacks. Targets: H4 → H5.`;
        } else if (macroBias === "BEARISH") {
            regime = "STRONG BULLISH (INITIATIVE)";
            regimeTone = "green";
            regimeDesc = `Macro: ${twoDay} BUT Micro: Gap Up Accepted overrides. §45 Conflict: Trust price behavior. Buy carefully; gap may be overdone. Targets: H3/VAH.`;
        } else if (macroBias === "COMPRESSION") {
            regime = "STRONG BULLISH (INITIATIVE)";
            regimeTone = "green";
            regimeDesc = `Macro: CPR Compression (Inside Day) · Micro: Gap Up Accepted — Compression breakout to upside. Targets: H4 → H5. Trailing stops only.`;
        } else {
            regime = "STRONG BULLISH (INITIATIVE)";
            regimeTone = "green";
            regimeDesc = `Macro: Neutral CPR · Micro: Gap Up Accepted. Buy VWAP/PDH pullbacks. Targets: H3 → H4 → R1.`;
        }
    }

    // Micro: Gap Up Rejected (15m close < PDH) — Failed Gap, Bearish Reversal
    else if (isGapUp && is15mRejected) {
        if (macroBias === "BULLISH") {
            regime = "SIDEWAYS TO BULLISH";
            regimeTone = "green";
            regimeDesc = `Macro: Higher CPR (${twoDay}) · Micro: Failed Gap Up. §45: Macro bias intact. Gap fill likely short-lived. Buy VAH/PDH support dips. Targets: POC → VAH.`;
        } else if (macroBias === "BEARISH") {
            regime = "SIDEWAYS TO BEARISH";
            regimeTone = "red";
            regimeDesc = `Macro: Lower CPR (${twoDay}) + Micro: Failed Gap Up confirmed. §45: Macro & Micro aligned bearish. Sell CPR/VAH rejections. Targets: POC → VAL → S1.`;
        } else if (macroBias === "COMPRESSION") {
            regime = "SIDEWAYS / BALANCED";
            regimeTone = "yellow";
            regimeDesc = `Macro: CPR Compression · Micro: Failed Gap Up. Compression still active. Range-bound between 2-day high/low. Fade extremes only.`;
        } else {
            regime = "SIDEWAYS TO BEARISH";
            regimeTone = "red";
            regimeDesc = `Macro: Neutral CPR · Micro: Failed Gap Up (gap fill in progress). Sell CPR/VAH. Targets: POC (${va.POC?.toFixed(1) || "—"}) → VAL.`;
        }
    }

    // ── PRIORITY 2: GAP DOWN scenarios ─────────────────────────────────────────
    // Micro: Gap Down Accepted (15m close < PDL) — Initiative Sell Breakdown
    else if (isGapDown && is15mAcceptedBelowPDL) {
        if (macroBias === "BEARISH") {
            regime = "STRONG BEARISH (INITIATIVE)";
            regimeTone = "red";
            regimeDesc = `Macro: Lower CPR (${twoDay}) + Micro: Gap Down Accepted. MAX BEARISH. Sell VWAP/PDL rallies. Targets: L4 → L5 → S2.`;
        } else if (macroBias === "BULLISH") {
            regime = "STRONG BEARISH (INITIATIVE)";
            regimeTone = "red";
            regimeDesc = `Macro: ${twoDay} BUT Micro: Gap Down Accepted overrides. §45 Conflict: Trust price. Sell carefully; watch for V-bottom. Targets: L3/VAL.`;
        } else if (macroBias === "COMPRESSION") {
            regime = "STRONG BEARISH (INITIATIVE)";
            regimeTone = "red";
            regimeDesc = `Macro: CPR Compression · Micro: Gap Down Accepted — Compression breakdown to downside. Targets: L4 → L5. Trailing stops only.`;
        } else {
            regime = "STRONG BEARISH (INITIATIVE)";
            regimeTone = "red";
            regimeDesc = `Macro: Neutral CPR · Micro: Gap Down Accepted. Sell VWAP/PDL rallies. Targets: L3 → L4 → S1.`;
        }
    }

    // Micro: Gap Down Rejected (15m close > PDL) — Failed Gap, Bullish Reversal
    else if (isGapDown && is15mRejected) {
        if (macroBias === "BULLISH") {
            regime = "SIDEWAYS TO BULLISH";
            regimeTone = "green";
            regimeDesc = `Macro: Higher CPR (${twoDay}) + Micro: Failed Gap Down confirmed. §45: Both aligned bullish. Buy PDL/VAL support dip. Targets: POC (${va.POC?.toFixed(1) || "—"}) → VAH.`;
        } else if (macroBias === "BEARISH") {
            regime = "SIDEWAYS TO BULLISH";
            regimeTone = "green";
            regimeDesc = `Macro: Lower CPR (${twoDay}) but Micro: Failed Gap Down. §45 Conflict: Cautious gap-fill only. Targets: POC max. Reassess if POC rejected.`;
        } else if (macroBias === "COMPRESSION") {
            regime = "SIDEWAYS / BALANCED";
            regimeTone = "yellow";
            regimeDesc = `Macro: CPR Compression · Micro: Failed Gap Down. Compression holds. Range-bound. Fade 2-day high/low boundaries only.`;
        } else {
            regime = "SIDEWAYS TO BULLISH";
            regimeTone = "green";
            regimeDesc = `Macro: Neutral CPR · Micro: Failed Gap Down (in-range recovery). Buy PDL/VAL support. Targets: POC (${va.POC?.toFixed(1) || "—"}) → VAH.`;
        }
    }

    // ── PRIORITY 3: IN-RANGE opens (no gap) ────────────────────────────────────
    else {
        const inRangeMicro = isNarrowCPR ? "Narrow CPR (trend compression — watch for breakout)"
            : isWideCPR ? "Wide CPR (range bias — fade extremes)"
                : "In-Range Open (balanced)";

        if (macroBias === "BULLISH" && isNarrowCPR) {
            regime = "SIDEWAYS TO BULLISH";
            regimeTone = "green";
            regimeDesc = `Macro: Higher CPR (${twoDay}) + Narrow CPR. Trend day setup if VAH breaks. Buy CPR/VAL pullbacks. Targets: VAH → H3 → R1.`;
        } else if (macroBias === "BULLISH" && isWideCPR) {
            regime = "SIDEWAYS TO BULLISH";
            regimeTone = "green";
            regimeDesc = `Macro: Higher CPR (${twoDay}) + Wide CPR (range bias). Responsive buyers at VAL/L3 extremes. Targets: POC → VAH. No chase.`;
        } else if (macroBias === "BULLISH") {
            regime = "SIDEWAYS TO BULLISH";
            regimeTone = "green";
            regimeDesc = `Macro: Higher CPR (${twoDay}) · ${inRangeMicro}. Buy lower-wick rejections at CPR / VAL / L3 support.`;
        } else if (macroBias === "BEARISH" && isNarrowCPR) {
            regime = "SIDEWAYS TO BEARISH";
            regimeTone = "red";
            regimeDesc = `Macro: Lower CPR (${twoDay}) + Narrow CPR. Trend day setup if VAL breaks. Sell CPR/VAH rally. Targets: VAL → L3 → S1.`;
        } else if (macroBias === "BEARISH" && isWideCPR) {
            regime = "SIDEWAYS TO BEARISH";
            regimeTone = "red";
            regimeDesc = `Macro: Lower CPR (${twoDay}) + Wide CPR (range bias). Responsive sellers at VAH/H3 extremes. Targets: POC → VAL. No chase.`;
        } else if (macroBias === "BEARISH") {
            regime = "SIDEWAYS TO BEARISH";
            regimeTone = "red";
            regimeDesc = `Macro: Lower CPR (${twoDay}) · ${inRangeMicro}. Sell upper-wick rejections at CPR / VAH / H3 resistance.`;
        } else if (macroBias === "COMPRESSION") {
            regime = "SIDEWAYS (CPR COMPRESSION)";
            regimeTone = "yellow";
            regimeDesc = `Macro: Inside CPR (Compression Day) · ${inRangeMicro}. High-volatility breakout imminent. Wait for 2-day high/low breach before trading.`;
        } else {
            // NEUTRAL macro + in-range micro
            regime = isWideCPR ? "SIDEWAYS / BALANCED" : isNarrowCPR ? "SIDEWAYS (COMPRESSION WATCH)" : "SIDEWAYS / BALANCED";
            regimeTone = "yellow";
            regimeDesc = `Macro: Neutral CPR · ${inRangeMicro}. No structural bias. Fade VAL/L3 & VAH/H3 extremes only; strictly NO TRADE in the middle.`;
        }
    }

    return {
        p: { ...p, close },
        pv,
        prevClose,
        va,
        pred,
        s,
        day,
        inValue,
        aboveValue,
        belowValue,
        hasGPZ,
        participant,
        twoDayRel: twoDay,
        action,
        tone,
        headline,
        rangePct: close ? ((p.high - p.low) / close) * 100 : 0,
        camOpenClass,
        cprWidthForecast,
        regime,
        regimeTone,
        regimeDesc,
        ib,
    };
}


export function levelRows(st) {
    const { pv, va } = st;
    return [
        ["R2", pv.R2, "resistance", "green"],
        ["R1", pv.R1, "resistance", "green"],
        ["VAH", va.VAH, "value high", "green"],
        ["POC", va.POC, "value / magnet", "yellow"],
        ["VAL", va.VAL, "value low", "red"],
        ["S1", pv.S1, "support", "red"],
        ["S2", pv.S2, "support", "red"],
    ].filter((x) => typeof x[1] === "number");
}

