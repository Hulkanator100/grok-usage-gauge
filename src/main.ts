import { buildAcceleratingWeek, buildExampleWeek } from "./examples";
import { ingestFiles } from "./ingestDrop";
import { parsePaste, sampleDashboardPaste } from "./parsePaste";
import { parseUsageEventsCsv } from "./parseUsageCsv";
import { clearState, loadState, saveState } from "./storage";
import type { StoredState } from "./types";
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
  });
  bind();
}

async function handleFiles(list: FileList | File[]) {
  const files = [...list];
  if (!files.length) return;
  error = undefined;
  notice = undefined;
  busy = `Reading ${files.length} file${files.length === 1 ? "" : "s"} locally…`;
  render();
  try {
    const result = await ingestFiles(files, capturedIso());
    paste = result.extracted || paste;
    if (result.readings.length) {
      state.readings = [...state.readings, ...result.readings];
      persist();
    }
    notice = [
      result.readings.length
        ? `Saved ${result.readings.length} reading${result.readings.length === 1 ? "" : "s"} from drop.`
        : result.error
          ? undefined
          : "No tank fill from this drop.",
      ...result.notes,
    ]
      .filter(Boolean)
      .join(" ");
    error = result.error;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    busy = undefined;
    render();
  }
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

  fileInput?.addEventListener("change", () => {
    if (fileInput.files?.length) void handleFiles(fileInput.files);
  });

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
    notice = `Loaded ${readings.length} daily cumulative readings from the bundled Sep 2026 usage-events CSV. grok-bot-* mix is tank 1 (not Cursor Models). Cloud-agent Claude is Other Models. On-Demand Kind is tank 4. Bot/Cursor Models stay spend-only; Other Models / on-demand % use plan/cap.`;
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
