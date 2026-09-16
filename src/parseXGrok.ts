import type { TankId, TankSnapshot, XGrokPlan } from "./types";
import { X_GROK_CAPS, X_GROK_TANK_IDS } from "./types";

const WINDOW_MS = 2 * 60 * 60 * 1000;

export function looksLikeXGrokUsage(blob: string): boolean {
  if (/weekly\s*super\s*grok\s*limit|extra\s*usage\s*credits|billed through cursor|cursor models/i.test(blob)) {
    return false;
  }
  const hasTrio = /\blight\b/i.test(blob) && /\bmedium\b/i.test(blob) && /\bheavy\b/i.test(blob);
  const hasPair = /\b(?:light|fast|default)\b/i.test(blob) && /\b(?:medium|think)\b/i.test(blob);
  const counts = /\d+\s*(?:\/|of)\s*\d+/.test(blob) || /\d+\s*remaining/i.test(blob);
  const xish = /\b(?:x\.com|grok on x|\bx grok\b|premium\+|every two hours|2\s*hour(?:s)?\s*window|2h window)\b/i.test(blob);
  return counts && (hasTrio || (hasPair && xish) || (/\bheavy\b/i.test(blob) && xish));
}

function scrapeMode(names: string, text: string): { used?: number; cap?: number; remaining?: number } {
  const of = text.match(new RegExp(`(?:${names})[^\\n%]{0,48}?(\\d+)\\s*(?:\\/|of)\\s*(\\d+)`, "i"));
  if (of) {
    const used = Number(of[1]);
    const cap = Number(of[2]);
    return { used, cap, remaining: Math.max(0, cap - used) };
  }
  const rem = text.match(
    new RegExp(`(?:${names})[^\\n%]{0,48}?(\\d+)\\s*remaining(?:\\s*(?:of|\\/)\\s*(\\d+))?`, "i"),
  );
  if (rem) {
    const remaining = Number(rem[1]);
    const cap = rem[2] ? Number(rem[2]) : undefined;
    return { remaining, cap, used: cap != null ? Math.max(0, cap - remaining) : undefined };
  }
  return {};
}

function parseReset(text: string, capturedAt: string): { periodStart?: string; periodEnd?: string } {
  const hm = text.match(/resets?\s+in\s+(\d+)\s*hours?(?:(?:\s+and)?\s+(\d+)\s*minutes?)?/i);
  const minsOnly = text.match(/resets?\s+in\s+(\d+)\s*minutes?/i);
  let remainingMs: number | undefined;
  if (hm) remainingMs = (Number(hm[1]) * 60 + Number(hm[2] ?? 0)) * 60_000;
  else if (minsOnly) remainingMs = Number(minsOnly[1]) * 60_000;
  if (remainingMs == null) return {};
  const periodEnd = new Date(new Date(capturedAt).getTime() + remainingMs).toISOString();
  const periodStart = new Date(new Date(periodEnd).getTime() - WINDOW_MS).toISOString();
  return { periodStart, periodEnd };
}

function snapFrom(
  scraped: { used?: number; cap?: number; remaining?: number },
  fallbackCap: number,
  period: { periodStart?: string; periodEnd?: string },
): TankSnapshot | undefined {
  const cap = scraped.cap ?? fallbackCap;
  let used = scraped.used;
  if (used == null && scraped.remaining != null && cap > 0) used = Math.max(0, cap - scraped.remaining);
  if (used == null && scraped.cap == null && scraped.remaining == null) return undefined;
  const percentUsed = cap > 0 && used != null ? (used / cap) * 100 : undefined;
  return {
    percentUsed,
    requestUsed: used,
    requestCap: cap,
    ...period,
  };
}

export function parseXGrokWindows(
  text: string,
  capturedAt: string,
  plan: XGrokPlan,
  customCaps?: { light?: number; medium?: number; heavy?: number },
): Partial<Record<TankId, TankSnapshot>> {
  const caps = { ...X_GROK_CAPS[plan], ...customCaps };
  const period = parseReset(text, capturedAt);
  const tanks: Partial<Record<TankId, TankSnapshot>> = {};
  const light = snapFrom(scrapeMode("light|fast|default requests?", text), caps.light, period);
  const medium = snapFrom(scrapeMode("medium|think", text), caps.medium, period);
  const heavy = snapFrom(scrapeMode("heavy", text), caps.heavy, period);
  if (light) tanks.xGrokLight = light;
  if (medium) tanks.xGrokMedium = medium;
  if (heavy) tanks.xGrokHeavy = heavy;
  return tanks;
}

export function xGrokFilled(tanks: Partial<Record<TankId, TankSnapshot>>): boolean {
  return X_GROK_TANK_IDS.some((id) => tanks[id]?.requestUsed != null || tanks[id]?.percentUsed != null);
}
