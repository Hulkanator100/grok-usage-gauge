import { parsePaste } from "./parsePaste";
import {
  looksLikeUsageEventsCsv,
  parseUsageEventsCsv,
  UNFINISHED_CHROME_DOWNLOAD_MESSAGE,
} from "./parseUsageCsv";
import { parseUsageText, readingFromParsed } from "./parseUsageText";
import { parseStoredStateJson } from "./storage";
import { DEFAULT_SETTINGS, type AppSettings, type Reading, type StoredState } from "./types";

const IMAGE_RE = /^image\//;
const TEXTISH = /^(text\/|application\/(json|csv|xml))/;

export interface IngestResult {
  readings: Reading[];
  extracted: string;
  notes: string[];
  error?: string;
  planHint?: "pro" | "proPlus" | "ultra";
  restored?: StoredState;
}

function isCrdownload(file: File): boolean {
  return /\.crdownload\b/i.test(file.name) || /\.part$/i.test(file.name);
}

function isUnfinishedDownload(file: File): boolean {
  return file.size === 0 || (isCrdownload(file) && file.size === 0);
}

function unfinishedError(file: File): string {
  if (isCrdownload(file) || /\.csv/i.test(file.name)) return UNFINISHED_CHROME_DOWNLOAD_MESSAGE;
  return `${file.name} is empty (0 bytes).`;
}

function isCsvLike(file: File, text: string): boolean {
  return (
    /\.csv(\.crdownload)?$/i.test(file.name) ||
    file.type === "text/csv" ||
    looksLikeUsageEventsCsv(text)
  );
}

async function readTextFile(file: File): Promise<string> {
  return file.text();
}

async function thumbnail(file: File): Promise<string | undefined> {
  if (!IMAGE_RE.test(file.type) && !/\.(png|jpe?g|webp|gif)$/i.test(file.name)) return undefined;
  try {
    const bitmap = await createImageBitmap(file);
    const max = 480;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return undefined;
  }
}

function ocrAsset(name: string): string {
  return new URL(`tesseract/${name}`, document.baseURI).href;
}

function sameOriginOcrOptions() {
  const base = ocrAsset("");
  return {
    logger: () => undefined,
    workerBlobURL: false as const,
    workerPath: `${base}worker.min.js`,
    corePath: `${base}core`,
    langPath: `${base}lang`,
    gzip: true,
    errorHandler: (err: unknown) => console.warn("ocr", err),
  };
}

type TessApi = { recognize: (image: File, langs: string, opts: ReturnType<typeof sameOriginOcrOptions>) => Promise<{ data: { text?: string } }> };

async function loadTesseract(): Promise<TessApi> {
  const href = ocrAsset("tesseract.esm.min.js");
  const probe = await fetch(href, { cache: "no-store" });
  if (!probe.ok) {
    throw new Error(
      `OCR files missing (${href} → ${probe.status}). Stop the server, run npm install, then npm run dev, and hard-refresh Edge (Ctrl+Shift+R).`,
    );
  }
  const mod = (await import(/* @vite-ignore */ href)) as { default?: TessApi } & TessApi;
  const api = mod.default ?? mod;
  if (typeof api.recognize !== "function") {
    throw new Error("OCR module loaded but recognize() is missing.");
  }
  return api;
}

export async function ocrImage(file: File): Promise<string> {
  const Tesseract = await loadTesseract();
  const result = await Tesseract.recognize(file, "eng", sameOriginOcrOptions());
  return result.data.text ?? "";
}

export async function ingestFile(
  file: File,
  capturedAt: string,
  settings: AppSettings = DEFAULT_SETTINGS,
): Promise<IngestResult> {
  if (isUnfinishedDownload(file)) {
    return {
      readings: [],
      extracted: "",
      notes: [],
      error: unfinishedError(file),
    };
  }

  const preview = await thumbnail(file);
  const isImage = IMAGE_RE.test(file.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
  const isText =
    TEXTISH.test(file.type) ||
    /\.(txt|md|json|csv|log|crdownload)$/i.test(file.name) ||
    file.type === "";

  let extracted = "";
  if (isImage) {
    try {
      extracted = (await ocrImage(file)).trim();
    } catch (err) {
      return {
        readings: [],
        extracted: "",
        notes: [],
        error: `Could not read text from ${file.name} (${err instanceof Error ? err.message : String(err)}). Keep the screenshot and type the % / reset / $ into the paste box.`,
      };
    }
  } else if (isText) {
    extracted = (await readTextFile(file)).trim();
  } else {
    return {
      readings: [],
      extracted: "",
      notes: [],
      error: `Unsupported file ${file.name}. Drop a screenshot (png/jpg/webp) or a text/JSON export related to usage.`,
    };
  }

  if (!extracted) {
    return {
      readings: [],
      extracted: "",
      notes: [],
      error: `No text in ${file.name}. If this is a screenshot, try a tighter crop of the usage meter.`,
    };
  }

  const restored = !isImage ? parseStoredStateJson(extracted) : undefined;
  if (restored) {
    return {
      readings: restored.readings,
      extracted,
      notes: [
        `Restored ${restored.readings.length} stored reading(s) from a grok-usage-gauge history JSON. This replaced the in-browser copy (it is not a GitHub database).`,
      ],
      restored,
    };
  }

  if (isCsvLike(file, extracted)) {
    try {
      const readings = parseUsageEventsCsv(extracted, {
        fileName: file.name,
        byteLength: file.size,
        source: "csv",
      });
      return {
        readings,
        extracted,
        notes: readings[0]?.notes ?? [],
        error: undefined,
      };
    } catch (err) {
      return {
        readings: [],
        extracted,
        notes: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const parsed = parseUsageText(extracted, capturedAt, file.name, settings);
  const notes = [...parsed.notes];
  let readings: Reading[] = [];

  if (!parsed.fillsTank && (parsed.surface === "grok-com" || parsed.surface === "grok-bot-routines" || parsed.surface === "cursor-bugbot")) {
    return { readings: [], extracted, notes, error: undefined, planHint: parsed.planHint };
  }

  if (parsed.fillsTank) {
    readings = [
      {
        ...readingFromParsed(parsed, capturedAt, extracted, isImage ? "screenshot" : "drop"),
        drop: { fileName: file.name, mime: file.type || "application/octet-stream", previewDataUrl: preview },
      },
    ];
  } else {
    try {
      readings = parsePaste(extracted, capturedAt, settings).map((r) => ({
        ...r,
        source: isImage ? ("screenshot" as const) : ("drop" as const),
        surface: parsed.surface,
        notes: parsed.notes,
        drop: { fileName: file.name, mime: file.type || "application/octet-stream", previewDataUrl: preview },
      }));
    } catch {
      notes.push(
        parsed.notes[0] ??
          `${file.name} classified as ${parsed.surface} but did not contain tank % or $. Stored extracted text only.`,
      );
    }
  }

  return { readings, extracted, notes, error: undefined, planHint: parsed.planHint };
}

export async function ingestFiles(
  files: File[],
  capturedAt: string,
  settings: AppSettings = DEFAULT_SETTINGS,
): Promise<IngestResult> {
  const combined: IngestResult = { readings: [], extracted: "", notes: [] };
  for (const file of files) {
    const one = await ingestFile(file, capturedAt, settings);
    if (one.error) {
      combined.error = combined.error ? `${combined.error} ${one.error}` : one.error;
    }
    combined.readings.push(...one.readings);
    if (one.planHint) combined.planHint = one.planHint;
    if (one.extracted) combined.extracted += (combined.extracted ? "\n\n---\n\n" : "") + one.extracted;
    combined.notes.push(...one.notes);
    if (one.restored) combined.restored = one.restored;
  }
  return combined;
}
