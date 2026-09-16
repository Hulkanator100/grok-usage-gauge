import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { computeTankMetrics } from "./metrics";
import { parsePaste } from "./parsePaste";
import {
  classifyUsageEvent,
  parseCostUsd,
  parseUsageEventsCsv,
  UNFINISHED_CHROME_DOWNLOAD_MESSAGE,
} from "./parseUsageCsv";

const samplePath = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "usage-events-2026-09-16.csv");
const sampleCsv = readFileSync(samplePath, "utf8");

describe("cost labels", () => {
  it("treats Included, Free, and dash as $0 charged", () => {
    expect(parseCostUsd("Included")).toBe(0);
    expect(parseCostUsd("Free")).toBe(0);
    expect(parseCostUsd("-")).toBe(0);
    expect(parseCostUsd("$0.80")).toBe(0.8);
  });
});

describe("classification", () => {
  it("keeps grok-bot-* on the Bot week tank, not Cursor Models", () => {
    expect(classifyUsageEvent("Included", "grok-bot-default")).toBe("grokBotWeekly");
    expect(classifyUsageEvent("Included", "grok-bot-automation")).toBe("grokBotWeekly");
    expect(classifyUsageEvent("Included", "grok-bot-cua")).toBe("grokBotWeekly");
    expect(classifyUsageEvent("Included", "grok-4.6")).toBe("cursorModelsMonthly");
    expect(classifyUsageEvent("Included", "composer-2")).toBe("cursorModelsMonthly");
    expect(classifyUsageEvent("Included", "claude-4-sonnet")).toBe("otherModelsMonthly");
    expect(classifyUsageEvent("On-Demand", "grok-4.6")).toBe("onDemandMonthly");
    expect(classifyUsageEvent("Usage-based", "claude-4-sonnet")).toBe("onDemandMonthly");
  });
});

describe("empty Chrome crdownload", () => {
  it("errors clearly instead of inventing rows", () => {
    expect(() =>
      parseUsageEventsCsv("", {
        fileName: "usage-events-2026-09-16 (1).csv.crdownload",
        byteLength: 0,
      }),
    ).toThrow(UNFINISHED_CHROME_DOWNLOAD_MESSAGE);
  });
});

describe("bundled Sep 2026 usage-events CSV", () => {
  it("matches headers by name even with Cloud Agent ID extra columns", () => {
    const readings = parseUsageEventsCsv(sampleCsv, { fileName: "usage-events-2026-09-16.csv" });
    expect(readings.length).toBeGreaterThanOrEqual(2);
    expect(readings.map((r) => r.capturedAt.slice(0, 10))).toEqual([
      "2026-09-12",
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
    ]);

    const last = readings[readings.length - 1];
    expect(last.tanks.grokBotWeekly?.spendUsd).toBeCloseTo(3.65, 5);
    expect(last.tanks.grokBotWeekly?.mixCents?.["grok-bot-default"]).toBe(230);
    expect(last.tanks.grokBotWeekly?.mixCents?.["grok-bot-automation"]).toBe(115);
    expect(last.tanks.grokBotWeekly?.mixCents?.["grok-bot-cua"]).toBe(20);
    expect(last.tanks.cursorModelsMonthly?.spendUsd).toBeCloseTo(4.35, 5);
    expect(last.tanks.otherModelsMonthly?.spendUsd).toBeCloseTo(2.15, 5);
    expect(last.tanks.onDemandMonthly?.spendUsd).toBeCloseTo(1.15, 5);
    expect(last.tanks.grokBotWeekly?.percentUsed).toBeUndefined();
    expect(last.tanks.cursorModelsMonthly?.percentUsed).toBeUndefined();
  });

  it("does not put grok-bot spend or on-demand grok-4.6 into Cursor Models", () => {
    const readings = parseUsageEventsCsv(sampleCsv);
    const day15 = readings.find((r) => r.capturedAt.startsWith("2026-09-15"))!;
    expect(day15.tanks.cursorModelsMonthly?.spendUsd).toBeCloseTo(3.35, 5);
    expect(day15.tanks.onDemandMonthly?.spendUsd).toBeCloseTo(0.35, 5);
  });

  it("derives Other Models and on-demand % from plan/cap and unlocks 2+ burn", () => {
    const readings = parseUsageEventsCsv(sampleCsv);
    const now = new Date("2026-09-16T18:00:00Z");
    const other = computeTankMetrics({
      kind: "month",
      snapshots: readings
        .filter((r) => r.tanks.otherModelsMonthly)
        .map((r) => ({ capturedAt: r.capturedAt, snap: r.tanks.otherModelsMonthly! })),
      now,
      fallbackCapUsd: 20,
    });
    expect(other.percentUsed).toBeCloseTo(10.75, 5);
    expect(other.emptyAt).toBeDefined();

    const demand = computeTankMetrics({
      kind: "cap",
      snapshots: readings
        .filter((r) => r.tanks.onDemandMonthly)
        .map((r) => ({ capturedAt: r.capturedAt, snap: r.tanks.onDemandMonthly! })),
      now,
      fallbackCapUsd: 20,
    });
    expect(demand.percentUsed).toBeCloseTo(5.75, 5);
    expect(demand.emptyAt).toBeDefined();
  });
});

describe("paste CSV", () => {
  it("parses usage-events CSV from the paste box", () => {
    const readings = parsePaste(sampleCsv);
    expect(readings.length).toBe(5);
    expect(readings[0].source).toBe("paste");
  });
});
