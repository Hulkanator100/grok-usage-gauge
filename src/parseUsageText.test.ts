import { describe, expect, it } from "vitest";
import { parseUsageText } from "./parseUsageText";
import { parsePaste } from "./parsePaste";
import { ingestFile } from "./ingestDrop";

const CAPTURE = "2026-09-16T19:00:00.000Z";

describe("Grok Bot surfaces", () => {
  it("parses Settings → Usage & Billing weekly % and on-demand billed through Cursor", () => {
    const text = `Usage & Billing
Weekly usage 61.4%
Resets in 2 days
On-demand usage
Billed through Cursor
$2.10
On-demand monthly limit $20`;
    const p = parseUsageText(text, CAPTURE);
    expect(p.surface).toBe("grok-bot-settings");
    expect(p.tanks.grokBotWeekly?.percentUsed).toBe(61.4);
    expect(p.tanks.onDemandMonthly?.spendUsd).toBe(2.1);
    expect(p.tanks.onDemandMonthly?.capUsd).toBe(20);
    expect(p.fillsTank).toBe(true);
  });

  it("parses the chat limit banner as 100% Bot week", () => {
    const p = parseUsageText(
      `You've reached your Grok Bot usage limit. It resets in 3 days.\nWeekly usage 100%`,
      CAPTURE,
    );
    expect(p.surface).toBe("grok-bot-chat-banner");
    expect(p.tanks.grokBotWeekly?.percentUsed).toBe(100);
  });

  it("does not fill a tank from routine run history", () => {
    const p = parseUsageText(
      `Routines\nRun history\nNo runs yet\nCopy request ID\ngrok-bot-automation`,
      CAPTURE,
    );
    expect(p.surface).toBe("grok-bot-routines");
    expect(p.fillsTank).toBe(false);
  });
});

describe("Cursor surfaces", () => {
  it("parses Spending screenshot text into separate model tanks", () => {
    const p = parseUsageText(
      `Spending
Cursor Models 28% used
Other Models 9% used
On-demand $0 of $20
Resets Oct 1, 2026`,
      CAPTURE,
    );
    expect(p.surface).toBe("cursor-spending");
    expect(p.tanks.cursorModelsMonthly?.percentUsed).toBe(28);
    expect(p.tanks.otherModelsMonthly?.percentUsed).toBe(9);
    expect(p.tanks.onDemandMonthly?.capUsd).toBe(20);
  });

  it("parses CLI /usage copy", () => {
    const p = parseUsageText(
      `/usage
Included usage
Auto 22%
API 7%
On-demand $1.50 / $20
Plan Pro
Billing cycle reset Oct 1, 2026`,
      CAPTURE,
      "cli-usage.txt",
    );
    expect(p.surface).toBe("cursor-cli");
    expect(p.tanks.cursorModelsMonthly?.percentUsed).toBe(22);
    expect(p.tanks.otherModelsMonthly?.percentUsed).toBe(7);
  });

  it("refuses to mix grok.com SuperGrok usage into Cursor tanks", () => {
    const p = parseUsageText(
      `grok.com Settings → Usage
Chat 40%
Imagine 10%
Extra Usage $8
product split`,
      CAPTURE,
      "grok.com-usage.png",
    );
    expect(p.surface).toBe("grok-com");
    expect(p.fillsTank).toBe(false);
  });
});

describe("paste of screenshot-like text", () => {
  it("saves a Bot-week reading from unstructured Usage text", () => {
    const [r] = parsePaste(`Weekly usage 40%\nResets in 4 days\nBilled through Cursor\nOn-demand $0 of $0`);
    expect(r.tanks.grokBotWeekly?.percentUsed).toBe(40);
    expect(r.tanks.onDemandMonthly?.capUsd).toBe(0);
  });
});

describe("unfinished Chrome download", () => {
  it("rejects empty .crdownload", async () => {
    const file = new File([], "usage-events-2026-09-16 (1).csv.crdownload", { type: "text/csv" });
    const result = await ingestFile(file, CAPTURE);
    expect(result.error).toMatch(/unfinished Chrome download/i);
    expect(result.readings).toHaveLength(0);
  });
});
