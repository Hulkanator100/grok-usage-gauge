import { describe, expect, it } from "vitest";
import {
  accelerationWarning,
  computeTankMetrics,
  impliedGrantUsd,
  paceMultiplier,
  remainingPercent,
  remainingUsd,
} from "./metrics";
import { buildAcceleratingWeek, buildExampleWeek } from "./examples";
import { parsePaste, sampleDashboardPaste } from "./parsePaste";

describe("implied grant and remaining", () => {
  it("computes unpublished grant from spend / percent when percent >= 0.5", () => {
    expect(impliedGrantUsd(5.95, 85)).toBeCloseTo(7, 5);
    expect(impliedGrantUsd(5, 0.4)).toBeUndefined();
    expect(remainingPercent(85)).toBe(15);
    expect(remainingUsd({ spendUsd: 5.95, percentUsed: 85 })).toBeCloseTo(1.05, 5);
    expect(remainingUsd({ spendUsd: 8, capUsd: 20 })).toBe(12);
  });
});

describe("pace", () => {
  it("is 1.0x when fraction used matches fraction elapsed", () => {
    const start = new Date("2026-09-10T00:00:00Z");
    const end = new Date("2026-09-17T00:00:00Z");
    const at = new Date("2026-09-13T12:00:00Z");
    const frac = (at.getTime() - start.getTime()) / (end.getTime() - start.getTime());
    expect(paceMultiplier(frac * 100, start, end, at)).toBeCloseTo(1, 8);
  });
});

describe("acceleration + empty before reset", () => {
  it("warns empty before weekly reset on the accelerating example", () => {
    const now = new Date("2026-09-16T19:26:00Z");
    const readings = buildAcceleratingWeek(now);
    const snaps = readings.map((r) => ({ capturedAt: r.capturedAt, snap: r.tanks.grokBotWeekly! }));
    const metrics = computeTankMetrics({ kind: "week", snapshots: snaps, now });
    expect(metrics.acceleration).toBeDefined();
    expect(metrics.acceleration!.hoursEarly).toBeGreaterThan(0);
    expect(metrics.acceleration!.emptyAt.getTime()).toBeLessThan(metrics.acceleration!.periodEnd.getTime());
    expect(metrics.acceleration!.fasterRatio).toBeGreaterThan(1.15);
  });

  it("does not warn on a two-reading on-pace example", () => {
    const now = new Date("2026-09-16T19:26:00Z");
    const readings = buildExampleWeek(now);
    const snaps = readings.map((r) => ({ capturedAt: r.capturedAt, snap: r.tanks.grokBotWeekly! }));
    const metrics = computeTankMetrics({ kind: "week", snapshots: snaps, now });
    expect(metrics.acceleration).toBeUndefined();
    expect(readings).toHaveLength(2);
  });

  it("needs three points for acceleration", () => {
    const periodEnd = new Date("2026-09-17T00:00:00Z");
    expect(
      accelerationWarning({
        periodEnd,
        points: [
          { t: Date.parse("2026-09-10T00:00:00Z"), p: 10 },
          { t: Date.parse("2026-09-16T00:00:00Z"), p: 80 },
        ],
      }),
    ).toBeUndefined();
  });
});

describe("tanks stay separate", () => {
  it("does not sum four tanks into one percent", () => {
    const now = new Date("2026-09-16T19:26:00Z");
    const readings = buildAcceleratingWeek(now);
    const latest = readings[readings.length - 1].tanks;
    const percents = [
      latest.grokBotWeekly?.percentUsed,
      latest.cursorModelsMonthly?.percentUsed,
      latest.otherModelsMonthly?.percentUsed,
    ];
    const sum = percents.reduce<number>((a, b) => a + (b ?? 0), 0);
    expect(sum).toBeGreaterThan(100);
    expect(latest.grokBotWeekly?.percentUsed).toBe(85);
    expect(latest.cursorModelsMonthly?.percentUsed).toBe(22);
  });
});

describe("paste parser", () => {
  it("parses the sample dashboard text into four tanks", () => {
    const [reading] = parsePaste(sampleDashboardPaste());
    expect(reading.tanks.grokBotWeekly?.percentUsed).toBe(61.4);
    expect(reading.tanks.cursorModelsMonthly?.percentUsed).toBe(28);
    expect(reading.tanks.otherModelsMonthly?.percentUsed).toBe(9);
    expect(reading.tanks.onDemandMonthly?.spendUsd).toBe(0);
    expect(reading.tanks.onDemandMonthly?.capUsd).toBe(20);
    expect(reading.tanks.grokBotWeekly?.mixCents?.["grok-bot-default"]).toBe(210);
  });

  it("parses JSON with GetSandUsageStatus-shaped fields without calling any API", () => {
    const [reading] = parsePaste(
      JSON.stringify({
        usagePercent: 41.2,
        nextResetTimestampUtc: Date.parse("2026-09-17T00:00:00Z") / 1000,
        cursorModelsMonthly: { percentUsed: 10, spendUsd: 2 },
      }),
    );
    expect(reading.tanks.grokBotWeekly?.percentUsed).toBe(41.2);
    expect(reading.tanks.grokBotWeekly?.periodEnd).toBe("2026-09-17T00:00:00.000Z");
    expect(reading.tanks.cursorModelsMonthly?.percentUsed).toBe(10);
  });

  it("maps totalCents to dollars", () => {
    const [reading] = parsePaste(JSON.stringify({ grokBotWeekly: { percentUsed: 10, totalCents: 250 } }));
    expect(reading.tanks.grokBotWeekly?.spendUsd).toBe(2.5);
  });
});
