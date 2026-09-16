import type { MixCents, Reading, TankId, TankSnapshot, TokenTotals } from "./types";
import { TANK_IDS } from "./types";

export const UNFINISHED_CHROME_DOWNLOAD_MESSAGE =
  "This file is an unfinished Chrome download (.crdownload) with no usage-event rows (0 bytes). Wait for the download to finish, or re-export a complete CSV from https://cursor.com/dashboard/usage.";

export const USAGE_CSV_HEADERS_MESSAGE =
  "Need a Cursor usage-events CSV with headers Date, Kind, Model, and Cost (matched by name). Export from https://cursor.com/dashboard/usage.";

const ZERO_COST_LABELS = /^(included|free|-|n\/a|na|—|–)$/i;

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeHeader(raw: string): string {
  return raw.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function looksLikeUsageEventsCsv(text: string): boolean {
  const first = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .find((line) => line.trim());
  if (!first) return false;
  const lower = first.toLowerCase();
  return /\bdate\b/.test(lower) && /\bkind\b/.test(lower) && /\bmodel\b/.test(lower) && /\bcost\b/.test(lower);
}

export function parseCsvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (c === "\r") continue;
    field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function headerIndex(headers: string[], ...aliases: string[]): number {
  return headers.findIndex((h) => aliases.includes(h));
}

export function parseCostUsd(raw: string): number {
  const text = raw.trim();
  if (!text || ZERO_COST_LABELS.test(text)) return 0;
  const dollar = text.match(/\$?\s*([\d,]+(?:\.\d+)?)/);
  if (!dollar) return 0;
  const n = Number(dollar[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function isOnDemandKind(kind: string): boolean {
  return /on[\s_-]*demand|usage[\s_-]*based/i.test(kind);
}

export function isIncludedKind(kind: string): boolean {
  return /included/i.test(kind);
}

export function isGrokBotModel(model: string): boolean {
  return /grok-bot/i.test(model);
}

export function isCursorModelsModel(model: string): boolean {
  if (isGrokBotModel(model)) return false;
  const m = model.trim().toLowerCase();
  return (
    /composer/.test(m) ||
    /grok-4\.6/.test(m) ||
    /grok-4\.5/.test(m) ||
    /^grok-4\b/.test(m) ||
    /^auto$/.test(m) ||
    /cursor-small/.test(m)
  );
}

export type CsvTank = TankId;

export function classifyUsageEvent(kind: string, model: string): CsvTank | undefined {
  if (isOnDemandKind(kind)) return "onDemandMonthly";
  if (!isIncludedKind(kind)) return undefined;
  if (isGrokBotModel(model)) return "grokBotWeekly";
  if (isCursorModelsModel(model)) return "cursorModelsMonthly";
  if (model.trim()) return "otherModelsMonthly";
  return undefined;
}

function asNumber(raw: string | undefined): number | undefined {
  if (raw == null || !raw.trim()) return undefined;
  const n = Number(raw.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : undefined;
}

function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthBounds(d: Date): { periodStart: string; periodEnd: string } {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return { periodStart: start.toISOString(), periodEnd: end.toISOString() };
}

function emptyTokens(): TokenTotals {
  return { input: 0, output: 0, cacheRead: 0 };
}

function addTokens(into: TokenTotals, add: TokenTotals): void {
  into.input = (into.input ?? 0) + (add.input ?? 0);
  into.output = (into.output ?? 0) + (add.output ?? 0);
  into.cacheRead = (into.cacheRead ?? 0) + (add.cacheRead ?? 0);
}

function snapshotFromRun(args: {
  spendCents: number;
  mix?: MixCents;
  tokens?: TokenTotals;
  periodStart?: string;
  periodEnd?: string;
}): TankSnapshot {
  const snap: TankSnapshot = {
    spendUsd: args.spendCents / 100,
  };
  if (args.mix && Object.keys(args.mix).length) snap.mixCents = { ...args.mix };
  if (args.tokens && ((args.tokens.input ?? 0) > 0 || (args.tokens.output ?? 0) > 0 || (args.tokens.cacheRead ?? 0) > 0)) {
    snap.tokenTotals = { ...args.tokens };
  }
  if (args.periodStart) snap.periodStart = args.periodStart;
  if (args.periodEnd) snap.periodEnd = args.periodEnd;
  return snap;
}

export interface ParseUsageCsvOptions {
  fileName?: string;
  byteLength?: number;
  source?: Reading["source"];
}

function isCrdownloadName(fileName: string | undefined): boolean {
  return !!fileName && /\.crdownload\b/i.test(fileName);
}

export function assertUsageImportNotEmpty(text: string, options: ParseUsageCsvOptions = {}): void {
  const empty = (options.byteLength != null && options.byteLength <= 0) || !text.trim();
  if (empty && isCrdownloadName(options.fileName)) {
    throw new Error(UNFINISHED_CHROME_DOWNLOAD_MESSAGE);
  }
  if (empty) {
    throw new Error(
      "Usage file is empty. Export a finished .csv from https://cursor.com/dashboard/usage (not a 0-byte Chrome .crdownload).",
    );
  }
}

interface ParsedEvent {
  at: Date;
  tank: TankId;
  spendCents: number;
  mixKey?: string;
  tokens: TokenTotals;
}

export function parseUsageEventsCsv(text: string, options: ParseUsageCsvOptions = {}): Reading[] {
  assertUsageImportNotEmpty(text, options);

  const records = parseCsvRecords(text);
  if (records.length < 1) {
    if (isCrdownloadName(options.fileName)) throw new Error(UNFINISHED_CHROME_DOWNLOAD_MESSAGE);
    throw new Error(USAGE_CSV_HEADERS_MESSAGE);
  }

  const headers = records[0].map(normalizeHeader);
  const dateIdx = headerIndex(headers, "date");
  const kindIdx = headerIndex(headers, "kind");
  const modelIdx = headerIndex(headers, "model");
  const costIdx = headerIndex(headers, "cost");
  if (dateIdx < 0 || kindIdx < 0 || modelIdx < 0 || costIdx < 0) {
    if (isCrdownloadName(options.fileName)) throw new Error(UNFINISHED_CHROME_DOWNLOAD_MESSAGE);
    throw new Error(USAGE_CSV_HEADERS_MESSAGE);
  }

  const inWithIdx = headerIndex(headers, "input (w/ cache write)");
  const inWithoutIdx = headerIndex(headers, "input (w/o cache write)");
  const cacheIdx = headerIndex(headers, "cache read");
  const outIdx = headerIndex(headers, "output tokens");

  const events: ParsedEvent[] = [];
  for (const record of records.slice(1)) {
    const dateRaw = record[dateIdx] ?? "";
    const kind = record[kindIdx] ?? "";
    const model = record[modelIdx] ?? "";
    const cost = record[costIdx] ?? "";
    const at = new Date(dateRaw);
    if (Number.isNaN(at.getTime())) continue;
    const tank = classifyUsageEvent(kind, model);
    if (!tank) continue;
    const usd = parseCostUsd(cost);
    const spendCents = Math.round(usd * 100);
    const inWith = asNumber(record[inWithIdx]) ?? 0;
    const inWithout = asNumber(record[inWithoutIdx]) ?? 0;
    const tokens: TokenTotals = {
      input: inWith + inWithout,
      output: asNumber(record[outIdx]) ?? 0,
      cacheRead: asNumber(record[cacheIdx]) ?? 0,
    };
    const mixKey = tank === "grokBotWeekly" && isGrokBotModel(model) ? model.trim() : undefined;
    events.push({ at, tank, spendCents, mixKey, tokens });
  }

  if (!events.length) {
    throw new Error(
      "No usage-event rows could be classified. Re-export from https://cursor.com/dashboard/usage and keep Date, Kind, Model, Cost columns.",
    );
  }

  events.sort((a, b) => a.at.getTime() - b.at.getTime());

  const spendCents: Record<TankId, number> = {
    grokBotWeekly: 0,
    cursorModelsMonthly: 0,
    otherModelsMonthly: 0,
    onDemandMonthly: 0,
    xGrokLight: 0,
    xGrokMedium: 0,
    xGrokHeavy: 0,
  };
  const tokens: Record<TankId, TokenTotals> = {
    grokBotWeekly: emptyTokens(),
    cursorModelsMonthly: emptyTokens(),
    otherModelsMonthly: emptyTokens(),
    onDemandMonthly: emptyTokens(),
    xGrokLight: emptyTokens(),
    xGrokMedium: emptyTokens(),
    xGrokHeavy: emptyTokens(),
  };
  const mix: MixCents = {};

  const readings: Reading[] = [];
  let i = 0;
  while (i < events.length) {
    const day = utcDay(events[i].at);
    let lastAt = events[i].at;
    while (i < events.length && utcDay(events[i].at) === day) {
      const ev = events[i];
      lastAt = ev.at;
      spendCents[ev.tank] += ev.spendCents;
      addTokens(tokens[ev.tank], ev.tokens);
      if (ev.mixKey && ev.spendCents) {
        mix[ev.mixKey] = (mix[ev.mixKey] ?? 0) + ev.spendCents;
      }
      i++;
    }
    const month = monthBounds(lastAt);
    const tanks: Reading["tanks"] = {};
    tanks.grokBotWeekly = snapshotFromRun({
      spendCents: spendCents.grokBotWeekly,
      mix: Object.keys(mix).length ? mix : undefined,
      tokens: tokens.grokBotWeekly,
    });
    tanks.cursorModelsMonthly = snapshotFromRun({
      spendCents: spendCents.cursorModelsMonthly,
      tokens: tokens.cursorModelsMonthly,
      ...month,
    });
    tanks.otherModelsMonthly = snapshotFromRun({
      spendCents: spendCents.otherModelsMonthly,
      tokens: tokens.otherModelsMonthly,
      ...month,
    });
    tanks.onDemandMonthly = snapshotFromRun({
      spendCents: spendCents.onDemandMonthly,
      tokens: tokens.onDemandMonthly,
      ...month,
    });
    if (TANK_IDS.some((id) => tanks[id])) {
      readings.push({
        id: newId(),
        capturedAt: lastAt.toISOString(),
        tanks,
        source: options.source ?? "csv",
        surface: "cursor-usage-events",
        notes: [
          "Usage-events CSV is spend (and mix cents), not unpublished Bot/Cursor Models %. Other Models / on-demand % use plan/cap.",
        ],
        drop: options.fileName
          ? {
              fileName: options.fileName,
              mime: "text/csv",
              byteLength: options.byteLength,
            }
          : undefined,
        rawPaste: readings.length === 0 ? text : undefined,
      });
    }
  }

  if (!readings.length) {
    throw new Error("Usage CSV parsed but produced no daily readings.");
  }
  return readings;
}
