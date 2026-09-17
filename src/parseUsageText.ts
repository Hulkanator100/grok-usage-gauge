import type { AppSettings, MixCents, Reading, TankId, TankSnapshot } from "./types";
import { DEFAULT_SETTINGS, TANK_IDS } from "./types";
import type { SurfaceId } from "./surfaces";
import { isCursorModelsModel, isGrokBotModel } from "./parseUsageCsv";
import { looksLikeXGrokUsage, parseXGrokWindows, xGrokFilled } from "./parseXGrok";

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface ParsedUsage {
  surface: SurfaceId;
  tanks: Partial<Record<TankId, TankSnapshot>>;
  notes: string[];
  fillsTank: boolean;
  planHint?: "pro" | "proPlus" | "ultra";
  onDemandDisabled?: boolean;
}

function num(m: RegExpMatchArray | null, i = 1): number | undefined {
  if (!m) return undefined;
  const n = Number(m[i].replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function isoDaysFrom(capturedAt: string, days: number): string {
  return new Date(new Date(capturedAt).getTime() + days * 86400000).toISOString();
}

function isoDaysBefore(endIso: string, days: number): string {
  return new Date(new Date(endIso).getTime() - days * 86400000).toISOString();
}

/** grok.com Settings → Usage (Weekly SuperGrok Limit, Extra Usage Credits). Not Cursor Grok Bot. */
export function looksLikeGrokComUsage(blob: string): boolean {
  if (/billed through cursor/i.test(blob)) return false;
  if (/cursor models[\s\S]{0,160}%\s*used/i.test(blob) && /other models[\s\S]{0,160}%\s*used/i.test(blob)) {
    return false;
  }
  return (
    /weekly\s*super\s*grok\s*limit/i.test(blob) ||
    /extra\s*usage\s*credits/i.test(blob) ||
    (/auto\s*top[-\s]?up/i.test(blob) && /buy credits/i.test(blob)) ||
    /grok\.com/i.test(blob) ||
    (/product split/i.test(blob) && /extra usage/i.test(blob)) ||
    (/companions|tesla grok/i.test(blob) && /%\s*used/i.test(blob))
  );
}

function looksLikeCursorUsageDashboard(blob: string): boolean {
  const cards = /total\s*tokens/i.test(blob) && /\bincluded\b/i.test(blob) && /on[-\s]?demand/i.test(blob);
  const chart =
    /your usage per day|cumulative tokens|group by/i.test(blob) ||
    /export\s*csv/i.test(blob) ||
    /date\s*\(utc\)/i.test(blob);
  const spendingMeters = /cursor models[\s\S]{0,120}%\s*used/i.test(blob) && /other models[\s\S]{0,120}%\s*used/i.test(blob);
  return cards && chart && !spendingMeters;
}

/** 108.1M, 145.2K, 0 → raw token count. */
export function parseCompactCount(raw: string): number | undefined {
  const m = String(raw)
    .trim()
    .replace(/,/g, "")
    .match(/^([\d]+(?:\.\d+)?)\s*([KMBT])?$/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;
  const u = (m[2] || "").toUpperCase();
  const mul = u === "K" ? 1e3 : u === "M" ? 1e6 : u === "B" ? 1e9 : u === "T" ? 1e12 : 1;
  return n * mul;
}

function cardCount(label: RegExp, text: string): number | undefined {
  const re = new RegExp(label.source + String.raw`\s*([\d,]+(?:\.\d+)?)\s*([KMBT])?`, "i");
  const m = text.match(re);
  if (!m) return undefined;
  return parseCompactCount(`${m[1]}${m[2] ?? ""}`);
}

function listedModels(text: string): string[] {
  const found = text.match(
    /(?:cursor-grok|composer|claude|gemini|gpt|o[134])[\w.-]*/gi,
  );
  if (!found) return [];
  return [...new Set(found.map((s) => s.toLowerCase()))];
}

function isOtherModelsModel(model: string): boolean {
  if (isGrokBotModel(model) || isCursorModelsModel(model)) return false;
  return /claude|gpt-|gemini|sonnet|opus|\bo[134]\b/i.test(model);
}

function parseDashboardCards(text: string): { total?: number; included?: number; onDemand?: number } {
  let total = cardCount(/total\s*tokens/, text);
  let included = cardCount(/\bincluded\b/, text);
  let onDemand = cardCount(/on[-\s]?demand/, text);
  // Sidebar OCR often yields "On-demand" then a nav index like "8 Plugins" before 108.1M 104.3M 0.
  if (onDemand != null && onDemand >= 1 && onDemand < 10 && (total == null || total >= 1e6)) {
    onDemand = undefined;
  }
  if (included != null && included < 10) included = undefined;

  const collapsed = text.replace(/\s+/g, " ");
  const trio = collapsed.match(
    /total\s*tokens.{0,220}?([\d.]+)\s*([KMB])\s+([\d.]+)\s*([KMB])\s+(\d+(?:\.\d+)?)(?:\s*([KMB]))?/i,
  );
  if (trio) {
    total ??= parseCompactCount(`${trio[1]}${trio[2]}`);
    included ??= parseCompactCount(`${trio[3]}${trio[4]}`);
    onDemand ??= parseCompactCount(`${trio[5]}${trio[6] ?? ""}`);
  }
  return { total, included, onDemand };
}

function parseCursorUsageDashboard(text: string, _capturedAt: string): ParsedUsage {
  const notes: string[] = [];
  const tanks: Partial<Record<TankId, TankSnapshot>> = {};
  const { total, included, onDemand: onDemandTokens } = parseDashboardCards(text);
  const models = listedModels(text);
  const cursorModels = models.filter((m) => isCursorModelsModel(m) && !isGrokBotModel(m));
  const otherModels = models.filter(isOtherModelsModel);
  const botModels = models.filter(isGrokBotModel);

  notes.push(
    "This is cursor.com/dashboard/usage (token chart), not Spending %. Tokens are not tank fill. Export a spreadsheet for dollars, or screenshot Spending for Cursor Models / Other Models %.",
  );
  if (total != null || included != null || onDemandTokens != null) {
    notes.push(
      `Selected-range cards: total ${total ?? "—"} tokens · included ${included ?? "—"} · on-demand ${onDemandTokens ?? "—"}. The 1d/7d/MTD chips are a chart filter, not Grok Bot weekly reset.`,
    );
  }
  if (models.length) {
    notes.push(`Models on the chart: ${models.join(", ")}.`);
  }
  if (cursorModels.length && otherModels.length) {
    notes.push("Chart mixes Cursor Models (Grok/Composer) and Other Models (Claude/GPT/Gemini) — included tokens are not assigned as one tank %.");
  }
  if (botModels.length) {
    notes.push("grok-bot rows on Usage are Bot-week mix (cost in the spreadsheet), not the Cursor Models header %.");
  }

  if (cursorModels.length) {
    tanks.cursorModelsMonthly = { tokenTotals: { total: included ?? total } };
  } else if (otherModels.length) {
    tanks.otherModelsMonthly = { tokenTotals: { total: included ?? total } };
  } else if (included != null || total != null) {
    tanks.cursorModelsMonthly = { tokenTotals: { total: included ?? total } };
  }

  if (onDemandTokens != null) {
    tanks.onDemandMonthly = {
      tokenTotals: { total: onDemandTokens },
      // Token card 0 in this window is $0 on-demand billed in that window — not a monthly cap from Spending.
      spendUsd: onDemandTokens === 0 ? 0 : undefined,
    };
  }

  const planHint: ParsedUsage["planHint"] = /pro\s*\+|pro plus/i.test(text)
    ? "proPlus"
    : /\bultra\b/i.test(text)
      ? "ultra"
      : undefined;

  const fillsTank = TANK_IDS.some((id) => {
    const s = tanks[id];
    return s && (s.percentUsed != null || s.spendUsd != null || s.mixCents || s.tokenTotals || s.requestUsed != null);
  });

  return {
    surface: "cursor-usage-dashboard",
    tanks,
    notes,
    fillsTank,
    planHint,
  };
}

export const GROK_COM_REJECT_NOTE =
  "This looks like grok.com SuperGrok Usage (Weekly SuperGrok Limit / Extra Usage Credits). That is a different account meter than Cursor Grok Bot. Tanks were not changed. Add Grok Bot Settings → Usage, cursor.com/dashboard/spending, or a Cursor Usage spreadsheet instead.";

function classifySurface(text: string, fileName = ""): SurfaceId {
  const blob = `${fileName}\n${text}`;
  if (looksLikeGrokComUsage(blob)) return "grok-com";
  if (looksLikeXGrokUsage(blob)) return "x-grok-windows";
  if (looksLikeCursorUsageDashboard(blob)) return "cursor-usage-dashboard";
  if (/you.?ve reached your grok bot usage limit|resets in \d+\s*days/i.test(blob) && /grok bot/i.test(blob)) {
    return "grok-bot-chat-banner";
  }
  if (/run history|copy request id|no runs yet|grok-bot-automation/i.test(blob) && /routine/i.test(blob)) {
    return "grok-bot-routines";
  }
  if (/\b\/usage\b|auto\s*\/\s*api|cli changelog/i.test(blob) || /cli/i.test(fileName) && /usage/i.test(blob)) {
    if (/on-demand|billing cycle|included usage/i.test(blob)) return "cursor-cli";
  }
  if (/cloud agent id|agents created|background agent/i.test(blob)) return "cursor-cloud-agent";
  if (/\bbugbot\b/i.test(blob) && !/other models/i.test(blob)) return "cursor-bugbot";
  if (/weekly usage|usage & billing|on-demand monthly limit|billed through cursor/i.test(blob)) {
    return "grok-bot-settings";
  }
  if (/cursor models|other models|spending/i.test(blob)) return "cursor-spending";
  if (/kind,.?model|input \(w\/o cache write\)|usage-events/i.test(blob) || /\.csv/i.test(fileName)) {
    return "cursor-usage-events";
  }
  if (/included usage|usage limit|composer 2\.5/i.test(blob)) return "cursor-editor";
  if (/mcp|marketplace/i.test(blob) && /plugin/i.test(blob)) return "grok-bot-mcp";
  if (/\bcua\b|computer use|grok-bot-cua/i.test(blob)) return "grok-bot-cua";
  return "unknown";
}

function firstPercent(re: RegExp, text: string): number | undefined {
  return num(text.match(re));
}

function money(re: RegExp, text: string): number | undefined {
  return num(text.match(re));
}

function ofMoney(text: string): { spend: number; cap: number } | undefined {
  const m = text.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(?:of|\/)\s*\$\s*([\d,]+(?:\.\d+)?)/i);
  if (!m) return undefined;
  return { spend: Number(m[1].replace(/,/g, "")), cap: Number(m[2].replace(/,/g, "")) };
}

function mixFromText(text: string): MixCents | undefined {
  const mix: MixCents = {};
  const re = /(grok-bot-(?:default|automation|cua))\s*[:=]?\s*(\d+(?:\.\d+)?)(?:\s*¢|\s*cents)?/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) mix[match[1]] = Number(match[2]);
  return Object.keys(mix).length ? mix : undefined;
}

function applyWeeklyReset(text: string, capturedAt: string, snap: TankSnapshot): void {
  const weeklyLine = text.match(/weekly usage[\s\S]{0,200}/i)?.[0] ?? "";
  const hoursLeft = weeklyLine.match(/(\d+)\s*hours?(?:\s+and\s+(\d+)\s*minutes?)?\s*left/i);
  if (hoursLeft) {
    const h = Number(hoursLeft[1]);
    const m = Number(hoursLeft[2] ?? 0);
    snap.periodEnd = new Date(new Date(capturedAt).getTime() + (h * 60 + m) * 60_000).toISOString();
    snap.periodStart = isoDaysBefore(snap.periodEnd, 7);
    return;
  }
  const named = weeklyLine.match(/resets?\s+([A-Za-z]{3,9}\.? \d{1,2}(?:,?\s*\d{4})?)/i);
  if (named) {
    const year = new Date(capturedAt).getUTCFullYear();
    const d = new Date(`${named[1]}, ${year}`);
    if (!Number.isNaN(d.getTime())) {
      snap.periodEnd = d.toISOString();
      snap.periodStart = isoDaysBefore(snap.periodEnd, 7);
      return;
    }
  }
  const inDays = weeklyLine.match(/resets?\s+in\s+(\d+)\s*days?/i) ?? text.match(/resets?\s+in\s+(\d+)\s*days?/i);
  if (inDays) {
    snap.periodEnd = isoDaysFrom(capturedAt, Number(inDays[1]));
    snap.periodStart = isoDaysBefore(snap.periodEnd, 7);
  }
}

function applyMonthlyReset(text: string, capturedAt: string, snap: TankSnapshot): void {
  const m = text.match(/usage limits reset on\s+([A-Za-z]{3,9}\.? \d{1,2}(?:,?\s*\d{4})?)/i);
  if (!m) return;
  const year = new Date(capturedAt).getUTCFullYear();
  const d = new Date(`${m[1]}, ${year}`);
  if (Number.isNaN(d.getTime())) return;
  snap.periodEnd = d.toISOString();
  const start = new Date(d.getTime());
  start.setUTCMonth(start.getUTCMonth() - 1);
  snap.periodStart = start.toISOString();
}

export function parseUsageText(
  text: string,
  capturedAt: string,
  fileName = "",
  settings: AppSettings = DEFAULT_SETTINGS,
): ParsedUsage {
  const surface = classifySurface(text, fileName);
  const notes: string[] = [];
  const tanks: Partial<Record<TankId, TankSnapshot>> = {};

  if (surface === "grok-com") {
    notes.push(GROK_COM_REJECT_NOTE);
    return { surface, tanks, notes, fillsTank: false };
  }
  if (surface === "x-grok-windows") {
    const xTanks = parseXGrokWindows(text, capturedAt, settings.xPlan, {
      light: settings.xLightCap,
      medium: settings.xMediumCap,
      heavy: settings.xHeavyCap,
    });
    Object.assign(tanks, xTanks);
    notes.push(
      "This is Grok on X (Light / Medium / Heavy reply windows). These are not Cursor tanks and not grok.com SuperGrok week. Limits are replies about every two hours.",
    );
    return { surface, tanks, notes, fillsTank: xGrokFilled(tanks) };
  }
  if (surface === "grok-bot-routines") {
    notes.push("Routine run history is the last 20 runs plus request IDs, not dollars. It does not fill a tank.");
    return { surface, tanks, notes, fillsTank: false };
  }
  if (surface === "cursor-bugbot") {
    notes.push("Bugbot history is PR reviews, not a usage export. Check Cursor Spending after runs.");
    return { surface, tanks, notes, fillsTank: false };
  }
  if (surface === "cursor-usage-dashboard") {
    return parseCursorUsageDashboard(text, capturedAt);
  }

  const botPct =
    firstPercent(/weekly usage[:\s]*([\d.]+)\s*%/i, text) ??
    firstPercent(/grok bot[\s\S]{0,80}?([\d.]+)\s*%\s*used/i, text);

  const cursorPct =
    firstPercent(/cursor models[\s\S]{0,120}?([\d.]+)\s*%\s*used/i, text) ??
    firstPercent(/cursor models[:\s]*([\d.]+)\s*%/i, text) ??
    firstPercent(/\bauto\b[^%\d]{0,24}([\d.]+)\s*%/i, text);
  const otherPct =
    firstPercent(/other models[\s\S]{0,120}?([\d.]+)\s*%\s*used/i, text) ??
    firstPercent(/other models[:\s]*([\d.]+)\s*%/i, text) ??
    firstPercent(/\bapi\b[^%\d]{0,24}([\d.]+)\s*%/i, text);

  const planHint: ParsedUsage["planHint"] = /pro\s*\+|pro plus/i.test(text)
    ? "proPlus"
    : /\bultra\b/i.test(text) && /current plan/i.test(text)
      ? "ultra"
      : /current plan[\s\S]{0,40}\bpro\b/i.test(text)
        ? "pro"
        : undefined;
  const onDemandDisabled = /on-demand spending is currently disabled|monthly limit[\s\S]{0,40}disabled/i.test(text);

  if (surface === "grok-bot-chat-banner" || /reached your grok bot usage limit/i.test(text)) {
    tanks.grokBotWeekly = { percentUsed: botPct ?? 100 };
    applyWeeklyReset(text, capturedAt, tanks.grokBotWeekly);
    notes.push("Limit banner: included Bot week is empty until weekly reset.");
  } else if (botPct != null || surface === "grok-bot-settings") {
    tanks.grokBotWeekly = {
      percentUsed: botPct,
      mixCents: mixFromText(text),
    };
    applyWeeklyReset(text, capturedAt, tanks.grokBotWeekly);
  }

  if (cursorPct != null || (surface === "cursor-spending" && /cursor models/i.test(text))) {
    tanks.cursorModelsMonthly = { percentUsed: cursorPct };
    applyMonthlyReset(text, capturedAt, tanks.cursorModelsMonthly);
  }

  if (otherPct != null || (surface === "cursor-spending" && /other models/i.test(text))) {
    tanks.otherModelsMonthly = { percentUsed: otherPct };
    applyMonthlyReset(text, capturedAt, tanks.otherModelsMonthly);
  }

  const odBlock = text.match(/on[-\s]?demand[\s\S]{0,220}/i)?.[0] ?? "";
  const od = ofMoney(odBlock) ?? ofMoney(text);
  if (onDemandDisabled) {
    tanks.onDemandMonthly = { spendUsd: 0, capUsd: 0, percentUsed: 0 };
    applyMonthlyReset(text, capturedAt, tanks.onDemandMonthly);
    notes.push("On-demand extra pay is off ($0 cap).");
  } else {
    const capUsd =
      od?.cap ??
      money(/on[-\s]?demand monthly limit[:\s]*\$?\s*([\d.]+)/i, text) ??
      money(/monthly limit[:\s]*\$?\s*([\d.]+)/i, text);
    const spendUsd =
      od?.spend ??
      money(/billed through cursor[\s\S]{0,48}?\$\s*([\d.]+)/i, text) ??
      money(/on[-\s]?demand usage[\s\S]{0,48}?\$\s*([\d.]+)/i, text);
    if (od || /on[-\s]?demand monthly limit|billed through cursor|on[-\s]?demand usage/i.test(text)) {
      tanks.onDemandMonthly = { spendUsd, capUsd };
      if (capUsd != null && capUsd > 0 && spendUsd != null) {
        tanks.onDemandMonthly.percentUsed = (spendUsd / capUsd) * 100;
      }
      applyMonthlyReset(text, capturedAt, tanks.onDemandMonthly);
    }
  }

  const mix = mixFromText(text);
  if (mix) {
    tanks.grokBotWeekly = { ...tanks.grokBotWeekly, mixCents: mix };
  }

  if (surface === "cursor-cli") {
    notes.push("Cursor CLI /usage hits the Cursor month (Cursor Models, Other Models, and maybe extra pay), not a separate CLI tank.");
  }
  if (surface === "cursor-cloud-agent") {
    notes.push("Cloud Agent spend belongs on Cursor tanks — if Grok Bot started it, also keep the Bot week tank. Do not add them together.");
  }
  if (surface === "cursor-usage-events") {
    notes.push("A Cursor Usage spreadsheet is per-request cost. Included spend goes to Bot / Cursor Models / Other Models by model name, and extra-pay rows go to on-demand dollars. Hidden Bot and Cursor Models % still need Settings or Spending.");
  }

  const xTanks = parseXGrokWindows(text, capturedAt, settings.xPlan, {
    light: settings.xLightCap,
    medium: settings.xMediumCap,
    heavy: settings.xHeavyCap,
  });
  if (xGrokFilled(xTanks)) {
    Object.assign(tanks, xTanks);
    notes.push("Also filled X Grok Light / Medium / Heavy reply windows (separate from Cursor).");
  }

  const fillsTank = TANK_IDS.some((id) => {
    const s = tanks[id];
    return s && (s.percentUsed != null || s.spendUsd != null || s.mixCents || s.tokenTotals || s.requestUsed != null);
  });

  return { surface, tanks, notes, fillsTank, planHint, onDemandDisabled };
}

export function readingFromParsed(parsed: ParsedUsage, capturedAt: string, raw: string, source: Reading["source"]): Reading {
  return {
    id: newId(),
    capturedAt,
    tanks: parsed.tanks,
    source,
    rawPaste: raw,
    surface: parsed.surface,
    notes: parsed.notes,
  };
}
