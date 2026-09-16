import type { Reading } from "./types";

const DAY = 24 * 60 * 60 * 1000;

function rid(prefix: string, n: number): string {
  return `${prefix}-${n}`;
}

export function buildExampleWeek(now = new Date()): Reading[] {
  const endBot = new Date(now.getTime() + 2.2 * DAY);
  const startBot = new Date(endBot.getTime() - 7 * DAY);
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const t1 = new Date(startBot.getTime() + 1.1 * DAY);
  const t2 = new Date(now.getTime() - 0.05 * DAY);

  const botElapsed1 = (t1.getTime() - startBot.getTime()) / (7 * DAY);
  const botElapsed2 = (t2.getTime() - startBot.getTime()) / (7 * DAY);
  const p1 = Math.round(botElapsed1 * 1000) / 10;
  const p2 = Math.round(botElapsed2 * 1000) / 10;

  const monthElapsed2 = (t2.getTime() - monthStart.getTime()) / (monthEnd.getTime() - monthStart.getTime());
  const cursorPct = Math.round(monthElapsed2 * 32 * 10) / 10;
  const otherPct = Math.round(monthElapsed2 * 11 * 10) / 10;

  return [
    {
      id: rid("ex", 1),
      capturedAt: t1.toISOString(),
      source: "example",
      tanks: {
        grokBotWeekly: {
          percentUsed: p1,
          periodStart: startBot.toISOString(),
          periodEnd: endBot.toISOString(),
          spendUsd: Math.round((p1 / 100) * 7 * 100) / 100,
          mixCents: { "grok-bot-default": 80, "grok-bot-automation": 20, "grok-bot-cua": 5 },
        },
        cursorModelsMonthly: {
          percentUsed: Math.max(2, cursorPct * 0.35),
          periodStart: monthStart.toISOString(),
          periodEnd: monthEnd.toISOString(),
          spendUsd: 1.2,
        },
        otherModelsMonthly: {
          percentUsed: Math.max(1, otherPct * 0.4),
          periodStart: monthStart.toISOString(),
          periodEnd: monthEnd.toISOString(),
          spendUsd: 0.4,
          capUsd: 20,
        },
        onDemandMonthly: {
          spendUsd: 0,
          capUsd: 20,
          periodStart: monthStart.toISOString(),
          periodEnd: monthEnd.toISOString(),
        },
      },
    },
    {
      id: rid("ex", 2),
      capturedAt: t2.toISOString(),
      source: "example",
      tanks: {
        grokBotWeekly: {
          percentUsed: p2,
          periodStart: startBot.toISOString(),
          periodEnd: endBot.toISOString(),
          spendUsd: Math.round((p2 / 100) * 7 * 100) / 100,
          mixCents: { "grok-bot-default": 210, "grok-bot-automation": 140, "grok-bot-cua": 60 },
          tokenTotals: { input: 1_200_000, output: 90_000, cacheRead: 4_800_000 },
        },
        cursorModelsMonthly: {
          percentUsed: cursorPct,
          periodStart: monthStart.toISOString(),
          periodEnd: monthEnd.toISOString(),
          spendUsd: 4.8,
        },
        otherModelsMonthly: {
          percentUsed: otherPct,
          periodStart: monthStart.toISOString(),
          periodEnd: monthEnd.toISOString(),
          spendUsd: 1.65,
          capUsd: 20,
        },
        onDemandMonthly: {
          spendUsd: 0,
          capUsd: 20,
          periodStart: monthStart.toISOString(),
          periodEnd: monthEnd.toISOString(),
        },
      },
    },
  ];
}

/** Three Bot-week readings whose newest interval is >15% faster and empties before weekly reset. */
export function buildAcceleratingWeek(now = new Date()): Reading[] {
  const periodEnd = new Date(now.getTime() + 0.8 * DAY);
  const periodStart = new Date(periodEnd.getTime() - 7 * DAY);
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const t1 = new Date(periodStart.getTime() + 0.5 * DAY);
  const t2 = new Date(periodStart.getTime() + 3.5 * DAY);
  const t3 = now;

  const monthEndIso = monthEnd.toISOString();
  const monthStartIso = monthStart.toISOString();
  const botStart = periodStart.toISOString();
  const botEnd = periodEnd.toISOString();

  return [
    {
      id: rid("acc", 1),
      capturedAt: t1.toISOString(),
      source: "accelerating-example",
      tanks: {
        grokBotWeekly: {
          percentUsed: 6,
          periodStart: botStart,
          periodEnd: botEnd,
          spendUsd: 0.42,
          mixCents: { "grok-bot-default": 30, "grok-bot-automation": 8, "grok-bot-cua": 4 },
        },
        cursorModelsMonthly: {
          percentUsed: 8,
          periodStart: monthStartIso,
          periodEnd: monthEndIso,
          spendUsd: 1.1,
        },
        otherModelsMonthly: {
          percentUsed: 3,
          periodStart: monthStartIso,
          periodEnd: monthEndIso,
          spendUsd: 0.55,
          capUsd: 20,
        },
        onDemandMonthly: {
          spendUsd: 0,
          capUsd: 20,
          periodStart: monthStartIso,
          periodEnd: monthEndIso,
        },
      },
    },
    {
      id: rid("acc", 2),
      capturedAt: t2.toISOString(),
      source: "accelerating-example",
      tanks: {
        grokBotWeekly: {
          percentUsed: 20,
          periodStart: botStart,
          periodEnd: botEnd,
          spendUsd: 1.4,
          mixCents: { "grok-bot-default": 90, "grok-bot-automation": 35, "grok-bot-cua": 15 },
        },
        cursorModelsMonthly: {
          percentUsed: 14,
          periodStart: monthStartIso,
          periodEnd: monthEndIso,
          spendUsd: 2.2,
        },
        otherModelsMonthly: {
          percentUsed: 5,
          periodStart: monthStartIso,
          periodEnd: monthEndIso,
          spendUsd: 0.9,
          capUsd: 20,
        },
        onDemandMonthly: {
          spendUsd: 0,
          capUsd: 20,
          periodStart: monthStartIso,
          periodEnd: monthEndIso,
        },
      },
    },
    {
      id: rid("acc", 3),
      capturedAt: t3.toISOString(),
      source: "accelerating-example",
      tanks: {
        grokBotWeekly: {
          percentUsed: 85,
          periodStart: botStart,
          periodEnd: botEnd,
          spendUsd: 5.95,
          mixCents: { "grok-bot-default": 320, "grok-bot-automation": 190, "grok-bot-cua": 85 },
          tokenTotals: { input: 2_400_000, output: 180_000, cacheRead: 9_100_000 },
        },
        cursorModelsMonthly: {
          percentUsed: 22,
          periodStart: monthStartIso,
          periodEnd: monthEndIso,
          spendUsd: 3.4,
        },
        otherModelsMonthly: {
          percentUsed: 7,
          periodStart: monthStartIso,
          periodEnd: monthEndIso,
          spendUsd: 1.3,
          capUsd: 20,
        },
        onDemandMonthly: {
          spendUsd: 2.1,
          capUsd: 20,
          periodStart: monthStartIso,
          periodEnd: monthEndIso,
        },
      },
    },
  ];
}

