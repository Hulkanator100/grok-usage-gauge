import { describe, expect, it } from "vitest";
import { formatRequestCap, formatUsdCap, fuelNeedleDeg, renderApp, renderHistoryInstrument, xPlanOptionLabel } from "./ui";
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
    expect(html).toContain("remain-line");
    expect(html).toContain(" remaining");
    expect(html).toContain(" used");
    expect(html).toContain('fill="url(#face-body-grokBotWeekly)"');
    expect(html).toContain("face-amber-");
    expect(html).toContain("spark-wash");
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
    expect(html).toMatch(/unknown-needle" data-empty="true" style="--needle:-90\.0deg"/);
    expect(html.match(/class="needle-g"/g)?.length).toBe(7);
    expect(html.match(/class="needle-g" transform="rotate/g)).toBeNull();
    expect(html).toContain("remain-line");
    expect(html).toContain("— remaining");
    expect(html).toContain("— used");
  });

  it("paints gauge faces and spark plots with the page charcoal-amber wash", () => {
    const html = renderApp({
      readings: buildExampleWeek(new Date("2026-09-16T18:00:00Z")),
      settings: DEFAULT_SETTINGS,
      paste: "",
      capturedAtLocal: "2026-09-16T18:00",
    });
    expect(html).toContain('fill="url(#face-body-grokBotWeekly)"');
    expect(html).toContain("face-amber-grokBotWeekly");
    expect(html).toContain("face-star-grokBotWeekly");
    expect(html).toContain("spark-wash");
    expect(html).toContain("id=\"spark-grokBotWeekly-amber\"");
  });
});

describe("local controls sliders", () => {
  it("shows grouped sliders with live numeral outputs", () => {
    const html = renderApp({
      readings: [],
      settings: DEFAULT_SETTINGS,
      paste: "",
      capturedAtLocal: "2026-09-16T18:00",
    });
    expect(html).toContain("app-tabs");
    expect(html).toContain("about-foot");
    expect(html).toContain("How this gauge works");
    expect(html).toContain("lede-short");
    expect(html).toMatch(/id="panel-add"[^>]*hidden/);
    expect(html).toContain("sample-io");
    expect(html).toContain("save-panel");
    expect(html).toContain("Choose files");
    expect(html).toContain("1 · Timestamp");
    expect(html).toContain("2 · Drop or choose a file");
    expect(html).toContain("3 · Or paste text");
    expect(html).toContain("same-day dump of older shots");
    expect(html).toContain("file-input-hidden");
    expect(html).toContain("Inputs · write the tanks");
    expect(html).toContain("Outputs · copy or wipe this browser");
    expect(html).toContain("io-k");
    expect(html).toContain("Load example week");
    expect(html).toContain("Cursor month");
    expect(html).toContain("X Grok · 2-hour windows");
    expect(html).toContain('id="ondemand-cap" type="range"');
    expect(html).toContain('id="ondemand-cap-out"');
    expect(html).toContain("$20.00");
    expect(html).toContain("100 req");
    expect(html).toContain("Light 100 / Medium 30 / Heavy 10 per 2h");
    expect(html).toContain("Light (Fast) 100");
    expect(html).toContain("Medium (Think) 30");
    expect(html).not.toContain("· L ");
    expect(html).not.toContain('id="custom-other"');
  });

  it("exposes a custom Other Models slider only on the custom plan", () => {
    const html = renderApp({
      readings: [],
      settings: { ...DEFAULT_SETTINGS, plan: "custom", customOtherModelsUsd: 75 },
      paste: "",
      capturedAtLocal: "2026-09-16T18:00",
    });
    expect(html).toContain('id="custom-other" type="range"');
    expect(html).toContain("$75.00");
  });

  it("formats slider numerals for USD caps and request windows", () => {
    expect(formatUsdCap(0, true)).toBe("$0 hard stop");
    expect(formatUsdCap(20, true)).toBe("$20.00");
    expect(formatRequestCap(30)).toBe("30 req");
    expect(xPlanOptionLabel("premiumPlus")).toBe("Premium+ — Light 100 / Medium 30 / Heavy 10 per 2h");
    expect(xPlanOptionLabel("free")).toBe("Free — Light 20 / Medium 10 / Heavy 5 per 2h");
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
