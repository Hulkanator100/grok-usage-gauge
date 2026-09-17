import { SURFACE_GUIDE } from "./surfaces";
import { computeTankMetrics, otherModelsCapUsd, type TankMetrics } from "./metrics";
import type { AppSettings, LastImport, Reading, TankId, XGrokPlan } from "./types";
import { CURSOR_TANK_IDS, isXGrokTank, OTHER_MODELS_INCLUDED_USD, TANK_IDS, TANK_META, X_GROK_CAPS, X_GROK_TANK_IDS } from "./types";
import { sortedReadings } from "./storage";
import { historyPoints, polylineRemaining, timeWindow, type HistoryPoint } from "./chart";
import { estimateAllTanks, polylineValues, type TankEstimate } from "./estimate";
import { formatWhen, type IngestReview } from "./ingestReview";

function fmtPct(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(1)}%`;
}

function fmtUsd(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtWhen(d: Date | undefined): string {
  if (!d) return "—";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function fmtPace(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "Need a start date and % used";
  return `${n.toFixed(2)}× calendar pace`;
}

function fillClass(pct: number | undefined): string {
  if (pct == null) return "unknown";
  if (pct >= 90) return "critical";
  if (pct >= 70) return "hot";
  if (pct >= 40) return "warm";
  return "ok";
}

function snapshotsFor(readings: Reading[], tank: TankId) {
  return sortedReadings(readings)
    .filter((r) => r.tanks[tank])
    .map((r) => ({ capturedAt: r.capturedAt, snap: r.tanks[tank]! }));
}

export function metricsForTank(readings: Reading[], tank: TankId, settings: AppSettings, now: Date): TankMetrics {
  const kind = isXGrokTank(tank)
    ? "window2h"
    : tank === "grokBotWeekly"
      ? "week"
      : tank === "onDemandMonthly"
        ? "cap"
        : "month";
  const fallbackCapUsd =
    tank === "otherModelsMonthly"
      ? otherModelsCapUsd(settings.plan, settings.customOtherModelsUsd)
      : tank === "onDemandMonthly"
        ? settings.onDemandCapUsd
        : undefined;
  const fallbackRequestCap =
    tank === "xGrokLight"
      ? settings.xLightCap
      : tank === "xGrokMedium"
        ? settings.xMediumCap
        : tank === "xGrokHeavy"
          ? settings.xHeavyCap
          : undefined;
  return computeTankMetrics({
    kind,
    snapshots: snapshotsFor(readings, tank),
    now,
    fallbackCapUsd,
    fallbackRequestCap,
  });
}

function mixLabel(key: string): string {
  if (key === "grok-bot-default") return "Bot chats";
  if (key === "grok-bot-automation") return "Scheduled routines";
  if (key === "grok-bot-cua") return "Computer / browser";
  return key;
}

function mixBlock(m: TankMetrics): string {
  if (!m.mixCents) return "";
  const rows = Object.entries(m.mixCents)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `<li>${escapeHtml(mixLabel(k))} ${v}¢</li>`)
    .join("");
  return `<div class="mix"><h4>Where Bot-week cents went (not token counts)</h4><ul>${rows}</ul></div>`;
}

function fmtTokens(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function tokenNote(m: TankMetrics): string {
  if (!m.tokenTotals) return "";
  const t = m.tokenTotals;
  return `<p class="token-note">Token counts from the Usage page are extra context only (routines re-send the chat; cache reads puff the count). Weekly % on Settings is based on dollars. Chart ${fmtTokens(t.total)} · in ${fmtTokens(t.input)} · out ${fmtTokens(t.output)} · cache ${fmtTokens(t.cacheRead)}</p>`;
}

function rangeBlock(m: TankMetrics): string {
  if (!m.emptyAt) {
    return `<div class="metric"><span>Empty by</span><strong>Need two dated readings</strong></div>`;
  }
  const vs =
    m.hoursEarlyVsReset == null
      ? ""
      : m.hoursEarlyVsReset > 0
        ? `${m.hoursEarlyVsReset.toFixed(1)} h before reset`
        : `${Math.abs(m.hoursEarlyVsReset).toFixed(1)} h after reset (holds)`;
  return `<div class="metric"><span>Empty by</span><strong>${fmtWhen(m.emptyAt)}</strong><em>${vs}</em></div>`;
}

function warnBlock(m: TankMetrics, tank: TankId): string {
  const w = m.acceleration;
  if (!w) return "";
  const label = isXGrokTank(tank)
    ? "empty before the 2-hour X window resets"
    : tank === "grokBotWeekly"
      ? "empty before weekly reset"
      : "empty before period end";
  return `<div class="accel-warn" role="alert">
    <strong>Burning faster:</strong> the newest stretch is ${((w.fasterRatio - 1) * 100).toFixed(0)}% quicker than the one before
    (${w.newestBurnPercentPerHour.toFixed(2)}% per hour vs ${w.previousBurnPercentPerHour.toFixed(2)}% per hour).
    You will <em>${label}</em> at ${fmtWhen(w.emptyAt)}
    (${w.hoursEarly.toFixed(1)} hours early vs ${fmtWhen(w.periodEnd)}).
  </div>`;
}

export function fuelNeedleDeg(percentUsed: number | undefined): number {
  if (percentUsed == null || Number.isNaN(percentUsed)) return -90;
  const remaining = Math.max(0, Math.min(100, 100 - percentUsed));
  return -90 + (remaining / 100) * 180;
}

function fuelTicks(): string {
  const ticks: string[] = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const remaining = i / n;
    const deg = -90 + remaining * 180;
    const rad = (deg * Math.PI) / 180;
    const inner = i === 0 || i === n || i === n / 2 ? 58 : 62;
    const outer = 74;
    const x1 = 100 + inner * Math.sin(rad);
    const y1 = 100 - inner * Math.cos(rad);
    const x2 = 100 + outer * Math.sin(rad);
    const y2 = 100 - outer * Math.cos(rad);
    ticks.push(`<line class="tick${i % 2 === 0 ? " major" : ""}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" />`);
  }
  return ticks.join("");
}

function fmtAxis(t: number): string {
  return new Date(t).toLocaleString(undefined, { month: "short", day: "numeric" });
}

function chartWash(id: string, w: number, h: number): string {
  const rw = (w - 1).toFixed(1);
  const rh = (h - 1).toFixed(1);
  return `<defs>
    <linearGradient id="${id}-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#242424"/>
      <stop offset="42%" stop-color="#161616"/>
      <stop offset="100%" stop-color="#000000"/>
    </linearGradient>
    <radialGradient id="${id}-amber" cx="50%" cy="0%" r="80%">
      <stop offset="0%" stop-color="rgba(232,160,23,0.38)"/>
      <stop offset="58%" stop-color="rgba(232,160,23,0)"/>
    </radialGradient>
    <radialGradient id="${id}-star" cx="100%" cy="100%" r="70%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.10)"/>
      <stop offset="52%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
  </defs>
  <rect class="spark-face" x="0.5" y="0.5" width="${rw}" height="${rh}" fill="url(#${id}-body)"/>
  <rect class="spark-wash" x="0.5" y="0.5" width="${rw}" height="${rh}" fill="url(#${id}-amber)"/>
  <rect class="spark-wash" x="0.5" y="0.5" width="${rw}" height="${rh}" fill="url(#${id}-star)"/>`;
}

function renderSpark(points: HistoryPoint[], washId = "spark"): string {
  if (points.length < 2) {
    return `<p class="spark-idle">History graph needs 2+ readings</p>`;
  }
  const w = 200;
  const h = 52;
  const d = polylineRemaining(points, w, h);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="Remaining fuel over time">
    ${chartWash(washId, w, h)}
    <path d="${d}" class="spark-line" fill="none"/>
  </svg>`;
}

function renderTankHistoryPanel(tank: TankId, points: HistoryPoint[]): string {
  const meta = TANK_META[tank];
  if (points.length < 2) {
    return `<article class="instrument-card">
      <h3>${meta.title}</h3>
      <p class="spark-idle">Need two dated readings for this tank.</p>
    </article>`;
  }
  const w = 320;
  const h = 140;
  const d = polylineRemaining(points, w, h, 28, 16);
  const first = points[0];
  const last = points[points.length - 1];
  return `<article class="instrument-card">
    <h3>${meta.title}</h3>
    <svg class="trace" viewBox="0 0 ${w} ${h}" role="img" aria-label="${meta.title} remaining over the captured period">
      ${chartWash(`trace-${tank}`, w, h)}
      <text class="axis-y" x="14" y="22">F</text>
      <text class="axis-y" x="14" y="${h - 10}">E</text>
      <path d="${d}" class="spark-line" fill="none"/>
      <text class="axis-x" x="28" y="${h - 4}">${fmtAxis(first.t)}</text>
      <text class="axis-x end" x="${w - 8}" y="${h - 4}">${fmtAxis(last.t)}</text>
    </svg>
    <p class="instrument-read">${fmtPct(first.remaining)} remaining → ${fmtPct(last.remaining)} remaining</p>
  </article>`;
}

const TRACE_DASH: Record<TankId, string> = {
  grokBotWeekly: "",
  cursorModelsMonthly: "7 5",
  otherModelsMonthly: "2.5 3.5",
  onDemandMonthly: "12 4 2.5 4",
  xGrokLight: "",
  xGrokMedium: "7 5",
  xGrokHeavy: "2.5 3.5",
};

function renderOverlay(readings: Reading[], settings: AppSettings, ids: readonly TankId[], aria: string): string {
  const series = ids.map((id) => historyPoints(readings, id, settings));
  const win = timeWindow(series);
  const ready = series.filter((p) => p.length >= 2).length;
  if (!win || ready === 0) {
    return `<p class="spark-idle">Load two or more dated readings (example week works) to draw remaining over time.</p>`;
  }
  const w = 960;
  const h = 220;
  const traces = ids
    .map((id, i) => {
      const points = series[i];
      if (points.length < 2) return "";
      const d = polylineRemaining(points, w, h, 36, 22, win);
      const dash = TRACE_DASH[id] ? ` stroke-dasharray="${TRACE_DASH[id]}"` : "";
      return `<path d="${d}" class="spark-line overlay-line overlay-${i}" fill="none"${dash}/>`;
    })
    .join("");
  const legend = ids
    .map((id, i) => {
      const dash = TRACE_DASH[id] ? ` stroke-dasharray="${TRACE_DASH[id]}"` : "";
      return `<li><svg class="legend-swatch" viewBox="0 0 36 8" aria-hidden="true"><line x1="1" y1="4" x2="35" y2="4" class="spark-line overlay-${i}"${dash}/></svg>${TANK_META[id].title}</li>`;
    })
    .join("");
  return `
    <div class="overlay-wrap">
      <svg class="trace overlay" viewBox="0 0 ${w} ${h}" role="img" aria-label="${aria}">
        ${chartWash(`overlay-${ids[0]}`, w, h)}
        <text class="axis-y" x="14" y="28">F</text>
        <text class="axis-y" x="14" y="${h - 14}">E</text>
        ${traces}
        <text class="axis-x" x="36" y="${h - 6}">${fmtAxis(win.t0)}</text>
        <text class="axis-x end" x="${w - 10}" y="${h - 6}">${fmtAxis(win.t1)}</text>
      </svg>
      <ul class="legend">${legend}</ul>
    </div>
  `;
}

export function renderHistoryInstrument(readings: Reading[], settings: AppSettings): string {
  const cursorPanels = CURSOR_TANK_IDS.map((id) =>
    renderTankHistoryPanel(id, historyPoints(readings, id, settings)),
  ).join("");
  const xPanels = X_GROK_TANK_IDS.map((id) => renderTankHistoryPanel(id, historyPoints(readings, id, settings))).join("");
  return `
    <section class="instrument">
      <h2>History</h2>
      <p class="bay-note">How much fuel was left over time (full at the top, empty at the bottom). Cursor and X Grok stay in separate charts so they are never mixed into one number.</p>
      <h3 class="instrument-sub">Cursor</h3>
      ${renderOverlay(readings, settings, CURSOR_TANK_IDS, "Cursor remaining fuel over time")}
      <div class="instrument-grid">${cursorPanels}</div>
      <h3 class="instrument-sub">X Grok reply windows</h3>
      ${renderOverlay(readings, settings, X_GROK_TANK_IDS, "X Grok Light Medium Heavy remaining over time")}
      <div class="instrument-grid three">${xPanels}</div>
    </section>
  `;
}

function fmtEstimate(e: TankEstimate): string {
  if (e.estimate == null) return "—";
  if (e.unit === "requests") return `${Math.round(e.estimate)} replies / 2 hours`;
  return fmtUsd(e.estimate);
}

function renderEstimatePanel(e: TankEstimate): string {
  const meta = TANK_META[e.tank];
  const spark =
    e.samples.length >= 2
      ? `<svg class="spark" viewBox="0 0 200 52" role="img" aria-label="Hidden-limit estimate over time">
      ${chartWash(`est-${e.tank}`, 200, 52)}
      <path d="${polylineValues(e.samples, 200, 52)}" class="spark-line" fill="none"/>
    </svg>`
      : `<p class="spark-idle">Need two readings for a trend line</p>`;
  const change =
    e.changedAt && e.previousEra != null && e.estimate != null
      ? `<p class="accel-warn" role="alert"><strong>Possible change:</strong> earlier guess ${e.unit === "usd" ? fmtUsd(e.previousEra) : `${Math.round(e.previousEra)} replies`} → now ${fmtEstimate(e)} (${fmtWhen(new Date(e.changedAt))}).</p>`
      : "";
  const drift =
    e.vsFallback
      ? `<p class="token-note">Guess ${fmtEstimate(e)} vs plan slider ${e.unit === "usd" ? fmtUsd(e.vsFallback.fallback) : `${e.vsFallback.fallback} replies`} (${(e.vsFallback.deltaRatio * 100).toFixed(0)}% off). Keep adding readings.</p>`
      : "";
  return `<article class="instrument-card estimate-card ${e.changedAt ? "changed" : ""} ${e.stable ? "stable" : ""}">
    <h3>${meta.title}</h3>
    <p class="clock">${e.sampleCount} reading${e.sampleCount === 1 ? "" : "s"} · ${e.stable ? "steady" : "still settling"}</p>
    <p class="estimate-value">${fmtEstimate(e)}</p>
    ${spark}
    <p class="instrument-read">${e.note}</p>
    ${change}
    ${drift}
  </article>`;
}

export function renderEstimateInstrument(readings: Reading[], settings: AppSettings): string {
  const fallbacks: Partial<Record<TankId, number>> = {
    otherModelsMonthly: otherModelsCapUsd(settings.plan, settings.customOtherModelsUsd),
    onDemandMonthly: settings.onDemandCapUsd,
    xGrokLight: settings.xLightCap,
    xGrokMedium: settings.xMediumCap,
    xGrokHeavy: settings.xHeavyCap,
  };
  const rows = estimateAllTanks(readings, fallbacks).map(renderEstimatePanel).join("");
  return `
    <section class="instrument estimate">
      <h2>Hidden limits</h2>
      <p class="bay-note">Cursor and X do not publish the true included dollars or the true 2-hour X reply limits. Each reading that has both dollars spent and % used — or replies used of a limit — is one clue. We take the middle of recent clues. If a new batch jumps by more than about 12%, the hidden limit probably changed. Keep adding screenshots; we never log into Cursor or X for you.</p>
      <div class="instrument-grid">${rows}</div>
    </section>
  `;
}

function gaugeReadout(m: TankMetrics): string {
  const hasRequests = m.requestCap != null && m.requestUsed != null;
  const remainingLine = hasRequests
    ? `${Math.max(0, m.requestCap! - m.requestUsed!)} of ${m.requestCap} remaining`
    : `${fmtPct(m.remainingPct)} remaining`;
  const usedLine = hasRequests
    ? `${m.requestUsed} / ${m.requestCap} used`
    : `${fmtPct(m.percentUsed)} used`;
  return `<div class="used-readout">
    <div class="remain-line">${remainingLine}</div>
    <div class="used-line">${usedLine}</div>
  </div>`;
}

export function renderTankCard(tank: TankId, m: TankMetrics, points: HistoryPoint[]): string {
  const meta = TANK_META[tank];
  const known = m.percentUsed != null && !Number.isNaN(m.percentUsed);
  const needle = known ? fuelNeedleDeg(m.percentUsed) : -90;
  return `
    <article class="tank-card ${fillClass(m.percentUsed)}" data-tank="${tank}">
      <header>
        <h2>${meta.title}</h2>
        <p class="clock">${meta.clock}</p>
      </header>
      <div class="tank-visual">
        <div class="fuel-gauge ${known ? "" : "unknown-needle"}" data-empty="${known ? "false" : "true"}" style="--needle:${needle.toFixed(1)}deg">
          <svg viewBox="0 0 200 200" role="img" aria-label="${meta.title} ${fmtPct(m.remainingPct)} remaining, ${fmtPct(m.percentUsed)} used">
            <defs>
              <linearGradient id="bezel-${tank}" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#6a6a6a"/>
                <stop offset="45%" stop-color="#1a1a1a"/>
                <stop offset="100%" stop-color="#8a8a8a"/>
              </linearGradient>
              <radialGradient id="glass-${tank}" cx="38%" cy="28%" r="70%">
                <stop offset="0%" stop-color="rgba(255,255,255,0.16)"/>
                <stop offset="42%" stop-color="rgba(0,0,0,0)"/>
                <stop offset="100%" stop-color="rgba(0,0,0,0.55)"/>
              </radialGradient>
              <linearGradient id="face-body-${tank}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#242424"/>
                <stop offset="42%" stop-color="#161616"/>
                <stop offset="100%" stop-color="#000000"/>
              </linearGradient>
              <radialGradient id="face-amber-${tank}" cx="50%" cy="8%" r="85%">
                <stop offset="0%" stop-color="rgba(232,160,23,0.42)"/>
                <stop offset="58%" stop-color="rgba(232,160,23,0)"/>
              </radialGradient>
              <radialGradient id="face-star-${tank}" cx="92%" cy="92%" r="70%">
                <stop offset="0%" stop-color="rgba(255,255,255,0.12)"/>
                <stop offset="52%" stop-color="rgba(255,255,255,0)"/>
              </radialGradient>
              <filter id="glow-${tank}" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="1.6" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            <circle class="bezel" cx="100" cy="100" r="96" fill="url(#bezel-${tank})"/>
            <circle class="face" cx="100" cy="100" r="86" fill="url(#face-body-${tank})"/>
            <circle class="face-wash" cx="100" cy="100" r="86" fill="url(#face-amber-${tank})"/>
            <circle class="face-wash" cx="100" cy="100" r="86" fill="url(#face-star-${tank})"/>
            <circle class="rim-glow" cx="100" cy="100" r="82" fill="none" stroke="#e8a017" stroke-width="2.2" opacity="0.9"/>
            <path class="empty-zone" d="M32,100 A68,68 0 0 1 44,56" fill="none"/>
            <g class="ticks" stroke="#f4f4f4" stroke-linecap="round">${fuelTicks()}</g>
            <text class="mark-e" x="38" y="118">E</text>
            <text class="mark-f" x="162" y="118">F</text>
            <text class="mark-half" x="100" y="52">½</text>
            <circle class="glass" cx="100" cy="100" r="86" fill="url(#glass-${tank})"/>
            <text class="fuel-word" x="100" y="168">FUEL</text>
            <g class="needle-g"${known ? ` transform="rotate(${needle.toFixed(1)} 100 100)"` : ""}>
              <polygon class="needle-shadow" points="100,26 107,106 100,118 93,106"/>
              <polygon class="needle" fill="#e10600" stroke="#ff4d4d" points="100,24 106.5,104 100,114 93.5,104"/>
              <circle class="hub" cx="100" cy="100" r="11"/>
              <circle class="hub-eye" fill="#e10600" cx="100" cy="100" r="4"/>
            </g>
          </svg>
        </div>
        ${gaugeReadout(m)}
        ${renderSpark(points, `spark-${tank}`)}
      </div>
      <dl class="metrics">
        <div class="metric"><span>Remaining</span><strong>${fmtPct(m.remainingPct)}</strong>${
          m.requestCap != null && m.requestUsed != null
            ? `<em>${Math.max(0, m.requestCap - m.requestUsed)} of ${m.requestCap} requests left this 2h window</em>`
            : m.remainingUsd != null
              ? `<em>${fmtUsd(m.remainingUsd)} left</em>`
              : `<em>dollars left when spend and % are known</em>`
        }</div>
        <div class="metric"><span>Used</span><strong>${
          m.requestCap != null && m.requestUsed != null
            ? `${m.requestUsed} / ${m.requestCap}`
            : fmtPct(m.percentUsed)
        }</strong>${m.spendUsd != null ? `<em>${fmtUsd(m.spendUsd)} spent</em>` : `<em>how much of this tank is gone</em>`}</div>
        <div class="metric"><span>Resets</span><strong>${fmtWhen(m.periodEnd)}</strong></div>
        <div class="metric"><span>Pace</span><strong>${fmtPace(m.pace)}</strong><em>1.00× means on the calendar budget</em></div>
        ${rangeBlock(m)}
        ${m.impliedGrantUsd != null ? `<div class="metric"><span>Hidden included $</span><strong>${fmtUsd(m.impliedGrantUsd)}</strong><em>from spend and % used on this reading</em></div>` : ""}
        ${m.spendUsd != null ? `<div class="metric"><span>Spent</span><strong>${fmtUsd(m.spendUsd)}</strong>${m.capUsd != null ? `<em>cap ${fmtUsd(m.capUsd)}</em>` : ""}</div>` : ""}
        ${m.hardStop ? `<div class="metric hard-stop"><span>On-demand</span><strong>$0 cap — extra pay is off</strong><em>No overflow billing after included pools.</em></div>` : ""}
      </dl>
      ${warnBlock(m, tank)}
      ${mixBlock(m)}
      ${tokenNote(m)}
      <p class="surfaces">${meta.surfaces} ${meta.grantNote}</p>
    </article>
  `;
}

export type { LastImport } from "./types";

export const APP_TABS = [
  { id: "cursor", label: "Cursor tanks" },
  { id: "xgrok", label: "X Grok" },
  { id: "history", label: "History" },
      { id: "estimate", label: "Hidden limits" },
  { id: "add", label: "Add reading" },
  { id: "review", label: "Review" },
  { id: "log", label: "Readings" },
] as const;

export type AppTab = (typeof APP_TABS)[number]["id"];

export function isAppTab(value: string): value is AppTab {
  return APP_TABS.some((t) => t.id === value);
}

function tabButton(id: AppTab, label: string, active: AppTab, extra = ""): string {
  const on = id === active;
  return `<button type="button" class="app-tab" role="tab" id="tab-${id}" data-tab="${id}" aria-selected="${on}" aria-controls="panel-${id}">${label}${extra}</button>`;
}

function tabPanel(id: AppTab, active: AppTab, inner: string): string {
  const on = id === active;
  return `<section class="tab-panel" role="tabpanel" id="panel-${id}" data-panel="${id}" aria-labelledby="tab-${id}" ${on ? "" : "hidden"}>${inner}</section>`;
}

function renderReviewPanel(review: IngestReview | undefined): string {
  if (!review) {
    return `<section class="review-panel">
      <h2>Confirm this import</h2>
      <p class="bay-note">After you drop a file, choose a file, or save a paste, this tab lists the dates we used and whether remaining fuel moved. Gauges stay closed until you open them.</p>
    </section>`;
  }
  const changeRows = review.changes
    .map((c) => {
      const klass = c.changed ? "changed" : "same";
      const flag = c.changed ? "Changed" : "No change";
      return `<tr class="${klass}">
        <th>${c.title}</th>
        <td>${escapeHtml(c.beforeLabel)}${c.beforeAt ? `<div class="when">${formatWhen(c.beforeAt)}</div>` : ""}</td>
        <td>${escapeHtml(c.afterLabel)}${c.afterAt ? `<div class="when">${formatWhen(c.afterAt)}</div>` : ""}</td>
        <td>${flag}</td>
      </tr>`;
    })
    .join("");
  const stamps = review.stamps
    .map(
      (s) =>
        `<li><strong>${escapeHtml(s.label)}</strong> · ${formatWhen(s.capturedAt)}${s.note ? `<div class="notes">${escapeHtml(s.note)}</div>` : ""}</li>`,
    )
    .join("");
  const headline =
    review.changedCount === 0
      ? "Saved, but remaining fuel looks the same as before."
      : `${review.changedCount} tank${review.changedCount === 1 ? "" : "s"} changed.`;
  return `<section class="review-panel">
    <h2>Confirm this import</h2>
    <p class="notice">${escapeHtml(headline)}</p>
    <p class="control-status">Submitted ${formatWhen(review.submittedAt)} · ${escapeHtml(review.sourceLabel)} · ${escapeHtml(review.names)}</p>
    <p class="slide-hint">${escapeHtml(review.summary)}</p>
    ${review.error ? `<p class="error" role="alert">${escapeHtml(review.error)}</p>` : ""}
    <h3 class="instrument-sub">Dates we used (may be older than today)</h3>
    ${stamps ? `<ol class="review-stamps">${stamps}</ol>` : `<p>No dated readings in this batch.</p>`}
    <h3 class="instrument-sub">Remaining fuel before → after</h3>
    <div class="review-table-wrap">
      <table class="review-table">
        <thead><tr><th>Tank</th><th>Before</th><th>After</th><th></th></tr></thead>
        <tbody>${changeRows}</tbody>
      </table>
    </div>
    <div class="row paste-actions">
      <button type="button" id="review-to-cursor">Show Cursor tanks</button>
      <button type="button" id="review-to-xgrok" class="ghost">Show X Grok</button>
      <button type="button" id="review-to-history" class="ghost">Show history</button>
      <button type="button" id="review-to-add" class="ghost">Add another</button>
    </div>
  </section>`;
}

export function renderApp(args: {
  readings: Reading[];
  settings: AppSettings;
  paste: string;
  capturedAtLocal: string;
  notice?: string;
  error?: string;
  busy?: string;
  lastImport?: LastImport;
  activeTab?: AppTab;
  review?: IngestReview;
}): string {
  const now = new Date();
  const cursorCards = CURSOR_TANK_IDS.map((id) =>
    renderTankCard(id, metricsForTank(args.readings, id, args.settings, now), historyPoints(args.readings, id, args.settings)),
  ).join("");
  const xCards = X_GROK_TANK_IDS.map((id) =>
    renderTankCard(id, metricsForTank(args.readings, id, args.settings, now), historyPoints(args.readings, id, args.settings)),
  ).join("");
  const n = args.readings.length;
  const history = sortedReadings(args.readings)
    .slice()
    .reverse()
    .map((r) => {
      const bits = TANK_IDS.map((id) => {
        const s = r.tanks[id];
        if (!s) return "";
        const pct = s.percentUsed != null ? `${s.percentUsed.toFixed(1)}%` : s.spendUsd != null ? fmtUsd(s.spendUsd) : "·";
        return `<span>${TANK_META[id].title}: ${pct}</span>`;
      }).join("");
      return `<li><time datetime="${r.capturedAt}">${fmtWhen(new Date(r.capturedAt))}</time> <code>${r.source}${r.surface ? ` · ${r.surface}` : ""}</code> ${r.drop ? `<em>${escapeHtml(r.drop.fileName)}</em>` : ""} ${r.drop?.previewDataUrl ? `<img class="thumb" alt="" src="${r.drop.previewDataUrl}" />` : ""} ${bits}${r.notes?.length ? `<div class="notes">${r.notes.map(escapeHtml).join(" ")}</div>` : ""}</li>`;
    })
    .join("");

  const tab = args.activeTab ?? "cursor";
  const statusBanner = args.lastImport
    ? `<div class="ingest-banner" role="status"><strong>${escapeHtml(args.lastImport.names)}</strong> · ${escapeHtml(args.lastImport.summary)}</div>`
    : args.readings.length
      ? `<div class="ingest-banner" role="status">${n} stored reading${n === 1 ? "" : "s"} in this browser.</div>`
      : `<div class="ingest-banner idle">No readings yet — use Add reading or Sample data.</div>`;

  return `
    <header class="masthead">
      <div class="mast-row">
        <div class="horizon" aria-hidden="true"></div>
        <div>
          <p class="eyebrow">Separate tanks for Cursor and Grok on X</p>
          <h1>Grok Usage Gauge</h1>
        </div>
      </div>
      <p class="lede-short">Add a screenshot or paste what you see on the meter. Nothing is sent away from this browser.</p>
      ${args.error ? `<p class="error" role="alert">${escapeHtml(args.error)}</p>` : ""}
      ${args.notice ? `<p class="notice">${escapeHtml(args.notice)}</p>` : ""}
      ${args.busy ? `<p class="notice" role="status">${escapeHtml(args.busy)}</p>` : ""}
      ${statusBanner}
    </header>
    <nav class="app-tabs" role="tablist" aria-label="Gauge groups">
      ${tabButton("cursor", "Cursor tanks", tab)}
      ${tabButton("xgrok", "X Grok", tab)}
      ${tabButton("history", "History", tab)}
      ${tabButton("estimate", "Hidden limits", tab)}
      ${tabButton("add", "Add reading", tab)}
      ${tabButton("review", "Review", tab, args.review ? `<span class="tab-count">${args.review.changedCount}</span>` : "")}
      ${tabButton("log", "Readings", tab, n ? `<span class="tab-count">${n}</span>` : "")}
    </nav>

    ${tabPanel(
      "cursor",
      tab,
      `<h2 class="bay-title">Cursor fuel tanks</h2>
      <p class="bay-note">Four separate tanks. If Grok Bot starts a Cursor cloud agent, that run can spend Cursor Models, Other Models, and extra paid usage as well as the Bot week — watch each tank; do not add them together. Extra Grok plans on the same Cursor account do not stack: you get one Bot week (the larger amount).</p>
      <div class="tank-grid">${cursorCards}</div>`,
    )}

    ${tabPanel(
      "xgrok",
      tab,
      `<h2 class="bay-title">X Grok reply windows</h2>
      <p class="bay-note">Grok on x.com and the X app. Light, Medium, and Heavy are three separate reply counts that refill about every two hours. They are not your Cursor dollar tanks, not Grok Bot week, and not grok.com SuperGrok. If you paste Light 42 of 50, that number wins over the plan guesses on Add reading. X developer prepaid credits stay out of these tanks.</p>
      <div class="tank-grid three">${xCards}</div>`,
    )}

    ${tabPanel("history", tab, renderHistoryInstrument(args.readings, args.settings))}
    ${tabPanel("estimate", tab, renderEstimateInstrument(args.readings, args.settings))}

    ${tabPanel(
      "add",
      tab,
      `<section class="console">
      <div class="panel save-panel">
        <h2>Save a reading</h2>
        <p class="slide-hint">Drop or choose a file and we read it right away. If you paste text, press Save. Nothing is sent away from this browser.</p>
        <p class="bay-note">What we look for: % used and reset time on Spending or Grok Bot Settings; dollars spent if shown; Light / Medium / Heavy counts on X (like 42 of 50). A token chart is not tank %.</p>
        ${args.error ? `<p class="error" role="alert">${escapeHtml(args.error)}</p>` : ""}
        ${args.notice ? `<p class="notice">${escapeHtml(args.notice)}</p>` : ""}
        ${args.busy ? `<p class="notice" role="status">${escapeHtml(args.busy)}</p>` : ""}

        <ol class="save-steps">
          <li class="save-step">
            <h3>1 · Timestamp</h3>
            <label class="select-field">When this screenshot or paste was taken
              <input id="captured-at" type="datetime-local" value="${args.capturedAtLocal}" />
            </label>
            <p class="slide-hint">Used only if the file does not already have a date. Photos, text in the image, the file name, and rows in a Cursor Usage spreadsheet keep their own times, so older shots dropped today still plot on those days.</p>
          </li>
          <li class="save-step">
            <h3>2 · Drop or choose a file</h3>
            <div id="drop-zone" class="drop-zone" role="button" tabindex="0">
              <p class="drop-lead"><strong>Drop here</strong> or choose a file — we start reading it right away.</p>
              <ul class="type-chips">
                <li>Spending / Settings screenshot</li>
                <li>Cursor Usage spreadsheet</li>
                <li>Text or backup file</li>
              </ul>
              <input id="file-input" class="file-input-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif,.csv,text/csv,.txt,.md,.json,.log" multiple />
              <button type="button" id="choose-files">Choose files</button>
              <p class="chosen">${args.lastImport ? escapeHtml(args.lastImport.names) : "No file chosen yet"}</p>
              <p class="slide-hint">Skip unfinished Chrome downloads. grok.com SuperGrok is a different meter. You can also paste an image with Ctrl+V anywhere on this page.</p>
            </div>
            ${
              args.lastImport
                ? `<div id="ingest-output" class="ingest-output" role="status">
              <h3>Last file result</h3>
              <p><strong>${escapeHtml(args.lastImport.names)}</strong></p>
              <p>${escapeHtml(args.lastImport.summary)}</p>
              ${
                args.lastImport.extracted
                  ? `<details class="extract-details"><summary>Text we read</summary><pre class="extract">${escapeHtml(args.lastImport.extracted.slice(0, 4000))}</pre></details>`
                  : `<p class="muted">No readable text in this file.</p>`
              }
            </div>`
                : ""
            }
          </li>
          <li class="save-step">
            <h3>3 · Or paste text</h3>
            <label class="select-field">Text from Spending, Settings, /usage, or X
              <textarea id="paste" rows="7" placeholder="Weekly usage 61% … or Light 42/100">${escapeHtml(args.paste)}</textarea>
            </label>
            <div class="row paste-actions">
              <button type="button" id="save-paste">Save pasted reading</button>
              <button type="button" id="fill-sample" class="ghost">Fill sample paste</button>
            </div>
            <p class="slide-hint">Fill sample only loads the box. Save pasted reading stores the tanks.</p>
          </li>
        </ol>
      </div>
      <div class="panel controls-panel">
        <h2>This browser only</h2>
        <p class="control-status">${n} stored reading${n === 1 ? "" : "s"}. Empty-by date needs two readings. A speed-up warning needs three. Hidden-limit guesses need dollars and % used, or replies used of a limit.</p>

        <div class="control-block sample-io">
          <h3>Sample data</h3>
          <p class="slide-hint">These buttons never talk to Cursor or X. They either <strong>replace</strong> the readings in this browser or <strong>copy / wipe</strong> what is stored here.</p>

          <h4 class="io-heading">What these buttons put in</h4>
          <ul class="io-list">
            <li>
              <button type="button" id="load-example">Load example week</button>
              <p><span class="io-k">Puts in</span> a two-reading demo (no file). <span class="io-k">Result</span> replaces stored history with four Cursor tanks and three X windows, on-pace Bot week.</p>
            </li>
            <li>
              <button type="button" id="load-accel">Load accelerating week</button>
              <p><span class="io-k">Puts in</span> a three-reading demo (no file). <span class="io-k">Result</span> replaces history; Grok Bot should warn it will empty before weekly reset.</p>
            </li>
            <li>
              <button type="button" id="load-sample-csv">Load sample Cursor Usage spreadsheet</button>
              <p><span class="io-k">Puts in</span> a shipped Cursor Usage export. <span class="io-k">Result</span> daily Cursor spend readings from that file (not X windows).</p>
            </li>
          </ul>

          <h4 class="io-heading">Copy or wipe what this browser stored</h4>
          <ul class="io-list">
            <li>
              <button type="button" id="export-json" class="ghost">Download a backup</button>
              <p><span class="io-k">From</span> readings and settings in this browser. <span class="io-k">Result</span> a private file on this computer (not uploaded).</p>
            </li>
            <li>
              <div class="io-action">
                <button type="button" id="restore-json" class="ghost">Restore a backup</button>
                <input id="restore-json-input" type="file" accept="application/json,.json" hidden />
              </div>
              <p><span class="io-k">Puts in</span> a backup you downloaded earlier. <span class="io-k">Result</span> replaces this browser’s stored readings and settings.</p>
            </li>
            <li>
              <button type="button" id="clear-data" class="danger">Clear local data</button>
              <p><span class="io-k">Asks</span> you to confirm. <span class="io-k">Result</span> empty tanks, default sliders, paste box cleared. A backup file on disk is untouched.</p>
            </li>
          </ul>
        </div>

        <div class="control-block">
          <h3>Cursor month</h3>
          <p class="slide-hint">Other Models included dollars follow the plan. Extra paid usage is a monthly dollar cap; $0 turns extra pay off.</p>
          <label class="select-field">Plan
            <select id="plan">
              <option value="pro" ${args.settings.plan === "pro" ? "selected" : ""}>Pro · Other Models ${fmtUsd(OTHER_MODELS_INCLUDED_USD.pro)}</option>
              <option value="proPlus" ${args.settings.plan === "proPlus" ? "selected" : ""}>Pro+ · Other Models ${fmtUsd(OTHER_MODELS_INCLUDED_USD.proPlus)}</option>
              <option value="ultra" ${args.settings.plan === "ultra" ? "selected" : ""}>Ultra · Other Models ${fmtUsd(OTHER_MODELS_INCLUDED_USD.ultra)}</option>
              <option value="custom" ${args.settings.plan === "custom" ? "selected" : ""}>Custom Other Models $</option>
            </select>
          </label>
          ${
            args.settings.plan === "custom"
              ? sliderField({
                  id: "custom-other",
                  label: "Other Models included",
                  hint: "Public included $ for Claude / GPT / etc. this billing cycle.",
                  min: 0,
                  max: 400,
                  step: 5,
                  value: args.settings.customOtherModelsUsd,
                  display: formatUsdCap(args.settings.customOtherModelsUsd),
                })
              : `<p class="plan-readout">Other Models included <strong>${fmtUsd(OTHER_MODELS_INCLUDED_USD[args.settings.plan])}</strong></p>`
          }
          ${sliderField({
            id: "ondemand-cap",
            label: "On-demand monthly cap",
            hint: "Paid extra after included pools. Slide to $0 to turn extra pay off.",
            min: 0,
            max: 200,
            step: 5,
            value: args.settings.onDemandCapUsd,
            display: formatUsdCap(args.settings.onDemandCapUsd, true),
          })}
        </div>

        <div class="control-block">
          <h3>X Grok · 2-hour windows</h3>
          <p class="slide-hint">Three separate reply tanks on grok.x.com / the X app: Light (Fast), Medium (Think), and Heavy. They are not Cursor dollars, not Grok Bot week, and not grok.com SuperGrok. A paste such as 42 of 100 overrides these guesses.</p>
          <label class="select-field">X Grok plan
            <select id="x-plan" aria-describedby="x-plan-legend">
              <option value="free" ${args.settings.xPlan === "free" ? "selected" : ""}>${xPlanOptionLabel("free")}</option>
              <option value="premium" ${args.settings.xPlan === "premium" ? "selected" : ""}>${xPlanOptionLabel("premium")}</option>
              <option value="premiumPlus" ${args.settings.xPlan === "premiumPlus" ? "selected" : ""}>${xPlanOptionLabel("premiumPlus")}</option>
            </select>
          </label>
          <p id="x-plan-legend" class="x-plan-legend">
            ${xPlanLegend(args.settings.xPlan)}
          </p>
          ${sliderField({
            id: "x-light-cap",
            label: "Light (Fast)",
            hint: "Quick replies. How many in the current ~2-hour window.",
            min: 1,
            max: 200,
            step: 1,
            value: args.settings.xLightCap,
            display: formatRequestCap(args.settings.xLightCap),
          })}
          ${sliderField({
            id: "x-medium-cap",
            label: "Medium (Think)",
            hint: "Deeper reasoning. How many in the current ~2-hour window.",
            min: 1,
            max: 80,
            step: 1,
            value: args.settings.xMediumCap,
            display: formatRequestCap(args.settings.xMediumCap),
          })}
          ${sliderField({
            id: "x-heavy-cap",
            label: "Heavy",
            hint: "Longest / heaviest replies. How many in the current ~2-hour window.",
            min: 1,
            max: 40,
            step: 1,
            value: args.settings.xHeavyCap,
            display: formatRequestCap(args.settings.xHeavyCap),
          })}
        </div>

        <p class="out-of-v1">Not tanks: grok.com SuperGrok week, xAI prepaid ticks, X developer prepaid credits, Cursor tab completions. Cursor bills Bot week first, then promo, then extra pay.</p>
      </div>
    </section>`,
    )}

    ${tabPanel("review", tab, renderReviewPanel(args.review))}

    ${tabPanel(
      "log",
      tab,
      `<section class="history">
      <h2>Readings you saved</h2>
      ${n ? `<ol>${history}</ol>` : `<p>None yet. Load an example week or paste from Spending.</p>`}
    </section>`,
    )}

    <footer class="about-foot">
      <details>
        <summary>How this gauge works</summary>
        <p class="lede">Drop screenshots or files from the places below. Best Cursor sources: <strong>Grok Bot Settings → Usage</strong> and <a href="https://cursor.com/dashboard/spending" target="_blank" rel="noreferrer">cursor.com/dashboard/spending</a>. For Grok on X, paste Light / Medium / Heavy reply counts (they refill about every two hours) — those are not Cursor dollars. A finished <a href="https://cursor.com/dashboard/usage" target="_blank" rel="noreferrer">Cursor Usage spreadsheet</a> fills Cursor spend. <strong>grok.com</strong> SuperGrok is a different meter and is rejected. Enough dated readings with spend and % used (or replies used of a limit) roll into a <strong>hidden-limit guess</strong>, and we warn if a new batch says the limit moved. Readings stay in this browser. We never ask for passwords, login keys, or Cursor database files.</p>
        <p id="origin-banner" class="origin-banner" role="note"></p>
        <section class="surfaces">
          <h2>Where to look</h2>
          <p class="bay-note">Grok Bot chats, routines, computer use, and plugins share one weekly Cursor-account grant. They do not each export a usage file. Drop the meter screenshot, not the conversation.</p>
          <div class="surface-grid">
            ${SURFACE_GUIDE.map(
              (s) => `<article class="surface-card" data-fills="${s.fillsTank}">
                <h3>${s.title}</h3>
                <p><span>What it shows</span> ${s.history}</p>
                <p><span>What to add</span> ${s.drop}</p>
                <p><span>Which tank</span> ${s.tank}</p>
              </article>`,
            ).join("")}
          </div>
        </section>
      </details>
    </footer>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function formatUsdCap(n: number, hardStop = false): string {
  if (hardStop && n === 0) return "$0 extra pay off";
  return fmtUsd(n);
}

export function formatRequestCap(n: number): string {
  return `${Math.round(n)} replies`;
}

function xPlanName(plan: XGrokPlan): string {
  if (plan === "premiumPlus") return "Premium+";
  if (plan === "premium") return "Premium";
  return "Free";
}

export function xPlanOptionLabel(plan: XGrokPlan): string {
  const c = X_GROK_CAPS[plan];
  return `${xPlanName(plan)} — Light ${c.light} / Medium ${c.medium} / Heavy ${c.heavy} each 2 hours`;
}

function xPlanLegend(plan: XGrokPlan): string {
  const c = X_GROK_CAPS[plan];
  return `Guesses for ${xPlanName(plan)} until you paste real counts: <strong>Light (Fast) ${c.light}</strong> · <strong>Medium (Think) ${c.medium}</strong> · <strong>Heavy ${c.heavy}</strong> replies each ~2-hour window. Sliders below stay in sync until a paste overrides them.`;
}

function sliderFillPct(min: number, max: number, value: number): number {
  if (max <= min) return 0;
  return ((value - min) / (max - min)) * 100;
}

function sliderField(args: {
  id: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
}): string {
  const v = Math.min(args.max, Math.max(args.min, args.value));
  const fill = sliderFillPct(args.min, args.max, v).toFixed(1);
  return `<div class="slide-field">
    <div class="slide-head">
      <label for="${args.id}">${args.label}</label>
      <output id="${args.id}-out" for="${args.id}">${args.display}</output>
    </div>
    <p class="slide-hint">${args.hint}</p>
    <input id="${args.id}" type="range" min="${args.min}" max="${args.max}" step="${args.step}" value="${v}" style="--fill:${fill}%" />
  </div>`;
}

export function toDatetimeLocalValue(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string): string {
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
