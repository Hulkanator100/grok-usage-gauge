import { describe, expect, it } from "vitest";
import { historyPoints, polylineRemaining, timeWindow } from "./chart";
import { buildExampleWeek } from "./examples";
import { DEFAULT_SETTINGS, TANK_IDS } from "./types";

describe("history instrument", () => {
  it("plots remaining fuel over time without summing tanks", () => {
    const readings = buildExampleWeek(new Date("2026-09-16T18:00:00Z"));
    const bot = historyPoints(readings, "grokBotWeekly", DEFAULT_SETTINGS);
    const onDemand = historyPoints(readings, "onDemandMonthly", DEFAULT_SETTINGS);
    expect(bot.length).toBe(2);
    expect(bot[1].remaining).toBeLessThan(bot[0].remaining);
    expect(onDemand.every((p) => p.used === 0)).toBe(true);
    const path = polylineRemaining(bot, 200, 80);
    expect(path.startsWith("M")).toBe(true);
    expect(path.includes(" L")).toBe(true);
  });

  it("shares one period window across four traces", () => {
    const readings = buildExampleWeek(new Date("2026-09-16T18:00:00Z"));
    const series = TANK_IDS.map((id) => historyPoints(readings, id, DEFAULT_SETTINGS));
    const win = timeWindow(series);
    expect(win).toBeDefined();
    const bot = polylineRemaining(series[0], 400, 160, 28, 16, win);
    const cursor = polylineRemaining(series[1], 400, 160, 28, 16, win);
    expect(bot).not.toBe(cursor);
    expect(bot.split(" ").length).toBe(2);
  });
});
