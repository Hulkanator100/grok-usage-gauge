import { describe, expect, it } from "vitest";
import { ingestFile } from "./ingestDrop";
import { parseStoredStateJson } from "./storage";

describe("history JSON backup", () => {
  it("parses a downloaded grok-usage-gauge state file", () => {
    const raw = JSON.stringify({
      version: 1,
      readings: [
        {
          id: "r1",
          capturedAt: "2026-09-16T12:00:00.000Z",
          tanks: { grokBotWeekly: { percentUsed: 40 } },
          source: "screenshot",
        },
      ],
      settings: { plan: "proPlus", customOtherModelsUsd: 70, onDemandCapUsd: 0 },
    });
    const state = parseStoredStateJson(raw);
    expect(state?.readings).toHaveLength(1);
    expect(state?.settings.plan).toBe("proPlus");
    expect(state?.settings.onDemandCapUsd).toBe(0);
  });

  it("restores that file on ingest instead of treating it as a paste", async () => {
    const raw = JSON.stringify({
      version: 1,
      readings: [
        {
          id: "r1",
          capturedAt: "2026-09-16T12:00:00.000Z",
          tanks: { onDemandMonthly: { spendUsd: 0 } },
          source: "drop",
        },
      ],
      settings: { plan: "pro", customOtherModelsUsd: 20, onDemandCapUsd: 20 },
    });
    const file = new File([raw], "grok-usage-gauge-2026-09-16.json", { type: "application/json" });
    const result = await ingestFile(file, "2026-09-16T19:00:00.000Z");
    expect(result.restored?.readings).toHaveLength(1);
    expect(result.notes.join(" ")).toMatch(/Restored 1/);
  });
});
