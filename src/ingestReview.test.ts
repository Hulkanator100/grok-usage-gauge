import { describe, expect, it } from "vitest";
import { buildExampleWeek } from "./examples";
import { buildIngestReview, diffTankMetrics, tankMetricLabel } from "./ingestReview";
import type { Reading } from "./types";

describe("ingest review diffs", () => {
  it("reports no metric change when the store is unchanged", () => {
    const week = buildExampleWeek(new Date("2026-09-16T18:00:00Z"));
    const changes = diffTankMetrics(week, week);
    expect(changes.every((c) => !c.changed)).toBe(true);
  });

  it("flags tanks whose latest % moved after an append", () => {
    const before = buildExampleWeek(new Date("2026-09-16T18:00:00Z"));
    const extra: Reading = {
      id: "later",
      capturedAt: "2026-09-16T20:00:00.000Z",
      source: "paste",
      tanks: { grokBotWeekly: { percentUsed: 90 } },
    };
    const after = [...before, extra];
    const changes = diffTankMetrics(before, after);
    const bot = changes.find((c) => c.tank === "grokBotWeekly")!;
    expect(bot.changed).toBe(true);
    expect(bot.afterLabel).toContain("90.0% used");
    expect(changes.find((c) => c.tank === "onDemandMonthly")?.changed).toBe(false);
  });

  it("builds a confirmation with submitted stamps and a change count", () => {
    const before: Reading[] = [];
    const after = buildExampleWeek(new Date("2026-09-16T18:00:00Z"));
    const review = buildIngestReview({
      before,
      after,
      added: after,
      sourceLabel: "Example week",
      names: "bundled demo",
      summary: "Loaded example week",
      submittedAt: "2026-09-17T00:30:00.000Z",
    });
    expect(review.addedCount).toBe(2);
    expect(review.changedCount).toBeGreaterThan(0);
    expect(review.stamps.length).toBe(2);
    expect(tankMetricLabel({ percentUsed: 20, spendUsd: 1 })).toContain("80.0% remaining");
  });
});
