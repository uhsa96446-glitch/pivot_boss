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

    // First-15m confirmation (playbook §13, §47)
    const candleType = first15m?.type || null;      // BULLISH | BEARISH | DOJI
    const acceptance = first15m?.acceptance || null; // INSIDE_VALUE | ABOVE_VALUE | BELOW_VALUE
    let confirmation = "PENDING";
    if (first15m && candleType && acceptance) {
      if ((candleType === "BULLISH" && acceptance === "ABOVE_VALUE") ||
          (candleType === "BEARISH" && acceptance === "BELOW_VALUE")) {
        confirmation = "CONFIRMED";
      } else if ((candleType === "BEARISH" && acceptance === "ABOVE_VALUE") ||
                 (candleType === "BULLISH" && acceptance === "BELOW_VALUE")) {
        confirmation = "REJECTED";
      } else {
        confirmation = "NEUTRAL";
      }
    }

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

    // Confirmed rejection flips the bias to return-to-value
    const rejectedAbove = confirmation === "REJECTED" && aboveValue;
    const rejectedBelow = confirmation === "REJECTED" && belowValue;
    const confirmedAbove = confirmation === "CONFIRMED" && aboveValue;
    const confirmedBelow = confirmation === "CONFIRMED" && belowValue;

    if (rejectedAbove || rejectedBelow) {
        action = "WAIT — RETURN TO VALUE";
        tone = "yellow";
        headline = `First 15m rejected ${rejectedAbove ? `above VAH (${va.VAH})` : `below VAL (${va.VAL})`} — reversal candidate. Look for return to POC/CPR.`;
    } else if (confirmedBelow || belowValue) {
        action = "LOOK FOR SHORT";
        tone = "red";
        headline = `Price (${close}) below VAL (${va.VAL}) — ${confirmedBelow ? "Confirmed " : "Accepted "}Initiative Bearish. Look for short entries toward S1/S2.`;
    } else if (confirmedAbove || aboveValue) {
        action = "LOOK FOR LONG";
        tone = "green";
        headline = `Price (${close}) above VAH (${va.VAH}) — ${confirmedAbove ? "Confirmed " : "Accepted "}Initiative Bullish. Look for long entries toward R1/R2.`;
    } else {
        action = confirmation === "NEUTRAL" ? "WAIT — AWAIT CONFIRMATION" : "WAIT (IN VALUE)";
        tone = "yellow";
        headline = confirmation === "NEUTRAL"
            ? `First 15m candle is ${candleType || "NEUTRAL"} inside value — wait for acceptance/rejection at an extreme.`
            : `Price (${close}) is inside value area (${va.VAL} - ${va.VAH}) — avoid trading the middle. Watch VAH & VAL extremes.`;
    }

    return {
        p: { ...p, close },
        pv,
        first15m,
        prevClose,
        confirmation,
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

