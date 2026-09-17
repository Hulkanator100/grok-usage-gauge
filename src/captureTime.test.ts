import { describe, expect, it } from "vitest";
import {
  parseEmbeddedCaptureTime,
  parseFilenameCaptureTime,
  parseTiffExifDate,
  resolveFileCapturedAt,
} from "./captureTime";

describe("parseEmbeddedCaptureTime", () => {
  it("prefers an explicit captured-at line over a later reset date", () => {
    const text = `Captured at 2026-09-10T16:09:00Z\nWeekly usage 61%\nResets 2026-09-17`;
    expect(parseEmbeddedCaptureTime(text)?.slice(0, 10)).toBe("2026-09-10");
  });

  it("ignores reset-only dates so period end is not treated as the snapshot time", () => {
    expect(parseEmbeddedCaptureTime("Resets 2026-09-17T00:00:00Z\nWeekly usage 61%")).toBeUndefined();
  });

  it("reads a named screenshot date", () => {
    expect(parseEmbeddedCaptureTime("As of Sep 8, 2026 4:09 PM\n61% used")?.slice(0, 10)).toBe("2026-09-08");
  });
});

describe("parseFilenameCaptureTime", () => {
  it("reads macOS screenshot names and compact camera names", () => {
    expect(parseFilenameCaptureTime("Screenshot 2026-09-10 at 4.09.15 PM.png")?.slice(0, 10)).toBe("2026-09-10");
    expect(parseFilenameCaptureTime("IMG_20260908_160915.jpg")?.slice(0, 10)).toBe("2026-09-08");
  });
});

describe("parseTiffExifDate", () => {
  it("reads DateTime ASCII from a little-endian TIFF IFD", () => {
    const buf = new Uint8Array(64);
    buf[0] = 0x49;
    buf[1] = 0x49;
    buf[2] = 0x2a;
    buf[4] = 8;
    buf[8] = 1;
    buf[10] = 0x32;
    buf[11] = 0x01;
    buf[12] = 2;
    buf[14] = 20;
    buf[18] = 26;
    const date = "2026:09:10 16:09:15";
    for (let i = 0; i < date.length; i++) buf[26 + i] = date.charCodeAt(i);
    expect(parseTiffExifDate(buf)?.slice(0, 13)).toBe("2026-09-10T16");
  });
});

describe("resolveFileCapturedAt", () => {
  it("uses each file's lastModified so a same-day drop still spans older days", async () => {
    const older = new File(["Weekly usage 40%"], "week-a.txt", {
      type: "text/plain",
      lastModified: Date.parse("2026-09-01T12:00:00Z"),
    });
    const newer = new File(["Weekly usage 80%"], "week-b.txt", {
      type: "text/plain",
      lastModified: Date.parse("2026-09-14T12:00:00Z"),
    });
    const fallback = "2026-09-16T23:00:00.000Z";
    const a = await resolveFileCapturedAt(older, await older.text(), fallback);
    const b = await resolveFileCapturedAt(newer, await newer.text(), fallback);
    expect(a.iso.slice(0, 10)).toBe("2026-09-01");
    expect(b.iso.slice(0, 10)).toBe("2026-09-14");
    expect(a.source).toBe("file-date");
    expect(b.source).toBe("file-date");
  });

  it("lets filename dates win when the copy's lastModified is today", async () => {
    const file = new File(["Light 10/100"], "Screenshot 2026-09-04 at 1.00.00 PM.png.txt", {
      type: "text/plain",
      lastModified: Date.parse("2026-09-16T23:00:00Z"),
    });
    const stamp = await resolveFileCapturedAt(file, await file.text(), "2026-09-16T23:00:00.000Z");
    expect(stamp.iso.slice(0, 10)).toBe("2026-09-04");
    expect(stamp.source).toBe("filename");
  });
});

describe("ingestFile capture stamp", () => {
  it("does not stamp two older drops as today", async () => {
    const { ingestFile } = await import("./ingestDrop");
    const early = new File(
      ["Usage & Billing\nWeekly usage 20%\nResets in 6 days"],
      "bot-early.txt",
      { type: "text/plain", lastModified: Date.parse("2026-09-03T12:00:00Z") },
    );
    const late = new File(
      ["Usage & Billing\nWeekly usage 80%\nResets in 1 day"],
      "bot-late.txt",
      { type: "text/plain", lastModified: Date.parse("2026-09-12T12:00:00Z") },
    );
    const today = "2026-09-16T23:00:00.000Z";
    const a = await ingestFile(early, today);
    const b = await ingestFile(late, today);
    expect(a.readings[0]?.capturedAt.slice(0, 10)).toBe("2026-09-03");
    expect(b.readings[0]?.capturedAt.slice(0, 10)).toBe("2026-09-12");
  });
});
