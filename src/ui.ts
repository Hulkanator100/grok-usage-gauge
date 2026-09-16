import { SURFACE_GUIDE } from "./surfaces";
import { computeTankMetrics, otherModelsCapUsd, type TankMetrics } from "./metrics";
import type { AppSettings, Reading, TankId } from "./types";
import { TANK_IDS, TANK_META } from "./types";
import { sortedReadings } from "./storage";

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

function tokenNote(m: TankMetrics): string {
  if (!m.tokenTotals) return "";
  const t = m.tokenTotals;
  return `<p class="token-note">Token totals are optional context only (routines re-send conversation; cache reads inflate tokens). Weekly % is cost-based. in ${t.input ?? "—"} · out ${t.output ?? "—"} · cache ${t.cacheRead ?? "—"}</p>`;
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

export function renderTankCard(tank: TankId, m: TankMetrics): string {
  const meta = TANK_META[tank];
  const used = m.percentUsed ?? 0;
  const fill = Math.max(0, Math.min(100, used));
  const remainingVisual = Math.max(0, 100 - fill);
  return `
    <article class="tank-card ${fillClass(m.percentUsed)}" data-tank="${tank}">
      <header>
        <h2>${meta.title}</h2>
        <p class="clock">${meta.clock}</p>
      </header>
      <div class="tank-visual" aria-hidden="true">
        <div class="tank-cylinder">
          <div class="liquid" style="height:${fill}%"></div>
          <div class="air" style="height:${remainingVisual}%"></div>
          <div class="marks"></div>
        </div>
        <div class="used-readout">${fmtPct(m.percentUsed)} used</div>
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

export interface LastImport {
  names: string;
  bytes: number;
  extracted: string;
  summary: string;
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
}): string {
  const now = new Date();
  const cards = TANK_IDS.map((id) => renderTankCard(id, metricsForTank(args.readings, id, args.settings, now))).join(
    "",
  );
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
      <p class="eyebrow">Local · four tanks · never one bar</p>
      <h1>Grok Usage Gauge</h1>
      <p class="lede">Drop screenshots or files from the surfaces below. Prefer <strong>Grok Bot Settings → Usage</strong> and <a href="https://cursor.com/dashboard/spending" target="_blank" rel="noreferrer">cursor.com/dashboard/spending</a>. A finished <a href="https://cursor.com/dashboard/usage" target="_blank" rel="noreferrer">usage-events CSV</a> fills spend (mix cents for grok-bot-*); Bot/Cursor Models stay spend-only unless % is known; Other Models / on-demand % use plan/cap. Chrome <code>.crdownload</code> leftovers are empty — re-export. Readings stay in this browser. No API keys, Bearer tokens, or <code>state.vscdb</code>.</p>
    </header>

    <section class="bay">
      <h2 class="bay-title">Fuel tanks</h2>
      <p class="bay-note">Keep these separate. If Grok Bot launches a Cursor cloud agent, that run bills Cursor Models / Other Models / maybe on-demand as well as the Bot week — show both, do not merge. Plans do not stack: Cursor + SuperGrok + X Premium+ for Grok Bot = one Bot grant (the larger) on the Cursor account.</p>
      <div class="tank-grid">${cards}</div>
    </section>

    <section class="console">
      <div class="panel">
        <h2>Save a reading</h2>
        <label>Captured at
          <input id="captured-at" type="datetime-local" value="${args.capturedAtLocal}" />
        </label>
        <div id="drop-zone" class="drop-zone">
          <strong>Drop screenshots or usage files</strong>
          <p>png / jpg / webp, copied <code>/usage</code> text, Settings → Usage, Spending, or a finished usage-events <code>.csv</code>. Empty Chrome <code>.crdownload</code> files are rejected. Paste an image with Ctrl+V.</p>
          <input id="file-input" type="file" accept=".csv,.crdownload,text/csv,image/*,.txt,.md,.json,.log,text/plain" multiple />
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
