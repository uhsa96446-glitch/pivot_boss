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
          <span>DAY TYPE</span>
          <b>{st.day.type || "—"}</b>
        </div>
        <div>
          <span>BIAS</span>
          <b>{st.day.bias || "—"}</b>
        </div>
      </div>
      <div className="beginner">
        <b>Beginner rule</b>
        <span>Context + location + price behavior must align. If they do not, WAIT.</span>
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
  const close = st.p.close || 0;
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
            ["CLOSE", st.p.close],
          ].map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <b>{n(v, 2)}</b>
            </div>
          ))}
        </div>
        <div className="meter-wrapper">
          <div className="meter">
            <span className="meter-pin" style={{ left: `${closePct}%` }} title={`Close: ${n(close, 2)}`} />
          </div>
          <div className="meter-label">
            <span>LOW ({n(low, 2)})</span>
            <span>CLOSE {n(close, 2)} ({closePct.toFixed(1)}%)</span>
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
};

function Scenarios({ st, data }) {
  const [filter, setFilter] = useState("all");
  const s = st.s || {};

  const openClass = data?.opening_classification || "PENDING";
  const isPending = openClass === "PENDING";
  const first15m = data?.first_15m_candle || null;

  const openClassMap = {
    IN_VALUE: "case_a_in_range_in_value",
    IN_RANGE_IN_VALUE: "case_a_in_range_in_value",
    ABOVE_VALUE: "case_b_in_range_above_value",
    IN_RANGE_ABOVE_VALUE: "case_b_in_range_above_value",
    BELOW_VALUE: "case_c_in_range_below_value",
    IN_RANGE_BELOW_VALUE: "case_c_in_range_below_value",
    OUT_ABOVE: "case_d_out_above",
    OUTSIDE_ABOVE: "case_d_out_above",
    OUT_BELOW: "case_e_out_below",
    OUTSIDE_BELOW: "case_e_out_below",
  };


  const activeCaseKey = openClassMap[openClass] || null;

  const cases = [
    ["CASE A · IN RANGE / VALUE", s.case_a_in_range_in_value, "neutral", "case_a_in_range_in_value"],
    ["CASE B · IN RANGE / ABOVE VALUE", s.case_b_in_range_above_value, "green", "case_b_in_range_above_value"],
    ["CASE C · IN RANGE / BELOW VALUE", s.case_c_in_range_below_value, "red", "case_c_in_range_below_value"],
    ["CASE D · ABOVE PDH", s.case_d_out_above, "green", "case_d_out_above"],
    ["CASE E · BELOW PDL", s.case_e_out_below, "red", "case_e_out_below"],
  ];

  const filteredCases = cases.filter(([title, o, tone, key]) => {
    if (filter === "active") return key === activeCaseKey;
    if (filter === "bullish") return tone === "green";
    if (filter === "bearish") return tone === "red";
    if (filter === "neutral") return tone === "neutral";
    return true;
  });

  const formatDynamicTarget = (rawTarget) => {
    if (!rawTarget) return "";
    const p = st.pivots || {};
    const cur = first15m?.close || st.p?.close || 24306.05;

    let targetStr = rawTarget;

    // Dynamic S1 check: If current price has already breached or tested S1, advance target to S2 & S3
    if (targetStr.includes("S1") && p.S1) {
      if (cur <= p.S1) {
        targetStr = targetStr.replace("S1", `S2 (${p.S2?.toFixed(1)}) / S3 (${p.S3?.toFixed(1)})`);
      } else {
        targetStr = targetStr.replace("S1", `S1 (${p.S1?.toFixed(1)}) / S2 (${p.S2?.toFixed(1)})`);
      }
    }

    // Dynamic R1 check: If current price has already breached R1, advance target to R2 & R3
    if (targetStr.includes("R1") && p.R1) {
      if (cur >= p.R1) {
        targetStr = targetStr.replace("R1", `R2 (${p.R2?.toFixed(1)}) / R3 (${p.R3?.toFixed(1)})`);
      } else {
        targetStr = targetStr.replace("R1", `R1 (${p.R1?.toFixed(1)}) / R2 (${p.R2?.toFixed(1)})`);
      }
    }

    // Append level prices if present
    if (targetStr.includes("POC") && !targetStr.includes("POC (") && st.va?.POC) {
      targetStr = targetStr.replace("POC", `POC (${st.va.POC.toFixed(1)})`);
    }
    if (targetStr.includes("CPR") && !targetStr.includes("CPR (") && p.P) {
      targetStr = targetStr.replace("CPR", `CPR (${p.P.toFixed(1)})`);
    }
    if (targetStr.includes("VAH") && !targetStr.includes("VAH (") && st.va?.VAH) {
      targetStr = targetStr.replace("VAH", `VAH (${st.va.VAH.toFixed(1)})`);
    }
    if (targetStr.includes("VAL") && !targetStr.includes("VAL (") && st.va?.VAL) {
      targetStr = targetStr.replace("VAL", `VAL (${st.va.VAL.toFixed(1)})`);
    }

    return targetStr;
  };

  const enrichedScenarios = {
    case_a_in_range_in_value: {
      primary: "If price breaks VAH and accepts → LONG",
      primary_target: `VAH (${st.va?.VAH?.toFixed(1) || 24402}) → R1 (${st.pivots?.R1?.toFixed(1) || 24415.2}) / R2 (${st.pivots?.R2?.toFixed(1) || 24464.4})`,
      contingency: "If price breaks VAL and accepts → SHORT",
      contingency_target: `VAL (${st.va?.VAL?.toFixed(1) || 24326}) → S1 (${st.pivots?.S1?.toFixed(1) || 24306.8}) → S2 (${st.pivots?.S2?.toFixed(1) || 24247.6}) / S3 (${st.pivots?.S3?.toFixed(1) || 24198.4})`,
      no_trade: `Price remains inside value (${st.va?.VAL?.toFixed(1) || 24326} - ${st.va?.VAH?.toFixed(1) || 24402})`,
    },
    case_b_in_range_above_value: {
      primary: "If price accepts above VAH → LONG candidate",
      primary_target: `R1 (${st.pivots?.R1?.toFixed(1) || 24415.2}) → R2 (${st.pivots?.R2?.toFixed(1) || 24464.4}) / R3 (${st.pivots?.R3?.toFixed(1) || 24523.6})`,
      contingency: "If price returns below VAH → CANCEL bullish thesis, SHORT",
      contingency_target: `POC (${st.va?.POC?.toFixed(1) || 24372}) → CPR (${st.pivots?.P?.toFixed(1) || 24356}) → VAL (${st.va?.VAL?.toFixed(1) || 24326})`,
      failure: "VAH acts as strong resistance",
    },
    case_c_in_range_below_value: {
      primary: "If price accepts below VAL → SHORT candidate",
      primary_target: `S1 (${st.pivots?.S1?.toFixed(1) || 24306.8}) → S2 (${st.pivots?.S2?.toFixed(1) || 24247.6}) / S3 (${st.pivots?.S3?.toFixed(1) || 24198.4})`,
      contingency: "If price reclaims VAL → CANCEL bearish thesis, LONG",
      contingency_target: `POC (${st.va?.POC?.toFixed(1) || 24372}) → CPR (${st.pivots?.P?.toFixed(1) || 24356}) → VAH (${st.va?.VAH?.toFixed(1) || 24402})`,
      failure: "VAL acts as strong support",
    },
    case_d_out_above: {
      primary: "If first 15m closes above PDH → Initiative Bullish confirmation, LONG",
      primary_target: `R2 (${st.pivots?.R2?.toFixed(1) || 24464.4}) → R3 (${st.pivots?.R3?.toFixed(1) || 24523.6}) / R4 (${st.pivots?.R4?.toFixed(1) || 24572.8})`,
      contingency: "If first 15m closes below PDH → Failed Gap Up, SHORT",
      contingency_target: `PDH (${st.p?.high?.toFixed(1) || 24405.2}) → VAH (${st.va?.VAH?.toFixed(1) || 24402}) → POC (${st.va?.POC?.toFixed(1) || 24372})`,
      failure: "Gap fill back inside prior day range",
    },
    case_e_out_below: {
      primary: "If first 15m closes below PDL → Initiative Bearish confirmation, SHORT",
      primary_target: `S2 (${st.pivots?.S2?.toFixed(1) || 24247.6}) → S3 (${st.pivots?.S3?.toFixed(1) || 24198.4}) / S4 (${st.pivots?.S4?.toFixed(1) || 24149.2})`,
      contingency: "If first 15m closes above PDL → Failed Gap Down, LONG",
      contingency_target: `PDL (${st.p?.low?.toFixed(1) || 24296.8}) → VAL (${st.va?.VAL?.toFixed(1) || 24326}) → POC (${st.va?.POC?.toFixed(1) || 24372})`,
      failure: "Gap fill back inside prior day range",
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
              : first15m
                ? `First 15m Candle: High ${first15m.high} · Low ${first15m.low} · Close ${first15m.close}${first15m.type ? ` · ${first15m.type}` : ""}${first15m.acceptance ? ` (${first15m.acceptance})` : ""}`
                : "Awaiting 15m candle close for confirmation"}
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
          ["all", "All Scenarios (5)"],
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
          <p>Classify opening vs prior Range (PDH/PDL) and Value Area (VAH/VAL).</p>
        </div>
        <div className="flow-step">
          <span className="flow-step-num">STEP 02</span>
          <h4>15m Acceptance</h4>
          <p>Observe first 15m candle close to verify initiative vs responsive conviction.</p>
        </div>
        <div className="flow-step">
          <span className="flow-step-num">STEP 03</span>
          <h4>Trigger Level</h4>
          <p>Wait for price action setup (Wick / Doji / Breakout) at decision levels.</p>
        </div>
        <div className="flow-step">
          <span className="flow-step-num">STEP 04</span>
          <h4>Target / Invalidation</h4>
          <p>Execute with explicit target level (R1/S1/POC) and tight stop invalidation.</p>
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
                        {conditionExplanations[o.condition.trim()] || o.condition}
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
    fetch("/data/NIFTY.json")
      .then((r) => r.json())
      .then(setData)
      .catch(() => { });

    const fetchLive = () => {
      fetch("/api/nifty")
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
        .catch(() => {
          // Network or timeout error
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

    return () => { if (interval) clearInterval(interval); };
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
          <i /> {topbarStatus} <span>{sessionTag}</span>
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
              className={tab === x ? "active" : ""}
              onClick={() => setTab(x)}
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
            <Scenarios st={st} data={data} />
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


