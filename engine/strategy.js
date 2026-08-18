export function buildState(data) {
    const p = data.previous_session || {},
        pv = data.pivots || {},
        va = data.value_area || {},
        pred = data.predictions || {},
        s = pred.scenarios || {},
        day = pred.day_type || {},
        first15m = data.first_15m_candle || null;

    // Use live 15m close if available, else current session close, else previous close
    const close = first15m?.close || data.today_full?.close || p.close || 0;
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
        twoDayRel: data.two_day_relationship || "LOWER_VALUE",
        action,
        tone,
        headline,
        rangePct: close ? ((p.high - p.low) / close) * 100 : 0,
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

