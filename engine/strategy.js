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

    // PivotBoss 5-State Market Regime Classifier (§4, §5, §6–11, §12, §13, §22, §23, §24, §25, §42)
    const isOpenAboveH5 = pv.H5 && openPrice > pv.H5;
    const isOpenBelowL5 = pv.L5 && openPrice < pv.L5;
    const isGapUp = openClass === "OUT_ABOVE" || openClass === "OUTSIDE_ABOVE";
    const isGapDown = openClass === "OUT_BELOW" || openClass === "OUTSIDE_BELOW";
    const gapCandle = first15m;
    const is15mRejected = Boolean(gapCandle?.acceptance === "REJECTED" || gapCandle?.acceptance === "INSIDE_VALUE");
    const isNarrowCPR = cprWidthForecast.includes("NARROW");
    const isWideCPR = cprWidthForecast.includes("WIDE");
    const twoDay = data.two_day_relationship || "LOWER_VALUE";
    const isHigherVal = twoDay === "HIGHER_VALUE" || twoDay === "OVERLAPPING_HIGHER";
    const isLowerVal = twoDay === "LOWER_VALUE" || twoDay === "OVERLAPPING_LOWER";

    let regime = "SIDEWAYS / BALANCED";
    let regimeTone = "yellow";
    let regimeDesc = "Price is in equilibrium. Fade extremes (VAL/L3 to VAH/H3); avoid the middle.";

    if (isOpenAboveH5 || isOpenBelowL5 || (hasGPZ && isNarrowCPR)) {
        regime = "WILD MOVE (HIGH VOLATILITY)";
        regimeTone = "purple";
        regimeDesc = "Extreme volatility / gap shock. Reduce size; wait for IB establishment before entering.";
    } else if (isNarrowCPR && isGapUp && !is15mRejected) {
        regime = "STRONG BULLISH (INITIATIVE)";
        regimeTone = "green";
        regimeDesc = "Initiative buyers in control. Buy VWAP / VAH / PDH pullbacks toward R2/R3/H5.";
    } else if (isNarrowCPR && isGapDown && !is15mRejected) {
        regime = "STRONG BEARISH (INITIATIVE)";
        regimeTone = "red";
        regimeDesc = "Initiative sellers in control. Sell VWAP / VAL / PDL rallies toward S2/S3/L5.";
    } else if (isHigherVal || (isGapDown && is15mRejected)) {
        regime = "SIDEWAYS TO BULLISH";
        regimeTone = "green";
        regimeDesc = "Accumulation / Bullish Bias. Buy lower-wick rejections at CPR / VAL / L3 support.";
    } else if (isLowerVal || (isGapUp && is15mRejected)) {
        regime = "SIDEWAYS TO BEARISH";
        regimeTone = "red";
        regimeDesc = "Distribution / Bearish Bias. Sell upper-wick rejections at CPR / VAH / H3 resistance.";
    } else if (isWideCPR || inValue) {
        regime = "SIDEWAYS / BALANCED";
        regimeTone = "yellow";
        regimeDesc = "Balanced auction. Fade VAL/L3 & VAH/H3 extremes; strictly NO TRADE in middle.";
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

