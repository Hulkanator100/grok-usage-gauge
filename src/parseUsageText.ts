import type { MixCents, Reading, TankId, TankSnapshot } from "./types";
import { TANK_IDS } from "./types";
import type { SurfaceId } from "./surfaces";

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface ParsedUsage {
  surface: SurfaceId;
  tanks: Partial<Record<TankId, TankSnapshot>>;
  notes: string[];
  fillsTank: boolean;
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

function classifySurface(text: string, fileName = ""): SurfaceId {
  const blob = `${fileName}\n${text}`;
  if (/grok\.com|supergrok|imagine|companions|extra usage/i.test(blob) && !/billed through cursor/i.test(blob)) {
    if (/settings\s*→\s*usage|product split/i.test(blob) || /grok\.com/i.test(fileName)) return "grok-com";
  }
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

function applyReset(text: string, capturedAt: string, snap: TankSnapshot, week: boolean): void {
  const inDays = text.match(/resets?\s+in\s+(\d+)\s*days?/i);
  if (inDays) {
    snap.periodEnd = isoDaysFrom(capturedAt, Number(inDays[1]));
    if (week) snap.periodStart = isoDaysBefore(snap.periodEnd, 7);
    return;
  }
  const resetLine = text.match(
    /resets?\s*(?:on|at)?\s*:?\s*([A-Za-z]{3,9}\.? \d{1,2}(?:,?\s*\d{4})?(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?)/i,
  );
  if (resetLine) {
    const d = new Date(resetLine[1]);
    if (!Number.isNaN(d.getTime())) {
      snap.periodEnd = d.toISOString();
      if (week) snap.periodStart = isoDaysBefore(snap.periodEnd, 7);
    }
  }
}

export function parseUsageText(text: string, capturedAt: string, fileName = ""): ParsedUsage {
  const surface = classifySurface(text, fileName);
  const notes: string[] = [];
  const tanks: Partial<Record<TankId, TankSnapshot>> = {};

  if (surface === "grok-com") {
    notes.push("This looks like grok.com / SuperGrok Usage — out of v1. Not mixed into Cursor tanks.");
    return { surface, tanks, notes, fillsTank: false };
  }
  if (surface === "grok-bot-routines") {
    notes.push("Routine run history is the last 20 runs + request IDs, not cents. It does not fill a tank.");
    return { surface, tanks, notes, fillsTank: false };
  }
  if (surface === "cursor-bugbot") {
    notes.push("Bugbot history is PR reviews, not a usage export. Check Cursor Spending after runs.");
    return { surface, tanks, notes, fillsTank: false };
  }

  const botPct =
    firstPercent(/weekly usage[:\s]*([\d.]+)\s*%/i, text) ??
    firstPercent(/grok bot(?:\s+weekly)?[^%\d]{0,40}([\d.]+)\s*%/i, text) ??
    (surface === "grok-bot-chat-banner" || /usage limit/i.test(text) ? firstPercent(/([\d.]+)\s*%\s*used/i, text) : undefined);

  const cursorPct =
    firstPercent(/cursor models[:\s]*([\d.]+)\s*%/i, text) ?? firstPercent(/\bauto\b[^%\d]{0,24}([\d.]+)\s*%/i, text);
  const otherPct =
    firstPercent(/other models[:\s]*([\d.]+)\s*%/i, text) ?? firstPercent(/\bapi\b[^%\d]{0,24}([\d.]+)\s*%/i, text);

  if (surface === "grok-bot-chat-banner" || /reached your grok bot usage limit/i.test(text)) {
    tanks.grokBotWeekly = { percentUsed: botPct ?? 100 };
    applyReset(text, capturedAt, tanks.grokBotWeekly, true);
    notes.push("Limit banner: included Bot week is empty until weekly reset.");
  } else if (botPct != null || surface === "grok-bot-settings") {
    tanks.grokBotWeekly = {
      percentUsed: botPct,
      mixCents: mixFromText(text),
      spendUsd: money(/spend(?:ing)?[:\s]*\$?\s*([\d.]+)/i, text),
    };
    applyReset(text, capturedAt, tanks.grokBotWeekly, true);
  }

  if (cursorPct != null || (surface === "cursor-spending" && /cursor models/i.test(text))) {
    tanks.cursorModelsMonthly = {
      percentUsed: cursorPct,
      spendUsd: money(/cursor models[\s\S]{0,80}(?:spend|cost)[:\s]*\$?\s*([\d.]+)/i, text),
    };
    applyReset(text, capturedAt, tanks.cursorModelsMonthly, false);
  }

  if (otherPct != null || (surface === "cursor-spending" && /other models/i.test(text))) {
    tanks.otherModelsMonthly = {
      percentUsed: otherPct,
      spendUsd: money(/other models[\s\S]{0,80}(?:spend|cost)[:\s]*\$?\s*([\d.]+)/i, text),
    };
    applyReset(text, capturedAt, tanks.otherModelsMonthly, false);
  }

  const odBlock = text.match(/on[-\s]?demand[\s\S]{0,220}/i)?.[0] ?? "";
  const od = ofMoney(odBlock) ?? ofMoney(text);
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
    applyReset(text, capturedAt, tanks.onDemandMonthly, false);
  }

  const mix = mixFromText(text);
  if (mix) {
    tanks.grokBotWeekly = { ...tanks.grokBotWeekly, mixCents: mix };
  }

  if (surface === "cursor-cli") {
    notes.push("CLI /usage hits the Cursor month (tanks 2/3 and maybe on-demand), not a separate CLI tank.");
  }
  if (surface === "cursor-cloud-agent") {
    notes.push("Cloud Agent spend belongs on Cursor tanks — if Grok Bot launched it, also keep the Bot week tank. Do not merge.");
  }
  if (surface === "cursor-usage-events") {
    notes.push("Usage-event CSV/list is per-request cost. This gauge rolls Included spend into Bot / Cursor Models / Other Models mix-by-model, and Usage-based/On-Demand Kind into tank 4. Unpublished Bot/Cursor Models % still need Settings or Spending.");
  }

  const fillsTank = TANK_IDS.some((id) => {
    const s = tanks[id];
    return s && (s.percentUsed != null || s.spendUsd != null || s.mixCents);
  });

  return { surface, tanks, notes, fillsTank };
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
