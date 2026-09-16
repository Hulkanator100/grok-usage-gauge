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
