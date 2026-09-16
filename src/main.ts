import { buildAcceleratingWeek, buildExampleWeek } from "./examples";
import { ingestFiles } from "./ingestDrop";
import { parsePaste, sampleDashboardPaste } from "./parsePaste";
import { parseUsageEventsCsv } from "./parseUsageCsv";
import { clearState, loadState, saveState } from "./storage";
import type { LastImport, StoredState } from "./types";
import { fromDatetimeLocalValue, renderApp, toDatetimeLocalValue } from "./ui";

let state: StoredState = loadState();
let paste = "";
let capturedAtLocal = toDatetimeLocalValue();
let notice: string | undefined;
let error: string | undefined;
let busy: string | undefined;

function persist() {
  saveState(state);
}

function setLastImport(next: LastImport | undefined) {
  state.lastImport = next;
  persist();
}

function capturedIso(): string {
  const el = document.getElementById("captured-at") as HTMLInputElement | null;
  return fromDatetimeLocalValue(el?.value ?? capturedAtLocal);
}

function render() {
  const root = document.getElementById("app");
  if (!root) return;
  root.innerHTML = renderApp({
    readings: state.readings,
    settings: state.settings,
    paste,
    capturedAtLocal,
    notice,
    error,
    busy,
    lastImport: state.lastImport,
  });
  bind();
}

async function snapshotFiles(list: FileList | File[]): Promise<File[]> {
  const raw = Array.from(list);
  const copies: File[] = [];
  for (const file of raw) {
    const buf = await file.arrayBuffer();
    copies.push(new File([buf], file.name, { type: file.type, lastModified: file.lastModified }));
  }
  return copies;
}

function summarizeImport(files: File[], result: Awaited<ReturnType<typeof ingestFiles>>): LastImport {
  const names = files.map((f) => f.name).join(", ");
  const bytes = files.reduce((n, f) => n + f.size, 0);
  const summary = [
    result.readings.length
      ? `Filled ${result.readings.length} tank reading${result.readings.length === 1 ? "" : "s"}.`
      : "No tank figures in this file.",
    ...result.notes,
    result.error,
  ]
    .filter(Boolean)
    .join(" ");
  return { names, bytes, extracted: result.extracted, summary };
}

let ingestLock = false;

async function handleFiles(list: FileList | File[]) {
  if (ingestLock) return;
  ingestLock = true;
  let files: File[] = [];
  try {
    try {
      files = await snapshotFiles(list);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      setLastImport({ names: "unreadable", bytes: 0, extracted: "", summary: error });
      render();
      return;
    }
    if (!files.length) {
      error = "Choose files did not receive a file. Pick a screenshot, .txt, .json, or a finished .csv.";
      setLastImport({ names: "none", bytes: 0, extracted: "", summary: error });
      render();
      return;
    }
    error = undefined;
    notice = undefined;
    setLastImport({
      names: files.map((f) => f.name).join(", "),
      bytes: files.reduce((n, f) => n + f.size, 0),
      extracted: "",
      summary: "Reading locally…",
    });
    busy = `Reading ${files.map((f) => f.name).join(", ")}…`;
    render();
    try {
      const result = await ingestFiles(files, capturedIso());
      paste = result.extracted || paste;
      if (result.planHint && result.planHint !== state.settings.plan) {
        state.settings.plan = result.planHint;
      }
      if (result.readings.length) {
        state.readings = [...state.readings, ...result.readings];
        persist();
      }
      setLastImport(summarizeImport(files, result));
      notice = state.lastImport?.summary;
      error = result.error;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      setLastImport({
        names: files.map((f) => f.name).join(", "),
        bytes: files.reduce((n, f) => n + f.size, 0),
        extracted: "",
        summary: error,
      });
    } finally {
      busy = undefined;
      render();
    }
  } finally {
    ingestLock = false;
  }
}

function onFilePicked(input: HTMLInputElement) {
  const picked = input.files;
  if (!picked?.length) return;
  const snapshot = Array.from(picked);
  input.value = "";
  void handleFiles(snapshot);
}

function bind() {
  const pasteEl = document.getElementById("paste") as HTMLTextAreaElement | null;
  const capturedEl = document.getElementById("captured-at") as HTMLInputElement | null;
  const planEl = document.getElementById("plan") as HTMLSelectElement | null;
  const customEl = document.getElementById("custom-other") as HTMLInputElement | null;
  const capEl = document.getElementById("ondemand-cap") as HTMLInputElement | null;
  const drop = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input") as HTMLInputElement | null;

  pasteEl?.addEventListener("input", () => {
    paste = pasteEl.value;
  });
  capturedEl?.addEventListener("change", () => {
    capturedAtLocal = capturedEl.value;
  });
  planEl?.addEventListener("change", () => {
    state.settings.plan = planEl.value as StoredState["settings"]["plan"];
    persist();
    render();
  });
  customEl?.addEventListener("change", () => {
    state.settings.customOtherModelsUsd = Number(customEl.value) || 0;
    persist();
    render();
  });
  capEl?.addEventListener("change", () => {
    state.settings.onDemandCapUsd = Number(capEl.value);
    if (!Number.isFinite(state.settings.onDemandCapUsd) || state.settings.onDemandCapUsd < 0) {
      state.settings.onDemandCapUsd = 0;
    }
    persist();
    render();
  });

  fileInput?.addEventListener("change", () => onFilePicked(fileInput));
  fileInput?.addEventListener("input", () => onFilePicked(fileInput));
  document.getElementById("choose-files")?.addEventListener("click", () => fileInput?.click());

  drop?.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("drag");
  });
  drop?.addEventListener("dragleave", () => drop.classList.remove("drag"));
  drop?.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
    if (e.dataTransfer?.files?.length) void handleFiles(e.dataTransfer.files);
  });

  document.getElementById("save-paste")?.addEventListener("click", () => {
    error = undefined;
    notice = undefined;
    try {
      const readings = parsePaste(pasteEl?.value ?? paste, capturedIso());
      state.readings = [...state.readings, ...readings];
      persist();
      notice = `Saved ${readings.length} reading${readings.length === 1 ? "" : "s"} locally.`;
      render();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      render();
    }
  });

  document.getElementById("fill-sample")?.addEventListener("click", () => {
    paste = sampleDashboardPaste();
    notice = "Sample Spending-style paste loaded into the box. Save it to store a reading.";
    error = undefined;
    render();
  });

  document.getElementById("load-example")?.addEventListener("click", () => {
    state.readings = buildExampleWeek();
    persist();
    notice = "Loaded a two-reading example week (all four tanks, on-pace Bot week).";
    error = undefined;
    render();
  });

  document.getElementById("load-accel")?.addEventListener("click", () => {
    state.readings = buildAcceleratingWeek();
    persist();
    notice = "Loaded an accelerating Bot week. The Grok Bot tank should warn it will empty before weekly reset.";
    error = undefined;
    render();
  });

  document.getElementById("load-sample-csv")?.addEventListener("click", () => {
    void loadBundledCsv();
  });

  document.getElementById("export-json")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grok-usage-gauge-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notice = "Downloaded readings JSON from this browser’s localStorage (not a file on the server).";
    render();
  });

  document.getElementById("clear-data")?.addEventListener("click", () => {
    if (!confirm("Clear all local readings and settings from this browser?")) return;
    state = clearState();
    paste = "";
    capturedAtLocal = toDatetimeLocalValue();
    notice = "Local data cleared.";
    error = undefined;
    render();
  });
}

async function loadBundledCsv() {
  error = undefined;
  notice = undefined;
  busy = "Loading bundled usage-events CSV…";
  render();
  try {
    const res = await fetch("/usage-events-2026-09-16.csv");
    if (!res.ok) throw new Error(`Could not fetch bundled CSV (${res.status}).`);
    const text = await res.text();
    const readings = parseUsageEventsCsv(text, {
      fileName: "usage-events-2026-09-16.csv",
      byteLength: new TextEncoder().encode(text).length,
      source: "csv-sample",
    });
    state.readings = readings;
    persist();
    paste = text;
    setLastImport({
      names: "usage-events-2026-09-16.csv",
      bytes: new TextEncoder().encode(text).length,
      extracted: text.slice(0, 4000),
      summary: `Loaded ${readings.length} daily cumulative readings from the bundled Sep 2026 usage-events CSV.`,
    });
    notice = state.lastImport?.summary;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    busy = undefined;
    render();
  }
}

function onPasteImage(e: ClipboardEvent) {
  const items = e.clipboardData?.files;
  if (!items?.length) return;
  const images = [...items].filter((f) => f.type.startsWith("image/"));
  if (!images.length) return;
  e.preventDefault();
  void handleFiles(images);
}

render();
document.addEventListener("paste", onPasteImage);
