import { SURFACE_GUIDE } from "./surfaces";
import { computeTankMetrics, otherModelsCapUsd, type TankMetrics } from "./metrics";
import type { AppSettings, LastImport, Reading, TankId } from "./types";
import { CURSOR_TANK_IDS, isXGrokTank, OTHER_MODELS_INCLUDED_USD, TANK_IDS, TANK_META, X_GROK_CAPS, X_GROK_TANK_IDS } from "./types";
import { sortedReadings } from "./storage";
import { historyPoints, polylineRemaining, timeWindow, type HistoryPoint } from "./chart";
import { estimateAllTanks, polylineValues, type TankEstimate } from "./estimate";

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
  if (n == null || Number.isNaN(n)) return "Need period start + %";
  return `${n.toFixed(2)}× calendar`;
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

function mixBlock(m: TankMetrics): string {
  if (!m.mixCents) return "";
  const rows = Object.entries(m.mixCents)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `<li><code>${k}</code> ${v}¢</li>`)
    .join("");
  return `<div class="mix"><h4>Mix (cents, not tokens)</h4><ul>${rows}</ul></div>`;
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
  return `<p class="token-note">Token totals are optional context only (routines re-send conversation; cache reads inflate tokens). Weekly % is cost-based. chart ${fmtTokens(t.total)} · in ${fmtTokens(t.input)} · out ${fmtTokens(t.output)} · cache ${fmtTokens(t.cacheRead)}</p>`;
}

function rangeBlock(m: TankMetrics): string {
  if (!m.emptyAt) {
    return `<div class="metric"><span>Range / empty-at</span><strong>Need 2+ timestamped readings</strong></div>`;
  }
  const vs =
    m.hoursEarlyVsReset == null
      ? ""
      : m.hoursEarlyVsReset > 0
        ? `${m.hoursEarlyVsReset.toFixed(1)} h before reset`
        : `${Math.abs(m.hoursEarlyVsReset).toFixed(1)} h after reset (holds)`;
  return `<div class="metric"><span>Range / empty-at</span><strong>${fmtWhen(m.emptyAt)}</strong><em>${vs}</em></div>`;
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
    <strong>Acceleration:</strong> newest interval is ${((w.fasterRatio - 1) * 100).toFixed(0)}% faster than the previous
    (${w.newestBurnPercentPerHour.toFixed(2)} %/h vs ${w.previousBurnPercentPerHour.toFixed(2)} %/h).
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
      <p class="spark-idle">Need 2+ timestamped readings for this tank.</p>
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
    return `<p class="spark-idle">Load two or more timestamped readings (example week works) to draw remaining over the period.</p>`;
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
      <h2>History instrument</h2>
      <p class="bay-note">Remaining over the captured period (F at the top, E at the bottom). Cursor traces and X Grok traces stay in separate groups — never one summed tank.</p>
      <h3 class="instrument-sub">Cursor</h3>
      ${renderOverlay(readings, settings, CURSOR_TANK_IDS, "Cursor remaining-fuel traces over the captured period")}
      <div class="instrument-grid">${cursorPanels}</div>
      <h3 class="instrument-sub">X Grok request windows</h3>
      ${renderOverlay(readings, settings, X_GROK_TANK_IDS, "X Grok Light Medium Heavy remaining over the captured period")}
      <div class="instrument-grid three">${xPanels}</div>
    </section>
  `;
}

function fmtEstimate(e: TankEstimate): string {
  if (e.estimate == null) return "—";
  if (e.unit === "requests") return `${Math.round(e.estimate)} requests / 2h`;
  return fmtUsd(e.estimate);
}

function renderEstimatePanel(e: TankEstimate): string {
  const meta = TANK_META[e.tank];
  const spark =
    e.samples.length >= 2
      ? `<svg class="spark" viewBox="0 0 200 52" role="img" aria-label="Estimated unpublished metric over time">
      ${chartWash(`est-${e.tank}`, 200, 52)}
      <path d="${polylineValues(e.samples, 200, 52)}" class="spark-line" fill="none"/>
    </svg>`
      : `<p class="spark-idle">Need 2+ samples for a trend line</p>`;
  const change =
    e.changedAt && e.previousEra != null && e.estimate != null
      ? `<p class="accel-warn" role="alert"><strong>Possible backend change:</strong> prior cluster ${e.unit === "usd" ? fmtUsd(e.previousEra) : `${Math.round(e.previousEra)} req`} → now ${fmtEstimate(e)} (${fmtWhen(new Date(e.changedAt))}).</p>`
      : "";
  const drift =
    e.vsFallback
      ? `<p class="token-note">Observed ${fmtEstimate(e)} vs fallback ${e.unit === "usd" ? fmtUsd(e.vsFallback.fallback) : `${e.vsFallback.fallback} req`} (${(e.vsFallback.deltaRatio * 100).toFixed(0)}% off). Keep sampling.</p>`
      : "";
  return `<article class="instrument-card estimate-card ${e.changedAt ? "changed" : ""} ${e.stable ? "stable" : ""}">
    <h3>${meta.title}</h3>
    <p class="clock">${e.sampleCount} observation${e.sampleCount === 1 ? "" : "s"} · ${e.stable ? "stable cluster" : "provisional"}</p>
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
      <h2>Unpublished estimate</h2>
      <p class="bay-note">This is the endgame: they will not publish Bot-week $, Cursor Models included $, or the real X Light/Medium/Heavy 2-hour caps. Each reading with spend+% (or used/cap) is a sample of <em>implied grant = spend ÷ (% used / 100)</em>, or the observed request cap. The rolling median of the current cluster is the working estimate. If a new cluster disagrees by more than 12%, the backend pool probably moved — keep dropping; do not call session APIs.</p>
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
              : `<em>remaining $ when spend/% known</em>`
        }</div>
        <div class="metric"><span>Used</span><strong>${
          m.requestCap != null && m.requestUsed != null
            ? `${m.requestUsed} / ${m.requestCap}`
            : fmtPct(m.percentUsed)
        }</strong>${m.spendUsd != null ? `<em>${fmtUsd(m.spendUsd)} spent</em>` : `<em>how much of this tank is gone</em>`}</div>
        <div class="metric"><span>Reset / period end</span><strong>${fmtWhen(m.periodEnd)}</strong></div>
        <div class="metric"><span>Pace</span><strong>${fmtPace(m.pace)}</strong><em>1.00× = on calendar budget</em></div>
        ${rangeBlock(m)}
        ${m.impliedGrantUsd != null ? `<div class="metric"><span>Implied grant</span><strong>${fmtUsd(m.impliedGrantUsd)}</strong><em>spend ÷ (% used / 100)</em></div>` : ""}
        ${m.spendUsd != null ? `<div class="metric"><span>Spend</span><strong>${fmtUsd(m.spendUsd)}</strong>${m.capUsd != null ? `<em>cap ${fmtUsd(m.capUsd)}</em>` : ""}</div>` : ""}
        ${m.hardStop ? `<div class="metric hard-stop"><span>On-demand</span><strong>$0 cap = hard stop</strong><em>No overflow billing after included pools.</em></div>` : ""}
      </dl>
      ${warnBlock(m, tank)}
      ${mixBlock(m)}
      ${tokenNote(m)}
      <p class="surfaces">${meta.surfaces} ${meta.grantNote}</p>
    </article>
  `;
}

export type { LastImport } from "./types";

export function renderApp(args: {
  readings: Reading[];
  settings: AppSettings;
  paste: string;
  capturedAtLocal: string;
  notice?: string;
  error?: string;
  busy?: string;
  lastImport?: LastImport;
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

  return `
    <header class="masthead">
      <div class="horizon" aria-hidden="true"></div>
      <p class="eyebrow">Cursor tanks · X Grok windows · never one bar</p>
      <h1>Grok Usage Gauge</h1>
      <p class="lede">Drop screenshots or files from the surfaces below. Prefer <strong>Grok Bot Settings → Usage</strong> and <a href="https://cursor.com/dashboard/spending" target="_blank" rel="noreferrer">cursor.com/dashboard/spending</a> for Cursor tanks. Paste Grok-on-X Light / Medium / Heavy request counts (often a 2-hour window) into the X tanks — those are not Cursor $. A finished <a href="https://cursor.com/dashboard/usage" target="_blank" rel="noreferrer">usage-events CSV</a> fills Cursor spend. <strong>grok.com</strong> SuperGrok Usage is rejected. Enough timestamped readings (spend+% or used/cap) roll into an <strong>unpublished estimate</strong> — implied grant $ or observed 2h request caps — and warn if a new cluster says the backend pool moved. Readings stay in this browser. No API keys, Bearer tokens, or <code>state.vscdb</code>.</p>
      <p id="origin-banner" class="origin-banner" role="note"></p>
      ${
        args.lastImport
          ? `<div class="ingest-banner" role="status">
        <strong>Your last import ran.</strong>
        ${escapeHtml(args.lastImport.names)} · ${args.lastImport.bytes.toLocaleString()} bytes.
        ${escapeHtml(args.lastImport.summary)}
        Empty tanks below still mean that file had no % or $ for that pool (defaults were not reset except where a reading was saved).
      </div>`
          : args.readings.length
            ? `<div class="ingest-banner" role="status"><strong>Stored readings are showing</strong> (${args.readings.length}). Scroll to Timestamped readings to see CSV vs screenshot. Empty tanks were not overwritten.</div>`
            : `<div class="ingest-banner idle">No files ingested yet. Tanks that say “—” are still empty defaults.</div>`
      }
    </header>

    <section class="bay">
      <h2 class="bay-title">Cursor fuel tanks</h2>
      <p class="bay-note">Keep these separate. If Grok Bot launches a Cursor cloud agent, that run bills Cursor Models / Other Models / maybe on-demand as well as the Bot week — show both, do not merge. Plans do not stack: Cursor + SuperGrok + X Premium+ for Grok Bot = one Bot grant (the larger) on the Cursor account.</p>
      <div class="tank-grid">${cursorCards}</div>
    </section>

    <section class="bay">
      <h2 class="bay-title">X Grok request windows</h2>
      <p class="bay-note">Grok on x.com / the X app. Light, Medium, and Heavy are three request grants on a rolling ~2 hour clock. They are not Cursor Models, not Cursor Grok Bot week, and not grok.com SuperGrok weekly %. X developer API usage credits stay out of these tanks. Fallback caps are typical published-range numbers for the X plan you pick; a paste of 42/50 always wins.</p>
      <div class="tank-grid three">${xCards}</div>
    </section>

    ${renderHistoryInstrument(args.readings, args.settings)}
    ${renderEstimateInstrument(args.readings, args.settings)}

    <section class="console">
      <div class="panel">
        <h2>Save a reading</h2>
        <label>Captured at
          <input id="captured-at" type="datetime-local" value="${args.capturedAtLocal}" />
        </label>
        <div id="drop-zone" class="drop-zone">
          <strong>Drop screenshots or usage files</strong>
          <p>png / jpg / webp, copied <code>/usage</code> text, Settings → Usage, Spending, or a finished usage-events <code>.csv</code>. Empty Chrome <code>.crdownload</code> files are rejected. Paste an image with Ctrl+V.</p>
          <input id="file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif,.csv,text/csv,.txt,.md,.json,.log" multiple />
          <button type="button" id="choose-files">Read chosen files</button>
          <p class="chosen">${args.lastImport ? escapeHtml(args.lastImport.names) : "No file chosen yet"}</p>
        </div>
        ${args.busy ? `<p class="notice" role="status">${escapeHtml(args.busy)}</p>` : ""}
        ${
          args.lastImport
            ? `<div id="ingest-output" class="ingest-output" role="status">
          <h3>Last file output</h3>
          <p><strong>${escapeHtml(args.lastImport.names)}</strong> · ${args.lastImport.bytes.toLocaleString()} bytes</p>
          <p>${escapeHtml(args.lastImport.summary)}</p>
          ${
            args.lastImport.extracted
              ? `<pre class="extract">${escapeHtml(args.lastImport.extracted.slice(0, 4000))}</pre>`
              : `<p class="muted">No text extracted from this file.</p>`
          }
        </div>`
            : ""
        }
        <label>Paste (JSON, dashboard text, CLI /usage, or OCR text)
          <textarea id="paste" rows="14" placeholder="Drop a screenshot or paste Weekly usage 61%…">${escapeHtml(args.paste)}</textarea>
        </label>
        <div class="row">
          <button type="button" id="save-paste">Save pasted reading</button>
          <button type="button" id="fill-sample" class="ghost">Fill sample paste</button>
        </div>
        ${args.error ? `<p class="error" role="alert">${escapeHtml(args.error)}</p>` : ""}
        ${args.notice ? `<p class="notice">${escapeHtml(args.notice)}</p>` : ""}
      </div>
      <div class="panel controls-panel">
        <h2>Local controls</h2>
        <p class="control-status">${n} stored reading${n === 1 ? "" : "s"}. Empty-at needs 2. Acceleration needs 3. Unpublished estimate needs spend+% or used/cap.</p>

        <div class="control-block">
          <h3>Sample data</h3>
          <p class="slide-hint">Load canned readings, or keep a private JSON copy on this PC.</p>
          <div class="row">
            <button type="button" id="load-example">Load example week</button>
            <button type="button" id="load-accel">Load accelerating week</button>
            <button type="button" id="load-sample-csv">Load bundled usage-events CSV</button>
          </div>
          <div class="row">
            <button type="button" id="export-json" class="ghost">Download history JSON</button>
            <button type="button" id="restore-json" class="ghost">Restore history JSON</button>
            <input id="restore-json-input" type="file" accept="application/json,.json" hidden />
            <button type="button" id="clear-data" class="danger">Clear local data</button>
          </div>
        </div>

        <div class="control-block">
          <h3>Cursor month</h3>
          <p class="slide-hint">Other Models included $ follows the plan. On-demand is a monthly USD cap; $0 is a hard stop.</p>
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
            hint: "Paid overflow after included pools. Slide to $0 for a hard stop.",
            min: 0,
            max: 200,
            step: 5,
            value: args.settings.onDemandCapUsd,
            display: formatUsdCap(args.settings.onDemandCapUsd, true),
          })}
        </div>

        <div class="control-block">
          <h3>X Grok · 2-hour windows</h3>
          <p class="slide-hint">Fallback request caps until a paste of 42/100 overrides them. Separate from Cursor tanks.</p>
          <label class="select-field">X plan
            <select id="x-plan">
              <option value="free" ${args.settings.xPlan === "free" ? "selected" : ""}>Free · L ${X_GROK_CAPS.free.light} · M ${X_GROK_CAPS.free.medium} · H ${X_GROK_CAPS.free.heavy}</option>
              <option value="premium" ${args.settings.xPlan === "premium" ? "selected" : ""}>Premium · L ${X_GROK_CAPS.premium.light} · M ${X_GROK_CAPS.premium.medium} · H ${X_GROK_CAPS.premium.heavy}</option>
              <option value="premiumPlus" ${args.settings.xPlan === "premiumPlus" ? "selected" : ""}>Premium+ · L ${X_GROK_CAPS.premiumPlus.light} · M ${X_GROK_CAPS.premiumPlus.medium} · H ${X_GROK_CAPS.premiumPlus.heavy}</option>
            </select>
          </label>
          ${sliderField({
            id: "x-light-cap",
            label: "Light / Fast",
            hint: "Requests per ~2 hours",
            min: 1,
            max: 200,
            step: 1,
            value: args.settings.xLightCap,
            display: formatRequestCap(args.settings.xLightCap),
          })}
          ${sliderField({
            id: "x-medium-cap",
            label: "Medium / Think",
            hint: "Requests per ~2 hours",
            min: 1,
            max: 80,
            step: 1,
            value: args.settings.xMediumCap,
            display: formatRequestCap(args.settings.xMediumCap),
          })}
          ${sliderField({
            id: "x-heavy-cap",
            label: "Heavy",
            hint: "Requests per ~2 hours",
            min: 1,
            max: 40,
            step: 1,
            value: args.settings.xHeavyCap,
            display: formatRequestCap(args.settings.xHeavyCap),
          })}
        </div>

        <p class="out-of-v1">Not tanks: grok.com SuperGrok week, xAI prepaid ticks, X developer <code>GET /2/usage/credits</code>, Cursor tab completions. Cursor charge order: Bot week → promo → on-demand.</p>
      </div>
    </section>

    <section class="surfaces">
      <h2>How each surface reports history</h2>
      <p class="bay-note">Grok Bot chats, routines, CUA, and MCP share one weekly Cursor-account grant. They do not each export a usage file. Drop the meter screenshot, not the conversation.</p>
      <div class="surface-grid">
        ${SURFACE_GUIDE.map(
          (s) => `<article class="surface-card" data-fills="${s.fillsTank}">
            <h3>${s.title}</h3>
            <p><span>History</span> ${s.history}</p>
            <p><span>Drop</span> ${s.drop}</p>
            <p><span>Tank</span> ${s.tank}</p>
          </article>`,
        ).join("")}
      </div>
    </section>

    <section class="history">
      <h2>Timestamped readings</h2>
      ${n ? `<ol>${history}</ol>` : `<p>None yet. Load an example week or paste from Spending.</p>`}
    </section>
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
  if (hardStop && n === 0) return "$0 hard stop";
  return fmtUsd(n);
}

export function formatRequestCap(n: number): string {
  return `${Math.round(n)} req`;
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
