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

describe("Cursor Spending dashboard screenshot text", () => {
  it("reads Pro+ Cursor Models 7%, Other Models 8%, Bot week 80% resetting in hours, on-demand off", () => {
    const text = `Spending
CURRENT PLAN
Pro+ $60/mo
Usage limits reset on Oct 10 (24 days left)
Included in Pro+
Cursor Models Includes Cursor Grok and Composer
7% used
Other Models
8% used
Grok Bot
Included in Pro+
Weekly usage
80% used
Resets Sep 17 (21 hours and 26 minutes left)
On-Demand Usage
On-demand spending is currently disabled
Monthly Limit Disabled`;
    const p = parseUsageText(text, "2026-09-16T19:00:00.000Z");
    expect(p.tanks.cursorModelsMonthly?.percentUsed).toBe(7);
    expect(p.tanks.otherModelsMonthly?.percentUsed).toBe(8);
    expect(p.tanks.grokBotWeekly?.percentUsed).toBe(80);
    expect(p.planHint).toBe("proPlus");
    expect(p.onDemandDisabled).toBe(true);
    expect(p.tanks.onDemandMonthly?.capUsd).toBe(0);
    const end = p.tanks.grokBotWeekly?.periodEnd;
    expect(end).toBeDefined();
    const hours = (new Date(end!).getTime() - Date.parse("2026-09-16T19:00:00.000Z")) / 3_600_000;
    expect(hours).toBeGreaterThan(20);
    expect(hours).toBeLessThan(23);
    expect(p.tanks.cursorModelsMonthly?.periodEnd).toContain("2026-10-10");
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

describe("Cursor dashboard Usage token chart", () => {
  it("ingests Total/Included/On-demand tokens without treating them as tank %", () => {
    const text = `Usage
Sep 10 - Sep 16
Total tokens
108.1M
Included
104.3M
On-demand
0
Your usage per day across this billing period
Cumulative Tokens
Group By Model
Export CSV
Date (UTC) Type Model Tokens Cost
cursor-grok-4.6-high-fast
cursor-grok-4.6-medium
claude-4.5-sonnet
gemini-3.1-pro
Spending
Pro+`;
    const p = parseUsageText(text, CAPTURE);
    expect(p.surface).toBe("cursor-usage-dashboard");
    expect(p.fillsTank).toBe(true);
    expect(p.planHint).toBe("proPlus");
    expect(p.tanks.cursorModelsMonthly?.tokenTotals?.total).toBeCloseTo(104.3e6);
    expect(p.tanks.cursorModelsMonthly?.percentUsed).toBeUndefined();
    expect(p.tanks.onDemandMonthly?.tokenTotals?.total).toBe(0);
    expect(p.tanks.onDemandMonthly?.spendUsd).toBe(0);
    expect(p.notes.join(" ")).toMatch(/not Spending %/i);
    expect(p.notes.join(" ")).toMatch(/claude-4.5-sonnet/);
  });

  it("reads OCR that puts Total tokens Included On-demand on one line then 108.1M 104.3M 0", () => {
    const ocr = `@ Overview Usage
Sep10-Sep16 1d 7d 30d MTD Lastmonth
Total tokens Included On-demand
8 Plugins & MCPs
. 108.1M 104.3M 0
Your usage per day across this billing period
Export CSV
Date (UTC) Type Model Tokens Cost
cursor-grok-4.6-high-fast cursor-grok-4.6-medium claude-4.5-sonnet
Pro+`;
    const p = parseUsageText(ocr, CAPTURE);
    expect(p.surface).toBe("cursor-usage-dashboard");
    expect(p.tanks.onDemandMonthly?.spendUsd).toBe(0);
    expect(p.tanks.onDemandMonthly?.tokenTotals?.total).toBe(0);
    expect(p.tanks.cursorModelsMonthly?.tokenTotals?.total).toBeCloseTo(104.3e6);
    expect(p.tanks.cursorModelsMonthly?.percentUsed).toBeUndefined();
  });

  it("does not 403-style fail paste of the Usage chart", () => {
    const text = `Total tokens 108.1M
Included 104.3M
On-demand 0
Your usage per day
Export CSV
Date (UTC)
cursor-grok-4.6-medium`;
    const readings = parsePaste(text, CAPTURE);
    expect(readings[0]?.surface).toBe("cursor-usage-dashboard");
    expect(readings[0]?.tanks.onDemandMonthly?.spendUsd).toBe(0);
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

describe("file ingest output", () => {
  it("fills tanks from a chosen Settings-usage text file", async () => {
    const file = new File(
      [
        `Weekly usage 72%\nResets in 2 days\nOn-demand usage\nBilled through Cursor\n$0.00\nOn-demand monthly limit $20\n`,
      ],
      "grok-bot-settings-usage.txt",
      { type: "text/plain" },
    );
    const result = await ingestFile(file, CAPTURE);
    expect(result.error).toBeUndefined();
    expect(result.readings[0]?.tanks.grokBotWeekly?.percentUsed).toBe(72);
    expect(result.extracted).toMatch(/Weekly usage 72%/);
  });
});
