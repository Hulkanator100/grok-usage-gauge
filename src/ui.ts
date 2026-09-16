import { SURFACE_GUIDE } from "./surfaces";
import { computeTankMetrics, otherModelsCapUsd, type TankMetrics } from "./metrics";
import type { AppSettings, LastImport, Reading, TankId } from "./types";
import { TANK_IDS, TANK_META } from "./types";
import { sortedReadings } from "./storage";
import { historyPoints, polylineRemaining, timeWindow, type HistoryPoint } from "./chart";

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
  const kind = tank === "grokBotWeekly" ? "week" : tank === "onDemandMonthly" ? "cap" : "month";
  const fallbackCapUsd =
    tank === "otherModelsMonthly"
      ? otherModelsCapUsd(settings.plan, settings.customOtherModelsUsd)
      : tank === "onDemandMonthly"
        ? settings.onDemandCapUsd
        : undefined;
  return computeTankMetrics({
    kind,
    snapshots: snapshotsFor(readings, tank),
    now,
    fallbackCapUsd,
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
  const label = tank === "grokBotWeekly" ? "empty before weekly reset" : "empty before period end";
  return `<div class="accel-warn" role="alert">
    <strong>Acceleration:</strong> newest interval is ${((w.fasterRatio - 1) * 100).toFixed(0)}% faster than the previous
    (${w.newestBurnPercentPerHour.toFixed(2)} %/h vs ${w.previousBurnPercentPerHour.toFixed(2)} %/h).
    You will <em>${label}</em> at ${fmtWhen(w.emptyAt)}
    (${w.hoursEarly.toFixed(1)} hours early vs ${fmtWhen(w.periodEnd)}).
  </div>`;
}

export function fuelNeedleDeg(percentUsed: number | undefined): number {
  const remaining = percentUsed == null ? 50 : Math.max(0, Math.min(100, 100 - percentUsed));
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

function renderSpark(points: HistoryPoint[]): string {
  if (points.length < 2) {
    return `<p class="spark-idle">History graph needs 2+ readings</p>`;
  }
  const w = 200;
  const h = 52;
  const d = polylineRemaining(points, w, h);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="Remaining fuel over time">
    <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" class="spark-face"/>
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
      <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" class="spark-face"/>
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
};

function renderOverlay(readings: Reading[], settings: AppSettings): string {
  const series = TANK_IDS.map((id) => historyPoints(readings, id, settings));
  const win = timeWindow(series);
  const ready = series.filter((p) => p.length >= 2).length;
  if (!win || ready === 0) {
    return `<p class="spark-idle">Load two or more timestamped readings (example week works) to draw remaining fuel over the period.</p>`;
  }
  const w = 960;
  const h = 220;
  const traces = TANK_IDS.map((id, i) => {
    const points = series[i];
    if (points.length < 2) return "";
    const d = polylineRemaining(points, w, h, 36, 22, win);
    const dash = TRACE_DASH[id] ? ` stroke-dasharray="${TRACE_DASH[id]}"` : "";
    return `<path d="${d}" class="spark-line overlay-line overlay-${i}" fill="none"${dash}/>`;
  }).join("");
  const legend = TANK_IDS.map((id, i) => {
    const dash = TRACE_DASH[id] ? ` stroke-dasharray="${TRACE_DASH[id]}"` : "";
    return `<li><svg class="legend-swatch" viewBox="0 0 36 8" aria-hidden="true"><line x1="1" y1="4" x2="35" y2="4" class="spark-line overlay-${i}"${dash}/></svg>${TANK_META[id].title}</li>`;
  }).join("");
  return `
    <div class="overlay-wrap">
      <svg class="trace overlay" viewBox="0 0 ${w} ${h}" role="img" aria-label="Four remaining-fuel traces over the captured period">
        <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" class="spark-face"/>
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
  const panels = TANK_IDS.map((id) => renderTankHistoryPanel(id, historyPoints(readings, id, settings))).join("");
  return `
    <section class="instrument">
      <h2>History instrument</h2>
      <p class="bay-note">Remaining fuel over the captured period (F at the top, E at the bottom). Four traces stay separate — this is not one summed tank. Amber, starlight, hot amber, and dim traces plus dash patterns keep the pools distinct.</p>
      ${renderOverlay(readings, settings)}
      <div class="instrument-grid">${panels}</div>
    </section>
  `;
}

export function renderTankCard(tank: TankId, m: TankMetrics, points: HistoryPoint[]): string {
  const meta = TANK_META[tank];
  const known = m.percentUsed != null;
  const needle = fuelNeedleDeg(m.percentUsed);
  return `
    <article class="tank-card ${fillClass(m.percentUsed)}" data-tank="${tank}">
      <header>
        <h2>${meta.title}</h2>
        <p class="clock">${meta.clock}</p>
      </header>
      <div class="tank-visual">
        <div class="fuel-gauge ${known ? "" : "unknown-needle"}" style="--needle:${needle}deg">
          <svg viewBox="0 0 200 200" role="img" aria-label="${meta.title} ${fmtPct(m.percentUsed)} used">
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
              <filter id="glow-${tank}" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="1.6" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            <circle class="bezel" cx="100" cy="100" r="96" fill="url(#bezel-${tank})"/>
            <circle class="face" cx="100" cy="100" r="86" fill="#050505"/>
            <circle class="rim-glow" cx="100" cy="100" r="82" fill="none" stroke="#e8a017" stroke-width="2.2" opacity="0.9"/>
            <path class="empty-zone" d="M32,100 A68,68 0 0 1 44,56" fill="none"/>
            <g class="ticks" stroke="#f4f4f4" stroke-linecap="round">${fuelTicks()}</g>
            <text class="mark-e" x="38" y="118">E</text>
            <text class="mark-f" x="162" y="118">F</text>
            <text class="mark-half" x="100" y="52">½</text>
            <circle class="glass" cx="100" cy="100" r="86" fill="url(#glass-${tank})"/>
            <text class="fuel-word" x="100" y="168">FUEL</text>
            <g class="needle-g" transform="rotate(${needle.toFixed(1)} 100 100)">
              <polygon class="needle-shadow" points="100,26 107,106 100,118 93,106"/>
              <polygon class="needle" fill="#e10600" stroke="#ff4d4d" points="100,24 106.5,104 100,114 93.5,104"/>
              <circle class="hub" cx="100" cy="100" r="11"/>
              <circle class="hub-eye" fill="#e10600" cx="100" cy="100" r="4"/>
            </g>
          </svg>
        </div>
        <div class="used-readout">${fmtPct(m.percentUsed)} used</div>
        ${renderSpark(points)}
      </div>
      <dl class="metrics">
        <div class="metric"><span>Remaining</span><strong>${fmtPct(m.remainingPct)}</strong>${
          m.remainingUsd != null ? `<em>${fmtUsd(m.remainingUsd)} left</em>` : `<em>remaining $ when spend/% known</em>`
        }</div>
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
  const cards = TANK_IDS.map((id) =>
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
      <p class="eyebrow">Four tanks · never one bar</p>
      <h1>Grok Usage Gauge</h1>
      <p class="lede">Drop screenshots or files from the surfaces below. Prefer <strong>Grok Bot Settings → Usage</strong> and <a href="https://cursor.com/dashboard/spending" target="_blank" rel="noreferrer">cursor.com/dashboard/spending</a>. A finished <a href="https://cursor.com/dashboard/usage" target="_blank" rel="noreferrer">usage-events CSV</a> fills spend (mix cents for grok-bot-*); Bot/Cursor Models stay spend-only unless % is known; Other Models / on-demand % use plan/cap. Chrome <code>.crdownload</code> leftovers are empty — re-export. Readings stay in this browser. No API keys, Bearer tokens, or <code>state.vscdb</code>.</p>
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
      <h2 class="bay-title">Fuel tanks</h2>
      <p class="bay-note">Keep these separate. If Grok Bot launches a Cursor cloud agent, that run bills Cursor Models / Other Models / maybe on-demand as well as the Bot week — show both, do not merge. Plans do not stack: Cursor + SuperGrok + X Premium+ for Grok Bot = one Bot grant (the larger) on the Cursor account.</p>
      <div class="tank-grid">${cards}</div>
    </section>

    ${renderHistoryInstrument(args.readings, args.settings)}

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
      <div class="panel">
        <h2>Local controls</h2>
        <p>${n} stored reading${n === 1 ? "" : "s"}. Burn / run-out needs 2+. Acceleration needs 3.</p>
        <div class="row">
          <button type="button" id="load-example">Load example week</button>
          <button type="button" id="load-accel">Load accelerating week</button>
          <button type="button" id="load-sample-csv">Load bundled usage-events CSV</button>
          <button type="button" id="export-json" class="ghost">Download history JSON</button>
          <button type="button" id="restore-json" class="ghost">Restore history JSON</button>
          <input id="restore-json-input" type="file" accept="application/json,.json" hidden />
          <button type="button" id="clear-data" class="danger">Clear local data</button>
        </div>
        <label>Cursor plan (Other Models included $)
          <select id="plan">
            <option value="pro" ${args.settings.plan === "pro" ? "selected" : ""}>Pro ~$20</option>
            <option value="proPlus" ${args.settings.plan === "proPlus" ? "selected" : ""}>Pro+ ~$70</option>
            <option value="ultra" ${args.settings.plan === "ultra" ? "selected" : ""}>Ultra ~$400</option>
            <option value="custom" ${args.settings.plan === "custom" ? "selected" : ""}>Custom</option>
          </select>
        </label>
        <label>Custom Other Models included USD
          <input id="custom-other" type="number" min="0" step="1" value="${args.settings.customOtherModelsUsd}" />
        </label>
        <label>On-demand monthly cap USD ($0 = hard stop)
          <input id="ondemand-cap" type="number" min="0" step="1" value="${args.settings.onDemandCapUsd}" />
        </label>
        <ul class="out-of-v1">
          <li>Out of v1 (no tanks): grok.com SuperGrok week, xAI API prepaid ticks, X developer API <code>GET /2/usage/credits</code>.</li>
          <li>Do not lead with message counts (retired). Tab completions are not a tank.</li>
          <li>Charge order: Bot week → promo credits → paid on-demand.</li>
        </ul>
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

export function toDatetimeLocalValue(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string): string {
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
