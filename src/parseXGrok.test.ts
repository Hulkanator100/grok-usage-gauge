import { describe, expect, it } from "vitest";
import { parseXGrokWindows, looksLikeXGrokUsage } from "./parseXGrok";
import { parseUsageText } from "./parseUsageText";
import { parsePaste } from "./parsePaste";

const CAPTURE = "2026-09-16T19:00:00.000Z";

describe("X Grok Light/Medium/Heavy windows", () => {
  it("parses request counts without filling Cursor tanks", () => {
    const text = `Grok on X
Light 42 / 100 requests
Medium 11 / 30
Heavy 2 / 10
Resets in 1 hour 18 minutes`;
    expect(looksLikeXGrokUsage(text)).toBe(true);
    const p = parseUsageText(text, CAPTURE);
    expect(p.surface).toBe("x-grok-windows");
    expect(p.tanks.xGrokLight?.requestUsed).toBe(42);
    expect(p.tanks.xGrokLight?.requestCap).toBe(100);
    expect(p.tanks.xGrokMedium?.requestUsed).toBe(11);
    expect(p.tanks.xGrokHeavy?.requestUsed).toBe(2);
    expect(p.tanks.grokBotWeekly).toBeUndefined();
    expect(p.tanks.cursorModelsMonthly).toBeUndefined();
    const end = Date.parse(p.tanks.xGrokLight!.periodEnd!);
    expect(end - Date.parse(CAPTURE)).toBeCloseTo((1 * 60 + 18) * 60_000, -2);

    const [reading] = parsePaste(text, CAPTURE);
    expect(reading.tanks.xGrokLight?.requestUsed).toBe(42);
    expect(reading.tanks.grokBotWeekly).toBeUndefined();
  });

  it("uses remaining + fallback cap", () => {
    const tanks = parseXGrokWindows(
      `Light 8 remaining
Medium 3 remaining of 30
Heavy 0 / 10
x.com 2 hour window`,
      CAPTURE,
      "premiumPlus",
      { light: 100, medium: 30, heavy: 10 },
    );
    expect(tanks.xGrokLight?.requestUsed).toBe(92);
    expect(tanks.xGrokLight?.requestCap).toBe(100);
    expect(tanks.xGrokMedium?.requestUsed).toBe(27);
    expect(tanks.xGrokHeavy?.requestUsed).toBe(0);
  });
});
