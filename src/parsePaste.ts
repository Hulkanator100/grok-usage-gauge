import type { MixCents, Reading, TankId, TankSnapshot, TokenTotals } from "./types";
import { TANK_IDS } from "./types";
import { looksLikeUsageEventsCsv, parseUsageEventsCsv } from "./parseUsageCsv";
import { GROK_COM_REJECT_NOTE, looksLikeGrokComUsage, parseUsageText, readingFromParsed } from "./parseUsageText";

const TANK_ALIASES: Array<{ id: TankId; patterns: RegExp[] }> = [
  {
    id: "grokBotWeekly",
    patterns: [
      /grok\s*bot/i,
      /sand\s*usage/i,
      /weekly\s*(included|usage|grant)/i,
      /usagePercent/i,
    ],
  },
  {
    id: "cursorModelsMonthly",
    patterns: [/cursor\s*models/i, /cursorModel/i, /auto\s*\+?\s*composer/i],
  },
  {
    id: "otherModelsMonthly",
    patterns: [/other\s*models/i, /otherModel/i, /\bapi\s*usage\b/i],
  },
  {
    id: "onDemandMonthly",
    patterns: [/on[-\s]?demand/i, /monthly\s*limit/i, /spend(?:ing)?\s*cap/i],
  },
];

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.replace(/[$,]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function asIso(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return undefined;
}

function centsToUsd(cents: number | undefined): number | undefined {
  if (cents == null) return undefined;
  return cents / 100;
}

function pickSnapshot(raw: Record<string, unknown>): TankSnapshot {
  const percentUsed =
    asNumber(raw.percentUsed) ??
    asNumber(raw.usagePercent) ??
    asNumber(raw.percent) ??
    asNumber(raw.pct);
  const spendUsd =
    asNumber(raw.spendUsd) ??
    asNumber(raw.spend) ??
    asNumber(raw.costUsd) ??
    centsToUsd(asNumber(raw.totalCents) ?? asNumber(raw.cents) ?? asNumber(raw.spendCents));
  const capUsd =
    asNumber(raw.capUsd) ??
    asNumber(raw.limitUsd) ??
    asNumber(raw.monthlyLimit) ??
    asNumber(raw.onDemandLimitUsd);
  const periodEnd =
    asIso(raw.periodEnd) ??
    asIso(raw.resetAt) ??
    asIso(raw.nextResetTimestampUtc) ??
    asIso(raw.billingCycleEnd) ??
    asIso(raw.resets);
  const periodStart = asIso(raw.periodStart) ?? asIso(raw.billingCycleStart);
  const mixRaw = raw.mixCents;
  let mixCents: MixCents | undefined;
  if (mixRaw && typeof mixRaw === "object") {
    mixCents = {};
    for (const [k, v] of Object.entries(mixRaw as Record<string, unknown>)) {
      const n = asNumber(v);
      if (n != null) mixCents[k] = n;
    }
  }
  const tokens = raw.tokenTotals;
  let tokenTotals: TokenTotals | undefined;
  if (tokens && typeof tokens === "object") {
    const t = tokens as Record<string, unknown>;
    tokenTotals = {
      input: asNumber(t.input),
      output: asNumber(t.output),
      cacheRead: asNumber(t.cacheRead) ?? asNumber(t.cache),
      total: asNumber(t.total),
    };
  }
  return { percentUsed, spendUsd, capUsd, periodStart, periodEnd, mixCents, tokenTotals };
}

function hasAny(snap: TankSnapshot): boolean {
  return (
    snap.percentUsed != null ||
    snap.spendUsd != null ||
    snap.capUsd != null ||
    snap.periodEnd != null ||
    snap.mixCents != null ||
    snap.tokenTotals != null
  );
}

function parseJsonReading(obj: Record<string, unknown>, capturedAtFallback: string): Reading {
  const capturedAt = asIso(obj.capturedAt) ?? capturedAtFallback;
  const tanks: Partial<Record<TankId, TankSnapshot>> = {};

  const nestedMap: Array<[TankId, string[]]> = [
    ["grokBotWeekly", ["grokBotWeekly", "grokBot", "sandUsage", "weekly"]],
    ["cursorModelsMonthly", ["cursorModelsMonthly", "cursorModels", "autoUsage"]],
    ["otherModelsMonthly", ["otherModelsMonthly", "otherModels", "apiUsage"]],
    ["onDemandMonthly", ["onDemandMonthly", "onDemand", "spendLimit"]],
  ];

  for (const [id, keys] of nestedMap) {
    for (const key of keys) {
      const node = obj[key];
      if (node && typeof node === "object") {
        const snap = pickSnapshot(node as Record<string, unknown>);
        if (hasAny(snap)) tanks[id] = snap;
      }
    }
  }

  if (!tanks.grokBotWeekly && (obj.usagePercent != null || obj.nextResetTimestampUtc != null)) {
    tanks.grokBotWeekly = pickSnapshot(obj);
  }
  if (!tanks.cursorModelsMonthly && obj.cursorModelPercentUsed != null) {
    tanks.cursorModelsMonthly = pickSnapshot({
      percentUsed: obj.cursorModelPercentUsed,
      periodStart: obj.billingCycleStart,
      periodEnd: obj.billingCycleEnd,
      totalCents: obj.cursorModelTotalCents,
    });
  }
  if (!tanks.otherModelsMonthly && obj.otherModelPercentUsed != null) {
    tanks.otherModelsMonthly = pickSnapshot({
      percentUsed: obj.otherModelPercentUsed,
      periodStart: obj.billingCycleStart,
      periodEnd: obj.billingCycleEnd,
      totalCents: obj.otherModelTotalCents,
    });
  }

  return {
    id: newId(),
    capturedAt,
    tanks,
    source: "paste",
    rawPaste: JSON.stringify(obj, null, 2),
  };
}

function detectTankHeader(line: string): TankId | undefined {
  for (const alias of TANK_ALIASES) {
    if (alias.patterns.some((re) => re.test(line))) return alias.id;
  }
  return undefined;
}

function parseMoney(text: string): number | undefined {
  const dollar = text.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (dollar) return Number(dollar[1].replace(/,/g, ""));
  const cents = text.match(/([\d,]+(?:\.\d+)?)\s*cents\b/i);
  if (cents) return Number(cents[1].replace(/,/g, "")) / 100;
  return undefined;
}

function parsePercent(text: string): number | undefined {
  const m = text.match(/([\d.]+)\s*%/);
  return m ? Number(m[1]) : undefined;
}

function parseReset(text: string): string | undefined {
  const m = text.match(
    /(?:resets?|reset at|period end|billing cycle end|cycle ends?)\s*[:-]?\s*(.+)$/i,
  );
  if (!m) return undefined;
  const iso = asIso(m[1].trim());
  return iso;
}

function parsePeriodStart(text: string): string | undefined {
  const m = text.match(/(?:period start|billing cycle start|cycle starts?)\s*[:-]?\s*(.+)$/i);
  if (!m) return undefined;
  return asIso(m[1].trim());
}

function parseMixCents(text: string): MixCents | undefined {
  const mix: MixCents = {};
  const re = /(grok-bot-(?:default|automation|cua))\s*[:=]?\s*(\d+(?:\.\d+)?)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    mix[match[1]] = Number(match[2]);
  }
  return Object.keys(mix).length ? mix : undefined;
}

function parseTextPaste(text: string, capturedAtFallback: string): Reading {
  const lines = text.split(/\r?\n/);
  const tanks: Partial<Record<TankId, TankSnapshot>> = {};
  let current: TankId | undefined;
  let capturedAt = capturedAtFallback;

  const capturedLine = text.match(/captured(?:\s*at)?\s*[:-]?\s*(.+)/i);
  if (capturedLine) {
    const iso = asIso(capturedLine[1].trim().split("\n")[0]);
    if (iso) capturedAt = iso;
  }

  const applyLine = (id: TankId, line: string) => {
    const prev = tanks[id] ?? {};
    const percentUsed = parsePercent(line) ?? prev.percentUsed;
    const ofMatch = line.match(
      /\$\s*([\d,]+(?:\.\d+)?)\s*(?:of|\/)\s*\$\s*([\d,]+(?:\.\d+)?)/i,
    );
    let spendUsd = prev.spendUsd;
    let capUsd = prev.capUsd;
    if (ofMatch) {
      spendUsd = Number(ofMatch[1].replace(/,/g, ""));
      capUsd = Number(ofMatch[2].replace(/,/g, ""));
    } else if (/spend|cost|used \$/i.test(line) || /cents/i.test(line)) {
      spendUsd = parseMoney(line) ?? spendUsd;
    }
    if (/\bcap\b|limit|included \$/i.test(line) && !ofMatch) {
      capUsd = parseMoney(line) ?? capUsd;
    }
    const periodEnd = parseReset(line) ?? prev.periodEnd;
    const periodStart = parsePeriodStart(line) ?? prev.periodStart;
    const mixCents = parseMixCents(line) ?? prev.mixCents;
    tanks[id] = { ...prev, percentUsed, spendUsd, capUsd, periodEnd, periodStart, mixCents };
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const header = detectTankHeader(line);
    if (header) {
      current = header;
      applyLine(header, line);
      continue;
    }
    if (current) applyLine(current, line);
  }

  return {
    id: newId(),
    capturedAt,
    tanks,
    source: "paste",
    rawPaste: text,
  };
}

export function parsePaste(input: string, capturedAt = new Date().toISOString()): Reading[] {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Paste is empty.");

  try {
    const json = JSON.parse(trimmed) as unknown;
    if (Array.isArray(json)) {
      return json.map((row) => {
        if (!row || typeof row !== "object") throw new Error("JSON array must contain reading objects.");
        return parseJsonReading(row as Record<string, unknown>, capturedAt);
      });
    }
    if (json && typeof json === "object") {
      const obj = json as Record<string, unknown>;
      if (Array.isArray(obj.readings)) {
        return (obj.readings as unknown[]).map((row) => {
          if (!row || typeof row !== "object") throw new Error("readings[] must contain objects.");
          return parseJsonReading(row as Record<string, unknown>, capturedAt);
        });
      }
      return [parseJsonReading(obj, capturedAt)];
    }
  } catch (err) {
    if (err instanceof SyntaxError) {
      // fall through to CSV / text
    } else {
      throw err;
    }
  }

  if (looksLikeUsageEventsCsv(trimmed)) {
    return parseUsageEventsCsv(trimmed, { source: "paste" });
  }

  if (looksLikeGrokComUsage(trimmed)) {
    throw new Error(GROK_COM_REJECT_NOTE);
  }

  const fromScreen = parseUsageText(trimmed, capturedAt);
  if (fromScreen.fillsTank) {
    return [readingFromParsed(fromScreen, capturedAt, trimmed, "paste")];
  }

  const reading = parseTextPaste(trimmed, capturedAt);
  if (!TANK_IDS.some((id) => reading.tanks[id] && hasAny(reading.tanks[id]!))) {
    throw new Error(
      fromScreen.notes[0] ??
        "Could not find tank figures. Drop Spending (% used) or Grok Bot Settings → Usage, Export CSV from dashboard Usage, or paste % used, reset, and optional $. The Usage token chart is not tank %.",
    );
  }
  return [reading];
}

export function sampleDashboardPaste(): string {
  return `Captured at 2026-09-16T18:40:00Z

Grok Bot weekly included
61.4% used
Resets 2026-09-17T00:00:00Z
Period start 2026-09-10T00:00:00Z
Spend $4.30
Mix cents: grok-bot-default 210 grok-bot-automation 145 grok-bot-cua 75

Cursor Models
28% used
Billing cycle start 2026-09-01T00:00:00Z
Billing cycle end 2026-10-01T00:00:00Z
Spend $6.10

Other Models
9% used
Spend $1.80
Included $20

On-demand
$0 of $20
Billing cycle end 2026-10-01T00:00:00Z`;
}
