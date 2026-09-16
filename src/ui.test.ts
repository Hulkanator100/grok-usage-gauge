import { describe, expect, it } from "vitest";
import { fuelNeedleDeg, renderApp, renderHistoryInstrument } from "./ui";
import { buildAcceleratingWeek, buildExampleWeek } from "./examples";
import { DEFAULT_SETTINGS } from "./types";

describe("analog fuel needle", () => {
  it("points at F when unused and at E when empty", () => {
    expect(fuelNeedleDeg(0)).toBe(90);
    expect(fuelNeedleDeg(100)).toBe(-90);
    expect(fuelNeedleDeg(50)).toBe(0);
  });

  it("draws a red pointer whose rotation follows remaining fuel", () => {
    const html = renderApp({
      readings: buildExampleWeek(new Date("2026-09-16T18:00:00Z")),
      settings: DEFAULT_SETTINGS,
      paste: "",
      capturedAtLocal: "2026-09-16T18:00",
    });
    expect(html).toContain('class="needle"');
    expect(html).toContain('fill="#e10600"');
    const needles = [...html.matchAll(/class="needle-g" transform="rotate\(([-0-9.]+) 100 100\)"/g)].map((m) =>
      Number(m[1]),
    );
    expect(needles).toHaveLength(4);
    expect(needles[0]).toBeCloseTo(fuelNeedleDeg(67.9), 1);
    expect(needles[3]).toBeCloseTo(90, 1);
    expect(needles[0]).toBeLessThan(needles[1]);
  });
});

describe("history instrument", () => {
  it("renders four separate traces next to analog gauges", () => {
    const html = renderApp({
      readings: buildExampleWeek(new Date("2026-09-16T18:00:00Z")),
      settings: DEFAULT_SETTINGS,
      paste: "",
      capturedAtLocal: "2026-09-16T18:00",
    });
    expect(html).toContain("History instrument");
    expect(html).toContain("Four remaining-fuel traces over the captured period");
    expect(html).toContain('class="spark"');
    expect(html.match(/class="instrument-card"/g)?.length).toBe(4);
    const accel = renderHistoryInstrument(
      buildAcceleratingWeek(new Date("2026-09-16T18:00:00Z")),
      DEFAULT_SETTINGS,
    );
    expect(accel).toContain("remaining →");
    expect((accel.match(/overlay-line/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
