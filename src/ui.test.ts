import { describe, expect, it } from "vitest";
import { fuelNeedleDeg, renderApp, renderHistoryInstrument } from "./ui";
import { buildAcceleratingWeek, buildExampleWeek } from "./examples";
import { DEFAULT_SETTINGS } from "./types";

describe("analog fuel needle", () => {
  it("points at F when unused, at E when empty, and at E when there is no reading", () => {
    expect(fuelNeedleDeg(0)).toBe(90);
    expect(fuelNeedleDeg(100)).toBe(-90);
    expect(fuelNeedleDeg(50)).toBe(0);
    expect(fuelNeedleDeg(undefined)).toBe(-90);
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
    expect(needles).toHaveLength(7);
    expect(needles[0]).toBeCloseTo(fuelNeedleDeg(67.9), 1);
    expect(needles[3]).toBeCloseTo(90, 1);
    expect(needles[0]).toBeLessThan(needles[1]);
  });

  it("parks every gauge at E when there are no readings", () => {
    const html = renderApp({
      readings: [],
      settings: DEFAULT_SETTINGS,
      paste: "",
      capturedAtLocal: "2026-09-16T18:00",
    });
    expect(html).toMatch(/unknown-needle" style="--needle:-90(?:\.0)?deg"/);
    const needles = [...html.matchAll(/class="needle-g" transform="rotate\(([-0-9.]+) 100 100\)"/g)].map((m) =>
      Number(m[1]),
    );
    expect(needles.length).toBe(7);
    expect(needles.every((d) => d === -90)).toBe(true);
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
    expect(html).toContain("Cursor remaining-fuel traces over the captured period");
    expect(html).toContain("X Grok request windows");
    expect(html).toContain('class="spark"');
    expect(html).toContain("Unpublished estimate");
    expect(html.match(/class="instrument-card"/g)?.length).toBeGreaterThanOrEqual(7);
    const accel = renderHistoryInstrument(
      buildAcceleratingWeek(new Date("2026-09-16T18:00:00Z")),
      DEFAULT_SETTINGS,
    );
    expect(accel).toContain("remaining →");
    expect((accel.match(/overlay-line/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
