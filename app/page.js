"use client";
import { useEffect, useMemo, useState } from "react";
import { buildState, levelRows } from "../engine/strategy";
import niftyData from "../public/data/NIFTY.json";


const n = (v, d = 1) =>
  typeof v === "number"
    ? v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })
    : "—";

const cap = (s) => String(s ?? "").replaceAll("_", " ").toUpperCase();

const formatDate = (isoStr) => {
  if (!isoStr) return "—";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
  } catch {
    return isoStr;
  }
};

function Badge({ children, tone = "neutral" }) {
  return <span className={"badge " + tone}>{children}</span>;
}

function Card({ children, className = "" }) {
  return <article className={"card " + className}>{children}</article>;
}

function Title({ e, t, r }) {
  return (
    <div className="section-title">
      <div>
        <span className="eyebrow">{e}</span>
        <h2>{t}</h2>
      </div>
      {r}
    </div>
  );
}

function Action({ st }) {
  return (
    <Card className={"action " + st.tone}>
      <div className="action-top">
        <div>
          <span className="eyebrow">CURRENT ACTION</span>
          <h2>{st.action}</h2>
        </div>
        <div className="pulse" />
      </div>
      <p>{st.headline}</p>
      <div className="checks">
        <div>
          <span>VALUE</span>
          <b>{st.inValue ? "INSIDE" : st.aboveValue ? "ABOVE" : "BELOW"}</b>
        </div>
        <div>
          <span>CPR FORECAST</span>
          <b>{st.cprWidthForecast}</b>
        </div>
        <div>
          <span>CAM OPEN</span>
          <b>{st.camOpenClass}</b>
        </div>
      </div>
      <div className="beginner">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
          <b>MARKET REGIME</b>
          <Badge tone={st.regimeTone}>{st.regime}</Badge>
        </div>
        <span>{st.regimeDesc}</span>
      </div>
    </Card>
  );
}

function Value({ st, ltp }) {
  const val = st.va.VAL || 0;
  const vah = st.va.VAH || 1;
  const poc = st.va.POC || 0;
  const price = ltp || st.p.close || 0;

  const range = vah - val || 1;
  const pocPct = 15 + Math.min(70, Math.max(0, ((poc - val) / range) * 70));
  let pricePct = 15 + ((price - val) / range) * 70;
  pricePct = Math.max(2, Math.min(98, pricePct));

  let priceTone = "yellow";
  if (price > vah) priceTone = "green";
  if (price < val) priceTone = "red";

  return (
    <Card>
      <Title e="MONEY ZONE" t="Value map" r={<span className="tiny">{ltp ? "LIVE LTP" : "FAIR VALUE"}</span>} />
      <div className="values">
        <div>
          <span>VAL</span>
          <b>{n(val, 2)}</b>
        </div>
        <div className="poc">
          <span>POC</span>
          <b>{n(poc, 2)}</b>
        </div>
        <div>
          <span>VAH</span>
          <b>{n(vah, 2)}</b>
        </div>
      </div>
      <div className="valuebar-wrapper">
        <div className="valuebar">
          <span className="valuebar-pin red" style={{ left: "15%" }} title={`VAL: ${n(val, 2)}`} />
          <span className="valuebar-pin yellow" style={{ left: `${pocPct}%` }} title={`POC: ${n(poc, 2)}`} />
          <span className="valuebar-pin green" style={{ left: "85%" }} title={`VAH: ${n(vah, 2)}`} />
          <span className={`valuebar-current ${priceTone}`} style={{ left: `${pricePct}%` }} title={`${ltp ? "LTP" : "Close"}: ${n(price, 2)}`} />
        </div>
        <div className="valuebar-label">
          <span>VAL (Low)</span>
          <span>POC (Magnet)</span>
          <span>VAH (High)</span>
        </div>
      </div>
      <p className="muted">
        LTP <b style={{ color: "var(--text)", fontWeight: 700 }}>{n(price, 2)}</b> · Inside value: balance. Outside value: watch acceptance.
      </p>
    </Card>
  );
}


function Structure({ st }) {
  return (
    <Card>
      <Title e="STRUCTURE" t="CPR + Camarilla" />
      <div className="structure">
        {[
          ["CPR P", st.pv.P],
          ["TC", st.pv.TC],
          ["BC", st.pv.BC],
          ["CAM WIDTH", st.pv.CAM_WIDTH],
        ].map(([k, v]) => (
          <div key={k}>
            <span>{k}</span>
            <b>{n(v, 2)}</b>
          </div>
        ))}
      </div>
      <p className="muted">Width is a forecast input, not an automatic entry.</p>
    </Card>
  );
}

function Levels({ st, ltp }) {
  const rows = levelRows(st);
  const values = rows.map((r) => r[1]);
  const minVal = Math.min(...values, st.pv.S2 || 0);
  const maxVal = Math.max(...values, st.pv.R2 || 1);
  const range = maxVal - minVal || 1;

  const price = ltp || st.p.close;
  const pricePct = Math.max(2, Math.min(98, ((price - minVal) / range) * 100));

  return (
    <Card>
      <Title e="PRICE ARCHITECTURE" t="Decision levels" r={<span className="tiny">{ltp ? "LIVE LTP" : "AUTO MAPPED"}</span>} />
      <div className="levelmap">
        {rows.map(([l, v, d, t]) => {
          const posPct = Math.max(5, Math.min(95, ((v - minVal) / range) * 100));
          return (
            <div className="level" key={l}>
              <span className="level-name">{l}</span>
              <div className="rail">
                <i className={t} style={{ left: `${posPct}%` }} title={`${l}: ${n(v, 2)}`} />
                <span className="rail-price-pin" style={{ left: `${pricePct}%` }} title={`${ltp ? "LTP" : "Close"}: ${n(price, 2)}`} />
              </div>
              <strong className="level-val">{n(v, 2)}</strong>
              <small className="level-desc">{d}</small>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Plan({ st }) {
  const p = st.s.primary_plan || {};
  const tone = st.day.bias === "BULLISH" ? "green" : st.day.bias === "BEARISH" ? "red" : "neutral";

  return (
    <Card>
      <Title e="FLIGHT PLAN" t="Primary trade framework" r={<Badge tone={tone}>PRIMARY</Badge>} />
      <div className="plan">{p.scenario || "No primary plan supplied."}</div>
      {[
        ["ENTRY", p.entry],
        ["TARGETS", p.targets?.map((x) => n(x, 2)).join(" · ")],
        ["STOP / INVALIDATION", p.stop],
        ["CONTINGENCY", p.contingency],
      ].map(([k, v]) => (
        <div className="kv" key={k}>
          <span>{k}</span>
          <b>{v || "—"}</b>
        </div>
      ))}
      <p className="muted">
        A plan is a framework, not an automatic entry. Confirmation is still required.
      </p>
    </Card>
  );
}

function Hot({ st }) {
  return (
    <Card className="hot">
      <Title
        e="CONFLUENCE"
        t="Hot zones"
        r={<span className="muted">multiple independent levels → higher importance</span>}
      />
      <div className="hotgrid">
        {(st.s.hot_zones || []).map((z, i) => (
          <div key={i}>
            <span>ZONE {i + 1}</span>
            <b>
              {n(z.bottom, 2)} — {n(z.top, 2)}
            </b>
            <small>{n(z.width, 2)} pts</small>
          </div>
        ))}
      </div>
      <div className="hotrule">
        <b>REJECTION</b>
        <span>REVERSAL CANDIDATE</span>
        <b>ACCEPTANCE</b>
        <span>BREAKOUT CANDIDATE</span>
        <b>NO CLEAR BEHAVIOR</b>
        <span>WAIT</span>
      </div>
    </Card>
  );
}

function Overview({ st, ltp }) {
  return (
    <div>
      <div className="grid stats">
        <Action st={st} />
        <Value st={st} ltp={ltp} />
        <Structure st={st} />
      </div>
      <div className="grid main">
        <Levels st={st} ltp={ltp} />
        <Plan st={st} />
      </div>
      <div className="grid two">
        <Card>
          <Title e="FOUR QUESTIONS" t="Read the auction" />
          <div className="questions">
            {[
              ["01", "WHERE IS VALUE?", "POC · VAH · VAL · CPR"],
              ["02", "WHO IS IN CONTROL?", "Responsive or initiative"],
              ["03", "WHAT DOES STRUCTURE FORECAST?", "Trend or range"],
              ["04", "WHAT IS PRICE DOING?", "Acceptance or rejection"],
            ].map((x) => (
              <div key={x[0]}>
                <b>{x[0]}</b>
                <strong>{x[1]}</strong>
                <small>{x[2]}</small>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <Title e="TRADE ENGINE" t="Before you enter" />
          <div className="engine">
            <span>CONTEXT</span>
            <i>→</i>
            <span>LOCATION</span>
            <i>→</i>
            <span>PRICE ACTION</span>
            <i>→</i>
            <span>CONFIRMATION</span>
            <i>→</i>
            <strong>ENTRY</strong>
          </div>
          <div className="engine2">
            <span>INVALIDATION</span>
            <span>TARGET</span>
            <span>CONTINGENCY</span>
          </div>
        </Card>
      </div>
      <Hot st={st} />
    </div>
  );
}

function LevelsTab({ st }) {
  const stdKeys = ["P", "R1", "R2", "R3", "S1", "S2", "S3"];
  const cprKeys = ["TC", "BC", "CPR_TOP", "CPR_BOTTOM", "CPR_WIDTH"];
  const camKeys = ["H1", "H2", "H3", "H4", "H5", "L1", "L2", "L3", "L4", "L5", "CAM_WIDTH"];

  const high = st.p.high || 1;
  const low = st.p.low || 0;
  const close = st.prevClose || 0;
  const range = high - low || 1;
  const closePct = Math.max(0, Math.min(100, ((close - low) / range) * 100));

  return (
    <div className="grid two">
      <Card>
        <Title e="PIVOT MATRIX" t="All daily levels" />
        <div className="pivot-group-title">STANDARD PIVOTS</div>
        <div className="table">
          {stdKeys.map((k) =>
            st.pv[k] !== undefined ? (
              <div className="tr" key={k}>
                <span>{k}</span>
                <b>{n(st.pv[k], 2)}</b>
              </div>
            ) : null
          )}
        </div>
        <div className="pivot-group-title">CPR (CENTRAL PIVOT RANGE)</div>
        <div className="table">
          {cprKeys.map((k) =>
            st.pv[k] !== undefined ? (
              <div className="tr" key={k}>
                <span>{k}</span>
                <b>{n(st.pv[k], 2)}</b>
              </div>
            ) : null
          )}
        </div>
        <div className="pivot-group-title">CAMARILLA PIVOTS</div>
        <div className="table">
          {camKeys.map((k) =>
            st.pv[k] !== undefined ? (
              <div className="tr" key={k}>
                <span>{k}</span>
                <b>{n(st.pv[k], 2)}</b>
              </div>
            ) : null
          )}
        </div>
      </Card>
      <Card>
        <Title e="PREVIOUS SESSION" t="OHLC" />
        <div className="ohlc">
          {[
            ["OPEN", st.p.open],
            ["HIGH", st.p.high],
            ["LOW", st.p.low],
            ["CLOSE", st.prevClose],
          ].map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <b>{n(v, 2)}</b>
            </div>
          ))}
        </div>
        <div className="meter-wrapper">
          <div className="meter">
            <span className="meter-pin" style={{ left: `${closePct}%` }} title={`Close: ${n(st.prevClose, 2)}`} />
          </div>
          <div className="meter-label">
            <span>LOW ({n(low, 2)})</span>
            <span>CLOSE {n(st.prevClose, 2)} ({closePct.toFixed(1)}%)</span>
            <span>HIGH ({n(high, 2)})</span>
          </div>
        </div>
        <p className="muted">
          Previous range {n(high - low, 2)} points · {st.rangePct.toFixed(2)}%
        </p>
      </Card>
    </div>
  );
}

const conditionExplanations = {
  "PDL <= O <= PDH AND VAL <= O <= VAH": "Open inside prior day range & inside Value Area (Balanced Open)",
  "PDL <= O <= PDH AND O > VAH": "Open inside prior day range & above Value Area (Bullish Imbalance)",
  "PDL <= O <= PDH AND O < VAL": "Open inside prior day range & below Value Area (Bearish Imbalance)",
  "O > PDH": "Gap Up open above Prior Day High (Strong Bullish Imbalance)",
  "O < PDL": "Gap Down open below Prior Day Low (Strong Bearish Imbalance)",
  "O > PDH AND 15M_REJECTED": "Gap Up open above Prior Day High with 15m Rejection (Gap Fill / Reversal)",
  "O < PDL AND 15M_REJECTED": "Gap Down open below Prior Day Low with 15m Rejection (Gap Fill / Reversal)",
  "BULLISH_TREND AND PULLBACK_TO_CPR": "Higher Value CPR Trend: Buying Pullbacks to Central Pivot Zone",
  "BEARISH_TREND AND RALLY_TO_CPR": "Lower Value CPR Trend: Selling Rallies to Central Pivot Zone",
  "INSIDE_DAY_COMPRESSION": "Inside Day Compression: Wait for Breakout of 2-Day Boundaries",
  "NARROW_CPR AND RANGE_EXTENSION": "Narrow CPR Trend Day: Initiative Range Extension Away from Value",
  "R1_OR_S1_BREAKOUT": "Floor Pivot Ladder Breakout: Continuation to R2/R3 or S2/S3",
};

function Scenarios({ st, data, ltp }) {
  const [filter, setFilter] = useState("all");
  const s = st.s || {};

  const openClass = data?.opening_classification || "PENDING";
  const isPending = openClass === "PENDING";
  const first15m = data?.first_15m_candle || null;
  const ib = st.ib || data?.initial_balance || null;

  // Determine if Gap Reversal / Failure occurs based on candle acceptance
  const isGapUp = openClass === "OUT_ABOVE" || openClass === "OUTSIDE_ABOVE";
  const isGapDown = openClass === "OUT_BELOW" || openClass === "OUTSIDE_BELOW";
  // IMPORTANT: Use first15m (not IB) for gap reversal check.
  // IB acceptance reflects the full 1-hour picture; first 15m determines initial gap rejection.
  const gapCheckCandle = first15m;  // always use 15m for gap reversal
  const is15mRejected = Boolean(
    gapCheckCandle?.acceptance === "REJECTED" ||
    gapCheckCandle?.acceptance === "INSIDE_VALUE"
  );

  // Use IB data (if available) for CPR pullback and IB range analysis
  const candleData = ib || first15m;
  // Determine CPR Pullback candidates
  const isHigherValue = st.twoDayRel === "HIGHER_VALUE" || st.twoDayRel === "OVERLAPPING_HIGHER";
  const isLowerValue = st.twoDayRel === "LOWER_VALUE" || st.twoDayRel === "OVERLAPPING_LOWER";
  const isPullbackToCPR = Boolean(candleData && (candleData.low <= (st.pv?.CPR_TOP || 0) && candleData.high >= (st.pv?.CPR_BOTTOM || 0)));

  // Initial opening classification matching (Playbook standard)
  // CASE G: Inside CPR Compression (Today's CPR is strictly inside Yesterday's CPR)
  let activeCaseKey = null;
  if (st.twoDayRel === "INSIDE") activeCaseKey = "case_g_inside_day";
  else if (isGapUp && is15mRejected) activeCaseKey = "case_d_gap_reversal";
  else if (isGapDown && is15mRejected) activeCaseKey = "case_e_gap_reversal";
  else if (isHigherValue && isPullbackToCPR) activeCaseKey = "case_f_cpr_bullish_pullback";
  else if (isLowerValue && isPullbackToCPR) activeCaseKey = "case_f2_cpr_bearish_pullback";
  else if (st.cprWidthForecast?.includes("NARROW") && (isGapUp || isGapDown) && !is15mRejected) activeCaseKey = "case_h_double_distribution";
  else if (openClass === "IN_VALUE" || openClass === "IN_RANGE_IN_VALUE") activeCaseKey = "case_a_in_range_in_value";
  else if (openClass === "ABOVE_VALUE" || openClass === "IN_RANGE_ABOVE_VALUE") activeCaseKey = "case_b_in_range_above_value";
  else if (openClass === "BELOW_VALUE" || openClass === "IN_RANGE_BELOW_VALUE") activeCaseKey = "case_c_in_range_below_value";
  else if (isGapUp) activeCaseKey = "case_d_out_above";
  else if (isGapDown) activeCaseKey = "case_e_out_below";

  const cases = [
    ["CASE A · IN RANGE / VALUE", s.case_a_in_range_in_value, "neutral", "case_a_in_range_in_value"],
    ["CASE B · IN RANGE / ABOVE VALUE", s.case_b_in_range_above_value, "green", "case_b_in_range_above_value"],
    ["CASE C · IN RANGE / BELOW VALUE", s.case_c_in_range_below_value, "red", "case_c_in_range_below_value"],
    ["CASE D · ABOVE PDH (INITIATIVE)", s.case_d_out_above, "green", "case_d_out_above"],
    ["CASE D2 · GAP UP REVERSAL / FAILED GAP", {
      condition: "O > PDH AND 15M_REJECTED",
      bias: "BEARISH",
      primary: `First 15m candle closed back below PDH (${st.p?.high?.toFixed(1) || "—"}) — Gap Fill SHORT toward value`,
      primary_target: `PDH (${st.p?.high?.toFixed(1) || "—"}) → VAH (${st.va?.VAH?.toFixed(1) || "—"}) → POC (${st.va?.POC?.toFixed(1) || "—"})`,
      contingency: `If price re-accepts above PDH (${st.p?.high?.toFixed(1) || "—"}) → Gap Continuation LONG toward R1 (${st.pv?.R1?.toFixed(1) || "—"})`,
      contingency_target: `R1 (${st.pv?.R1?.toFixed(1) || "—"}) → R2 (${st.pv?.R2?.toFixed(1) || "—"})`,
      failure: "Sellers cannot push price back inside prior day range",
      no_trade: "Avoid shorting if first 15m volume remains strongly bullish above PDH"
    }, "red", "case_d_gap_reversal"],
    ["CASE E · BELOW PDL (INITIATIVE)", s.case_e_out_below, "red", "case_e_out_below"],
    ["CASE E2 · GAP DOWN REVERSAL / FAILED GAP", {
      condition: "O < PDL AND 15M_REJECTED",
      bias: "BULLISH",
      primary: `First 15m candle closed back above PDL (${st.p?.low?.toFixed(1) || "—"}) — Gap Fill LONG toward value`,
      primary_target: `PDL (${st.p?.low?.toFixed(1) || "—"}) → VAL (${st.va?.VAL?.toFixed(1) || "—"}) → POC (${st.va?.POC?.toFixed(1) || "—"})`,
      contingency: `If price breaks back below PDL (${st.p?.low?.toFixed(1) || "—"}) → Gap Continuation SHORT toward S1 (${st.pv?.S1?.toFixed(1) || "—"})`,
      contingency_target: `S1 (${st.pv?.S1?.toFixed(1) || "—"}) → S2 (${st.pv?.S2?.toFixed(1) || "—"})`,
      failure: "Buyers cannot hold price above PDL after initial reversal",
      no_trade: "Avoid longing if first 15m volume remains strongly bearish below PDL"
    }, "green", "case_e_gap_reversal"],
    ["CASE F · CPR PULLBACK (UPTREND SUPPORT)", {
      condition: "BULLISH_TREND AND PULLBACK_TO_CPR",
      bias: "BULLISH",
      primary: `In higher-value uptrend (${st.twoDayRel}), price pulls back into CPR (${st.pv?.P?.toFixed(1) || "—"}). Buy lower wick bullish rejection at CPR`,
      primary_target: `VAH (${st.va?.VAH?.toFixed(1) || "—"}) → R1 (${st.pv?.R1?.toFixed(1) || "—"}) → R2 (${st.pv?.R2?.toFixed(1) || "—"})`,
      contingency: "If price closes below CPR bottom (BC/TC) → Thesis Invalidated, Exit Long",
      contingency_target: `VAL (${st.va?.VAL?.toFixed(1) || "—"}) / S1 (${st.pv?.S1?.toFixed(1) || "—"})`,
      failure: "Sellers accept price below CPR zone",
      no_trade: "Do not buy CPR touch without lower-wick bullish rejection candle"
    }, "green", "case_f_cpr_bullish_pullback"],
    ["CASE F2 · CPR RALLY (DOWNTREND RESISTANCE)", {
      condition: "BEARISH_TREND AND RALLY_TO_CPR",
      bias: "BEARISH",
      primary: `In lower-value downtrend (${st.twoDayRel}), price rallies into CPR (${st.pv?.P?.toFixed(1) || "—"}). Short upper wick bearish rejection at CPR`,
      primary_target: `VAL (${st.va?.VAL?.toFixed(1) || "—"}) → S1 (${st.pv?.S1?.toFixed(1) || "—"}) → S2 (${st.pv?.S2?.toFixed(1) || "—"})`,
      contingency: "If price closes above CPR top (TC/BC) → Thesis Invalidated, Exit Short",
      contingency_target: `VAH (${st.va?.VAH?.toFixed(1) || "—"}) / R1 (${st.pv?.R1?.toFixed(1) || "—"})`,
      failure: "Buyers accept price above CPR zone",
      no_trade: "Do not short CPR touch without upper-wick bearish rejection candle"
    }, "red", "case_f2_cpr_bearish_pullback"],
    ["CASE G · INSIDE DAY BREAKOUT (COMPRESSION)", {
      condition: "INSIDE_DAY_COMPRESSION",
      bias: "NEUTRAL",
      primary: `Prior day is Inside Day or CPR is Inside (${st.twoDayRel}). Wait for 15m breakout above PDH (${st.p?.high?.toFixed(1) || "—"}) → LONG`,
      primary_target: `PDH → R1 (${st.pv?.R1?.toFixed(1) || "—"}) → R2 (${st.pv?.R2?.toFixed(1) || "—"})`,
      contingency: `If 15m breaks below PDL (${st.p?.low?.toFixed(1) || "—"}) → SHORT`,
      contingency_target: `PDL → S1 (${st.pv?.S1?.toFixed(1) || "—"}) → S2 (${st.pv?.S2?.toFixed(1) || "—"})`,
      failure: "False breakout at 2-day high/low boundaries",
      no_trade: "Do not trade inside the 2-day high-low compression range"
    }, "neutral", "case_g_inside_day"],
    ["CASE H · DOUBLE DISTRIBUTION TREND DAY", {
      condition: "NARROW_CPR AND RANGE_EXTENSION",
      bias: isGapDown ? "BEARISH" : "BULLISH",
      primary: `Narrow CPR (${st.cprWidthForecast}) + Initiative Range Extension away from value → Follow trend direction without fading`,
      primary_target: isGapDown
        ? `S2 (${st.pv?.S2?.toFixed(1) || "—"}) → S3 (${st.pv?.S3?.toFixed(1) || "—"}) → L5 (${st.pv?.L5?.toFixed(1) || "—"})`
        : `R2 (${st.pv?.R2?.toFixed(1) || "—"}) → R3 (${st.pv?.R3?.toFixed(1) || "—"}) → H5 (${st.pv?.H5?.toFixed(1) || "—"})`,
      contingency: "If range extension fails and price returns to Initial Balance → Exit Trend Position",
      contingency_target: `POC (${st.va?.POC?.toFixed(1) || "—"})`,
      failure: "Initiative buyers/sellers lose momentum",
      no_trade: "Never fade a confirmed Double Distribution Trend Day"
    }, isGapDown ? "red" : "green", "case_h_double_distribution"],
    ["CASE I · FLOOR PIVOT BREAKOUT LADDER", {
      condition: "R1_OR_S1_BREAKOUT",
      bias: "NEUTRAL",
      primary: `If price breaks R1 (${st.pv?.R1?.toFixed(1) || "—"}) & holds → LONG continuation ladder`,
      primary_target: `R2 (${st.pv?.R2?.toFixed(1) || "—"}) → R3 (${st.pv?.R3?.toFixed(1) || "—"}) → R4 (${st.pv?.R4?.toFixed(1) || "—"})`,
      contingency: `If price breaks S1 (${st.pv?.S1?.toFixed(1) || "—"}) & holds → SHORT continuation ladder`,
      contingency_target: `S2 (${st.pv?.S2?.toFixed(1) || "—"}) → S3 (${st.pv?.S3?.toFixed(1) || "—"}) → S4 (${st.pv?.S4?.toFixed(1) || "—"})`,
      failure: "Pivot level rejects breakout attempt",
      no_trade: "Avoid trading between R1 and S1 when volume is low"
    }, "neutral", "case_i_pivot_breakout_ladder"],
  ];

  const filteredCases = cases.filter(([title, o, tone, key]) => {
    if (filter === "active") return key === activeCaseKey;
    if (filter === "bullish") return tone === "green";
    if (filter === "bearish") return tone === "red";
    if (filter === "neutral") return tone === "neutral";
    return true;
  });

  const fmtPrice = (val) => (typeof val === "number" ? val.toFixed(1) : "");

  const formatCamClass = (str) => {
    if (!str) return "Value Zone";
    const labels = {
      ABOVE_H5: "Above H5 / R4 (Extreme Gap Up)",
      ABOVE_R4: "Above R4 (Extreme Gap Up)",
      ABOVE_H4: "Above H4 (Initiative Bullish)",
      H3_H4_ZONE: "H3–H4 Breakout Zone",
      CPR_H3_ZONE: "CPR–H3 Bullish Zone",
      INSIDE_CPR: "Inside CPR (Compression)",
      L3_CPR_ZONE: "L3–CPR Bearish Zone",
      L4_L3_ZONE: "L4–L3 Breakdown Zone",
      BELOW_L4: "Below L4 (Initiative Bearish)",
      BELOW_L5: "Below L5 / S4 (Extreme Gap Down)",
      INSIDE_CAM: "Inside Camarilla Range",
    };
    return labels[str] || str.replace(/_/g, " ");
  };

  const twoDayLabel = (st.twoDayRel || "NEUTRAL").replace(/_/g, " ");

  const enrichedScenarios = {
    case_a_in_range_in_value: {
      primary: `Opening zone: ${formatCamClass(st.camOpenClass)} · 2-Day CPR: ${twoDayLabel} · CPR Width: ${st.cprWidthForecast || "NORMAL"}. If price breaks VAH/H3 and accepts → LONG`,
      primary_target: `VAH (${fmtPrice(st.va?.VAH)}) → H3 (${fmtPrice(st.pv?.H3)}) → R1 (${fmtPrice(st.pv?.R1)})`,
      contingency: `If price breaks VAL/L3 and accepts → SHORT`,
      contingency_target: `VAL (${fmtPrice(st.va?.VAL)}) → L3 (${fmtPrice(st.pv?.L3)}) → S1 (${fmtPrice(st.pv?.S1)})`,
      no_trade: `Price remains inside value (${fmtPrice(st.va?.VAL)} - ${fmtPrice(st.va?.VAH)}). ${st.cprWidthForecast?.includes("WIDE") ? "Wide CPR: Trade extremes (fade H3/L3)." : "Inside CPR: Compression breakout watch."}`,
    },
    case_b_in_range_above_value: {
      primary: `Opening zone: ${formatCamClass(st.camOpenClass)} · 2-Day Bias: ${twoDayLabel}. If price accepts above VAH / tests H3 rejection → LONG candidate`,
      primary_target: `H3 (${fmtPrice(st.pv?.H3)}) → H4 (${fmtPrice(st.pv?.H4)}) → R1 (${fmtPrice(st.pv?.R1)})`,
      contingency: "If price returns below VAH / fails H3 → CANCEL bullish thesis, SHORT",
      contingency_target: `POC (${fmtPrice(st.va?.POC)}) → CPR (${fmtPrice(st.pv?.P)}) → VAL (${fmtPrice(st.va?.VAL)})`,
      failure: "VAH / H3 acts as strong resistance (Hot Zone rejection)",
    },
    case_c_in_range_below_value: {
      primary: `Opening zone: ${formatCamClass(st.camOpenClass)} · 2-Day Bias: ${twoDayLabel}. If price accepts below VAL / tests L3 rejection → SHORT candidate`,
      primary_target: `L3 (${fmtPrice(st.pv?.L3)}) → L4 (${fmtPrice(st.pv?.L4)}) → S1 (${fmtPrice(st.pv?.S1)})`,
      contingency: "If price reclaims VAL / L3 → CANCEL bearish thesis, LONG",
      contingency_target: `POC (${fmtPrice(st.va?.POC)}) → CPR (${fmtPrice(st.pv?.P)}) → VAH (${fmtPrice(st.va?.VAH)})`,
      failure: "VAL / L3 acts as strong support (Hot Zone rejection)",
    },
    case_d_out_above: {
      primary: `Opening zone: ${formatCamClass(st.camOpenClass)} · 2-Day Bias: ${twoDayLabel}. If first 15m candle accepts above PDH/H4 → Initiative Bullish Breakout, LONG`,
      primary_target: `H4 (${fmtPrice(st.pv?.H4)}) → H5 (${fmtPrice(st.pv?.H5)}) / R2 (${fmtPrice(st.pv?.R2)})`,
      contingency: "If first 15m candle closes back below PDH/H4 → Failed Gap Up, SHORT",
      contingency_target: `PDH (${fmtPrice(st.p?.high)}) → H3 (${fmtPrice(st.pv?.H3)}) → VAH (${fmtPrice(st.va?.VAH)}) → POC (${fmtPrice(st.va?.POC)})`,
      failure: "Gap fill back inside prior range",
    },
    case_e_out_below: {
      primary: `Opening zone: ${formatCamClass(st.camOpenClass)} · 2-Day Bias: ${twoDayLabel}. If first 15m candle accepts below PDL/L4 → Initiative Bearish Breakdown, SHORT`,
      primary_target: `L4 (${fmtPrice(st.pv?.L4)}) → L5 (${fmtPrice(st.pv?.L5)}) / S2 (${fmtPrice(st.pv?.S2)})`,
      contingency: "If first 15m candle closes back above PDL/L4 → Failed Gap Down, LONG",
      contingency_target: `PDL (${fmtPrice(st.p?.low)}) → L3 (${fmtPrice(st.pv?.L3)}) → VAL (${fmtPrice(st.va?.VAL)}) → POC (${fmtPrice(st.va?.POC)})`,
      failure: "Gap fill back inside prior range",
    },
  };

  return (
    <div>
      {/* Active Scenario Spotlight Banner */}
      <div className="active-scenario-banner">
        <div>
          <span className="eyebrow">
            {isPending ? "PRE-MARKET PREPARATION" : "LIVE OPEN CLASSIFICATION"}
          </span>
          <h3>
            {isPending
              ? "OPENING CLASSIFICATION PENDING"
              : activeCaseKey
                ? cases.find((c) => c[3] === activeCaseKey)?.[0]
                : openClass}
          </h3>
          <p>
            {isPending
              ? "Market opens at 09:15 AM · Review playbooks below before session start"
              : ib
                ? `Initial Balance (IB 09:15–10:15): IBH ${ib.high} · IBL ${ib.low} · Range ${ib.range || (ib.high - ib.low).toFixed(1)} pts ${ib.width_type ? `(${ib.width_type})` : ""}`
                : first15m
                  ? `First 15m Candle: High ${first15m.high} · Low ${first15m.low} · Close ${first15m.close}${first15m.type ? ` · ${first15m.type}` : ""}${first15m.acceptance ? ` (${first15m.acceptance})` : ""}`
                  : "Awaiting candle close for confirmation"}
          </p>

        </div>
        <Badge tone={isPending ? "yellow" : st.tone}>
          {isPending ? "PRE-MARKET" : st.participant}
        </Badge>
      </div>


      <div className="intro">
        <div>
          <span className="eyebrow">OPENING PLAYBOOK</span>
          <h2>Scenario engine</h2>
        </div>
        <span className="muted">Forecast → Observe → Confirm → Act</span>
      </div>

      {/* Scenario Filter Bar */}
      <div className="scenario-filter-bar">
        {[
          ["all", `All Scenarios (${cases.length})`],
          ["active", activeCaseKey ? "Active Match Only" : "Active Match (Pending)"],
          ["bullish", "Bullish Plays"],
          ["bearish", "Bearish Plays"],
          ["neutral", "Balanced Plays"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`scenario-filter-btn ${filter === key ? "active" : ""}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>


      {/* 4-Step Decision Flowchart */}
      <div className="decision-flowchart">
        <div className="flow-step">
          <span className="flow-step-num">STEP 01</span>
          <h4>Open Location</h4>
          <p>Classify opening vs Range (PDH/PDL), Value (VAH/VAL), and Camarilla ({st.camOpenClass || "Cam Levels"}).</p>
        </div>
        <div className="flow-step">
          <span className="flow-step-num">STEP 02</span>
          <h4>Structure Forecast</h4>
          <p>CPR Width ({st.cprWidthForecast || "Normal"}): {st.cprWidthForecast?.includes("NARROW") ? "Trend/Breakout day likely" : st.cprWidthForecast?.includes("WIDE") ? "Range-bound day likely" : "Balanced expectation"}.</p>
        </div>
        <div className="flow-step">
          <span className="flow-step-num">STEP 03</span>
          <h4>15m Acceptance</h4>
          <p>Observe 15m candle close ({first15m?.type || "Pending"}{first15m?.acceptance ? ` / ${first15m.acceptance}` : ""}) to confirm initiative or reversal.</p>
        </div>
        <div className="flow-step">
          <span className="flow-step-num">STEP 04</span>
          <h4>Target / Invalidation</h4>
          <p>Execute with explicit target level (R1/S1/H3/L3/POC) and tight stop invalidation.</p>
        </div>
      </div>

      {/* Scenario Cards Grid */}
      <div className="scenario-grid">
        {filteredCases.map(
          ([title, rawO, t, key]) => {
            const enriched = enrichedScenarios[key] || {};
            const o = { ...rawO, ...enriched };

            return (
              o && (
                <Card
                  className={`scenario ${t} ${key === activeCaseKey ? "active-card" : ""}`}
                  key={title}
                >
                  <div className="scenario-head">
                    <span>{title}</span>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      {key === activeCaseKey && <Badge tone="yellow">ACTIVE MATCH</Badge>}
                      <Badge tone={t}>{o.bias || "SCENARIO"}</Badge>
                    </div>
                  </div>

                  {o.condition && (
                    <div className="scenario-cond">
                      <span className="eyebrow">OPEN CONDITION</span>
                      <div className="cond-explain">
                        {conditionExplanations[o.condition?.trim()] || o.condition}
                      </div>
                    </div>
                  )}

                  {o.primary && (
                    <div className="scenario-section primary">
                      <span className="label">PRIMARY PLAN</span>
                      <p>{o.primary}</p>
                      {o.primary_target && (
                        <div className="target">
                          <span>TARGET</span>
                          <b>{o.primary_target}</b>
                        </div>
                      )}
                    </div>
                  )}

                  {o.contingency && (
                    <div className="scenario-section contingency">
                      <span className="label">CONTINGENCY PLAN</span>
                      <p>{o.contingency}</p>
                      {o.contingency_target && (
                        <div className="target">
                          <span>TARGET</span>
                          <b>{o.contingency_target}</b>
                        </div>
                      )}
                    </div>
                  )}

                  {(o.failure || o.no_trade) && (
                    <div className="scenario-footer">
                      {o.failure && (
                        <div className="scenario-footer-item">
                          <span className="label">FAILURE MODE</span>
                          <p>{o.failure}</p>
                        </div>
                      )}
                      {o.no_trade && (
                        <div className="scenario-footer-item">
                          <span className="label">NO-TRADE RULE</span>
                          <p>{o.no_trade}</p>
                        </div>
                      )}
                    </div>
                  )}

                </Card>
              )
            );
          }
        )}
      </div>



      <div className="intro sub">
        <div>
          <span className="eyebrow">EXECUTION MAP</span>
          <h2>Trigger levels</h2>
        </div>
      </div>

      {/* Enhanced Trigger Levels Grid */}
      <div className="grid two">
        {["reversal_longs", "reversal_shorts", "breakout_longs", "breakdown_shorts"].map((k) => (
          <Card key={k}>
            <div className={`cardhead-trigger ${k.includes("longs") ? "green" : "red"}`}>
              <span>{cap(k)}</span>
              <small>{k.includes("reversal") ? "RESPONSIVE" : "INITIATIVE"}</small>
            </div>
            {(s.trigger_levels?.[k] || []).map((x, i) => {
              const delta = typeof x.level === "number" && typeof x.target === "number" ? Math.abs(x.target - x.level) : null;
              return (
                <div className="trigger-item-enhanced" key={i}>
                  <b>{n(x.level, 2)}</b>
                  <span>{x.desc}</span>
                  <em>→ {n(x.target, 2)}</em>
                  {delta !== null && <span className="pts-badge">+{delta.toFixed(0)} pts</span>}
                </div>
              );
            })}
          </Card>
        ))}
      </div>

      <Card>
        <Title e="RISK FILTER" t="No-trade rules" />
        <div className="rules">
          {(s.no_trade_rules || []).map((x, i) => (
            <div key={i}>
              <i>×</i>
              <span>{x}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}





function FrameworkTab({ st }) {
  const layers = [
    {
      num: "LAYER 1",
      title: "Market Theory",
      cls: "l1",
      items: [
        "Auction process & value discovery",
        "Responsive vs Initiative participants",
        "Recycling market day patterns",
        "Day-type classification engine",
      ],
    },
    {
      num: "LAYER 2",
      title: "Structure",
      cls: "l2",
      items: [
        "Money Zone (VAH · POC · VAL)",
        "Central Pivot Range (P · TC · BC)",
        "Expanded Floor Pivots (R1-R4 · S1-S4)",
        "Camarilla Equation (H1-H5 · L1-L5)",
      ],
    },
    {
      num: "LAYER 3",
      title: "Relationships",
      cls: "l3",
      items: [
        "Two-Day Value relationships",
        "Pivot Width forecasting (Narrow / Wide)",
        "Opening location vs Value & Range",
        "Value Area migration tracking",
      ],
    },
    {
      num: "LAYER 4",
      title: "Confluence",
      cls: "l4",
      items: [
        "Multiple Pivot Hot Zones",
        "Double Pivot Zones (R1 ≈ H3)",
        "Golden Pivot Zone (L3/H3 inside CPR)",
        "Virgin level management (Untested POC)",
      ],
    },
    {
      num: "LAYER 5",
      title: "Price Setups",
      cls: "l5",
      items: [
        "Wick Reversal (Tail rejection)",
        "Extreme Reversal (Overextended)",
        "Outside Reversal (Failed expansion)",
        "Doji Reversal & Magnet Plays",
      ],
    },
  ];

  const setups = [
    {
      name: "Wick Reversal",
      tag: "REJECTION",
      desc: "Identifies sharp rejection at an extreme level via a prominent price tail at VAH, VAL, CPR, or HTF levels.",
      entry: "Close of reversal candle",
      stop: "Beyond the wick tail extreme",
      target: "POC / Opposite value boundary",
    },
    {
      name: "Extreme Reversal",
      tag: "EXHAUSTION",
      desc: "Captures exhaustion after an overextended move far outside fair value, targeting responsive mean reversion.",
      entry: "Confirmation candle back toward value",
      stop: "Extreme swing high/low",
      target: "Return to prior Value Area (VAL/VAH)",
    },
    {
      name: "Outside Reversal",
      tag: "FAILED EXPANSION",
      desc: "Triggers when price breaks prior session range, fails to accept, and aggressively reverses back through the range.",
      entry: "Re-entry back inside previous range",
      stop: "Outside swing extreme",
      target: "Opposite side of prior range",
    },
    {
      name: "Doji Reversal",
      tag: "INDECISION",
      desc: "Signals indecision at high-confluence locations (CPR, VAH, VAL, H3, L3), requiring directional confirmation before entry.",
      entry: "Follow-through candle after Doji",
      stop: "High/Low of the Doji candle",
      target: "Next structural pivot level",
    },
  ];

  return (
    <div>
      <div className="intro">
        <div>
          <span className="eyebrow">PIVOTBOSS ARCHITECTURE</span>
          <h2>5-Layer System Framework</h2>
        </div>
        <span className="muted">Source-audited from Secrets of a Pivot Boss</span>
      </div>

      <div className="framework-layers">
        {layers.map((l) => (
          <div className={`layer-card ${l.cls}`} key={l.num}>
            <span className="layer-num">{l.num}</span>
            <h3>{l.title}</h3>
            <ul>
              {l.items.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="intro sub">
        <div>
          <span className="eyebrow">PRICE-BASED SETUPS</span>
          <h2>Core Reversal Setups</h2>
        </div>
      </div>

      <div className="setups-grid">
        {setups.map((s) => (
          <div className="setup-card" key={s.name}>
            <div className="setup-card-head">
              <h4>{s.name}</h4>
              <Badge tone={s.tag === "REJECTION" ? "green" : s.tag === "EXHAUSTION" ? "red" : "neutral"}>
                {s.tag}
              </Badge>
            </div>
            <p>{s.desc}</p>
            <div className="setup-details">
              <div className="setup-row">
                <span>ENTRY TRIGGER</span>
                <b>{s.entry}</b>
              </div>
              <div className="setup-row">
                <span>STOP / INVALIDATION</span>
                <b>{s.stop}</b>
              </div>
              <div className="setup-row">
                <span>OBJECTIVE TARGET</span>
                <b>{s.target}</b>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="intro sub">
        <div>
          <span className="eyebrow">SPECIAL PLAYS</span>
          <h2>Execution Frameworks</h2>
        </div>
      </div>

      <div className="plays-grid">
        <div className="play-card">
          <Badge tone="yellow">MAGNET TRADE</Badge>
          <h4>Fair-Value Magnet</h4>
          <p>
            When price opens displaced from central value without strong initiative conviction, central value (POC/CPR) attracts price back.
          </p>
          <div className="setup-row">
            <span>KEY TARGET</span>
            <b>POC · CPR P</b>
          </div>
        </div>

        <div className="play-card">
          <Badge tone="green">BREAKAWAY PLAY</Badge>
          <h4>Breakout Acceptance</h4>
          <p>
            Establishes when price shows strong initiative conviction, breaks an important structural pivot (CPR/H4/L4), and accepts beyond.
          </p>
          <div className="setup-row">
            <span>TARGET</span>
            <b>Next Structural Pivot (H5/L5/R3)</b>
          </div>
        </div>

        <div className="play-card">
          <Badge tone="neutral">GOLDEN PIVOT ZONE</Badge>
          <h4>High-Confluence Zone</h4>
          <p>
            Occurs when Camarilla L3 or H3 overlaps directly within the Central Pivot Range (CPR), creating an exceptionally high-probability reversal wall.
          </p>
          {st.hasGPZ ? (
            <div className="gpz-badge">ACTIVE TODAY: Golden Pivot Zone Present</div>
          ) : (
            <div className="setup-row">
              <span>STATUS</span>
              <b>Normal Pivot Spacing</b>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const [data, setData] = useState(niftyData);
  const [liveData, setLiveData] = useState(null);
  const [livePending, setLivePending] = useState(true);  // true = first fetch not yet done
  const [liveError, setLiveError] = useState(false);     // true = API failed, use fallback
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    const controller = new AbortController();

    const fetchLive = () => {
      fetch("/api/nifty", { signal: controller.signal })
        .then((r) => r.json())
        .then((res) => {
          if (res.success) {
            setLiveData(res);
            setLiveError(false);
          } else {
            // API responded but with an error (e.g. Yahoo down)
            setLiveError(true);
          }
          setLivePending(false);
        })
        .catch((err) => {
          // Ignore abort errors, handle real network/timeout errors
          if (err.name === "AbortError") return;
          setLiveError(true);
          setLivePending(false);
        });
    };

    fetchLive();

    // Smart polling: only during NSE market hours (9:00 AM – 3:30 PM IST, Mon–Fri)
    const isMarketOpen = () => {
      const now = new Date();
      // Convert to IST (UTC+5:30)
      const istOffset = 5.5 * 60 * 60 * 1000;
      const ist = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000);
      const day = ist.getDay(); // 0=Sun, 6=Sat
      const h = ist.getHours();
      const m = ist.getMinutes();
      const totalMin = h * 60 + m;
      const marketOpen = 9 * 60;        // 9:00 AM
      const marketClose = 15 * 60 + 30;  // 3:30 PM
      if (day === 0 || day === 6) return false; // Weekend
      return totalMin >= marketOpen && totalMin <= marketClose;
    };

    // Only set up polling if market is currently open
    let interval = null;
    if (isMarketOpen()) {
      interval = setInterval(fetchLive, 10000); // 10 seconds during market hours
    }
    // else: already fetched once above, no polling outside market hours

    return () => { if (interval) clearInterval(interval); controller.abort(); };
  }, []);

  const st = useMemo(() => (data ? buildState(data) : null), [data]);

  if (!st) return <main className="loading">Loading market map…</main>;

  // Determine market session status for UI labels
  const nowIST = (() => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    return new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000);
  })();
  const istDay = nowIST.getDay();
  const istMin = nowIST.getHours() * 60 + nowIST.getMinutes();
  const marketOpen = istDay >= 1 && istDay <= 5 && istMin >= 540 && istMin <= 930;

  // ltpVal logic:
  //   - livePending (first fetch not done yet)  → null  → show "—"
  //   - liveData available                      → live LTP from Yahoo
  //   - liveError (API failed)                  → fallback to 15m close
  const fallbackClose = data?.first_15m_candle?.close || st.p.close;
  const ltpVal = livePending ? null : liveData ? liveData.ltp : fallbackClose;
  const changeVal = liveData ? liveData.change : 0;
  const changePctVal = liveData ? liveData.changePct : 0;

  const topbarStatus = livePending
    ? "FETCHING…"
    : liveData
      ? `LIVE TICK (${liveData.lastUpdated})`
      : "DATA SNAPSHOT (API ERROR)";

  const sessionTag = marketOpen ? "MARKET OPEN" : "MARKET CLOSED";


  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <div className="mark">G</div>
          <div>
            <b>PIVOT-BOSS</b>
            <span>Trading Strategy Dashboard</span>
          </div>
        </div>
        <div className="topmeta">
          <i aria-label="Live indicator" role="img" /> {topbarStatus} <span>{sessionTag}</span>
        </div>
      </header>

      <div className="shell">
        <section className="hero">
          <div>
            <span className="eyebrow">NSE INDEX · NIFTY 50</span>
            <h1>
              Market map before
              <br />
              <em>the first move.</em>
            </h1>
            <p>
              Strategy-first guidance: know the context, find the location, wait for price behavior, then act.
            </p>
          </div>
          <div className="close">
            <span>{livePending ? "FETCHING LTP…" : liveError ? "15M CLOSE (API ERROR)" : "LIVE NIFTY LTP"}</span>
            <b>{ltpVal !== null ? n(ltpVal, 2) : "—"}</b>
            <small>
              {liveData
                ? `${changeVal >= 0 ? "+" : ""}${changeVal.toFixed(2)} pts (${changePctVal >= 0 ? "+" : ""}${changePctVal.toFixed(2)}%)`
                : livePending
                  ? "Connecting to market feed…"
                  : `15m close: ${n(fallbackClose, 2)}`}
            </small>
          </div>
        </section>



        <nav className="tabs" role="tablist" aria-label="Dashboard section navigation">
          {["overview", "levels", "scenarios", "framework"].map((x) => (
            <button
              role="tab"
              aria-selected={tab === x}
              aria-controls={`tabpanel-${x}`}
              id={`tab-${x}`}
              tabIndex={tab === x ? 0 : -1}
              className={tab === x ? "active" : ""}
              onClick={() => setTab(x)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                  const idx = (["overview", "levels", "scenarios", "framework"].indexOf(x) + 1) % 4;
                  const next = ["overview", "levels", "scenarios", "framework"][idx];
                  setTab(next);
                  document.getElementById(`tab-${next}`)?.focus();
                } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                  const idx = (["overview", "levels", "scenarios", "framework"].indexOf(x) - 1 + 4) % 4;
                  const prev = ["overview", "levels", "scenarios", "framework"][idx];
                  setTab(prev);
                  document.getElementById(`tab-${prev}`)?.focus();
                }
              }}
              key={x}
            >
              {x}
            </button>
          ))}
        </nav>

        <section id={`tabpanel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {tab === "overview" ? (
            <Overview st={st} ltp={ltpVal} />
          ) : tab === "levels" ? (
            <LevelsTab st={st} />
          ) : tab === "scenarios" ? (
            <Scenarios st={st} data={data} ltp={ltpVal} />
          ) : (
            <FrameworkTab st={st} />
          )}
        </section>



        <footer>
          <span>PivotBoss Market Engine — Trading analysis dashboard</span>
          <span>Created by · GOPAL DAS</span>
        </footer>
      </div>
    </main>
  );
}


