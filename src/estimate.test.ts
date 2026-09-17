import { describe, expect, it } from "vitest";
import { estimateAllTanks, estimateTank, median, splitEras } from "./estimate";
import { buildExampleWeek } from "./examples";
import type { Reading } from "./types";
import { DEFAULT_SETTINGS } from "./types";

describe("unpublished metric estimator", () => {
  it("median of an odd list is the middle value", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("splits a new era when values jump and stay there", () => {
    const eras = splitEras([
      { t: 1, value: 7 },
      { t: 2, value: 7.1 },
      { t: 3, value: 12 },
      { t: 4, value: 12.2 },
    ]);
    expect(eras).toHaveLength(2);
    expect(median(eras[0].map((p) => p.value))).toBeCloseTo(7.05, 2);
    expect(median(eras[1].map((p) => p.value))).toBeCloseTo(12.1, 2);
  });

  it("estimates Bot-week implied $ from the example week and does not mix X caps into it", () => {
    const readings = buildExampleWeek(new Date("2026-09-16T18:00:00Z"));
    const bot = estimateTank(readings, "grokBotWeekly");
    expect(bot.unit).toBe("usd");
    expect(bot.sampleCount).toBe(2);
    expect(bot.estimate).toBeCloseTo(7, 0);
    const light = estimateTank(readings, "xGrokLight", DEFAULT_SETTINGS.xLightCap);
    expect(light.unit).toBe("requests");
    expect(light.estimate).toBe(100);
    expect(light.tank).not.toBe(bot.tank);
  });

  it("flags a backend grant change after a new cluster", () => {
    const readings: Reading[] = [
      {
        id: "a",
        capturedAt: "2026-09-01T00:00:00Z",
        source: "paste",
        tanks: { grokBotWeekly: { percentUsed: 50, spendUsd: 3.5 } },
      },
      {
        id: "b",
        capturedAt: "2026-09-08T00:00:00Z",
        source: "paste",
        tanks: { grokBotWeekly: { percentUsed: 80, spendUsd: 5.6 } },
      },
      {
        id: "c",
        capturedAt: "2026-09-15T00:00:00Z",
        source: "paste",
        tanks: { grokBotWeekly: { percentUsed: 40, spendUsd: 4.8 } },
      },
      {
        id: "d",
        capturedAt: "2026-09-16T00:00:00Z",
        source: "paste",
        tanks: { grokBotWeekly: { percentUsed: 60, spendUsd: 7.2 } },
      },
    ];
    const bot = estimateTank(readings, "grokBotWeekly");
    expect(bot.previousEra).toBeCloseTo(7, 1);
    expect(bot.estimate).toBeCloseTo(12, 1);
    expect(bot.changedAt).toBeDefined();
    const all = estimateAllTanks(readings, {});
    expect(all.find((e) => e.tank === "grokBotWeekly")?.changedAt).toBeDefined();
  });
});
