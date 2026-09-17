import { buildAcceleratingWeek, buildExampleWeek } from "./examples";
import { ingestFiles } from "./ingestDrop";
import { parsePaste, sampleDashboardPaste } from "./parsePaste";
import { parseUsageEventsCsv } from "./parseUsageCsv";
import { clearState, loadState, saveState } from "./storage";
import { buildIngestReview, type IngestReview } from "./ingestReview";
import { X_GROK_CAPS, type LastImport, type StoredState, type XGrokPlan } from "./types";
import { formatRequestCap, formatUsdCap, fromDatetimeLocalValue, isAppTab, renderApp, toDatetimeLocalValue, type AppTab } from "./ui";

let state: StoredState = loadState();
let paste = "";
let capturedAtLocal = toDatetimeLocalValue();
let notice: string | undefined;
let error: string | undefined;
let busy: string | undefined;
let ingestReview: IngestReview | undefined;
const TAB_KEY = "grok-usage-gauge.tab";
let activeTab: AppTab = (() => {
  try {
    const stored = sessionStorage.getItem(TAB_KEY);
    if (stored && isAppTab(stored)) return stored;
  } catch {
    /* ignore */
  }
  return "cursor";
})();

function setTab(id: AppTab) {
  activeTab = id;
  try {
    sessionStorage.setItem(TAB_KEY, id);
  } catch {
    /* ignore */
  }
}

function confirmImport(args: Parameters<typeof buildIngestReview>[0]) {
  ingestReview = buildIngestReview(args);
  notice =
    ingestReview.changedCount === 0
      ? "Saved. Remaining fuel looks the same as before. Dates are on Review — gauges did not open by themselves."
      : `${ingestReview.changedCount} tank${ingestReview.changedCount === 1 ? "" : "s"} changed. Check dates on Review first — gauges did not open by themselves.`;
  setTab("review");
}

function persist() {
  saveState(state);
}

function fillOriginBanner() {
  const el = document.getElementById("origin-banner");
  if (!el) return;
  const here = `${window.location.origin}${window.location.pathname}`;
  const host = window.location.hostname;
  let extra: string;
  if (/\.cvm\.dev$|\.cursor\.sh$|agent\.cvm/i.test(host)) {
    extra =
      "You do <strong>not</strong> need a terminal on your PC for this tab. Close the laptop if you want; the tanks stay in this browser. This URL goes away when the cloud agent sleeps. For a lasting copy, turn on GitHub Pages and use <code>https://hulkanator100.github.io/grok-usage-gauge/</code>.";
  } else if (/github\.io$/i.test(host)) {
    extra =
      "You do <strong>not</strong> need a terminal. This is the GitHub copy. Shut the PC off anytime; reopen this same address.";
  } else if (host === "127.0.0.1" || host === "localhost") {
    extra =
      "A local server is only needed while this address is open. Close it when you close the tab. History stays in this browser after shutdown.";
  } else {
    extra =
      "A local server is only needed if you started one yourself. The GitHub copy needs none.";
  }
  el.innerHTML = `This copy is <strong>${here}</strong>. Readings stay in <em>this browser on this computer</em>. ${extra} Download a backup if you want a private file.`;
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
    activeTab,
    review: ingestReview,
  });
  bind();
  if (activeTab === "review") {
    document.getElementById("panel-review")?.scrollIntoView({ block: "nearest" });
    document.getElementById("tab-review")?.focus({ preventScroll: true });
  }
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
      error = "No file arrived. Pick a screenshot, a text file, a backup, or a finished Cursor Usage spreadsheet.";
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
    const before = state.readings;
    try {
      const result = await ingestFiles(files, capturedIso(), state.settings);
      paste = result.extracted || paste;
      if (result.restored) {
        state = result.restored;
        persist();
      } else {
        if (result.planHint && result.planHint !== state.settings.plan) {
          state.settings.plan = result.planHint;
        }
        if (result.readings.length) {
          state.readings = [...state.readings, ...result.readings];
          persist();
        }
      }
      setLastImport(summarizeImport(files, result));
      notice = state.lastImport?.summary;
      error = result.error;
      confirmImport({
        before,
        after: state.readings,
        added: result.restored ? state.readings : result.readings,
        sourceLabel: result.restored ? "Restored backup" : "Dropped / chosen files",
        names: files.map((f) => f.name).join(", "),
        bytes: files.reduce((n, f) => n + f.size, 0),
        summary: state.lastImport?.summary ?? "",
        error: result.error,
      });
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

function bindSlider(el: HTMLInputElement | null, apply: (n: number) => void, format: (n: number) => string) {
  if (!el) return;
  const out = document.getElementById(`${el.id}-out`);
  const paint = () => {
    const n = Number(el.value);
    const min = Number(el.min);
    const max = Number(el.max);
    const fill = max > min ? ((n - min) / (max - min)) * 100 : 0;
    el.style.setProperty("--fill", `${fill}%`);
    if (out) out.textContent = format(n);
  };
  el.addEventListener("input", paint);
  el.addEventListener("change", () => {
    paint();
    apply(Number(el.value));
    persist();
    render();
  });
}

function bind() {
  const pasteEl = document.getElementById("paste") as HTMLTextAreaElement | null;
  const capturedEl = document.getElementById("captured-at") as HTMLInputElement | null;
  const planEl = document.getElementById("plan") as HTMLSelectElement | null;
  const customEl = document.getElementById("custom-other") as HTMLInputElement | null;
  const capEl = document.getElementById("ondemand-cap") as HTMLInputElement | null;
  const xPlanEl = document.getElementById("x-plan") as HTMLSelectElement | null;
  const xLightEl = document.getElementById("x-light-cap") as HTMLInputElement | null;
  const xMediumEl = document.getElementById("x-medium-cap") as HTMLInputElement | null;
  const xHeavyEl = document.getElementById("x-heavy-cap") as HTMLInputElement | null;
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
  bindSlider(customEl, (n) => {
    state.settings.customOtherModelsUsd = Number.isFinite(n) && n >= 0 ? n : 0;
  }, (n) => formatUsdCap(n));
  bindSlider(capEl, (n) => {
    state.settings.onDemandCapUsd = Number.isFinite(n) && n >= 0 ? n : 0;
  }, (n) => formatUsdCap(n, true));
  xPlanEl?.addEventListener("change", () => {
    const plan = xPlanEl.value as XGrokPlan;
    state.settings.xPlan = plan;
    const caps = X_GROK_CAPS[plan];
    state.settings.xLightCap = caps.light;
    state.settings.xMediumCap = caps.medium;
    state.settings.xHeavyCap = caps.heavy;
    persist();
    render();
  });
  const bindRequestCap = (el: HTMLInputElement | null, key: "xLightCap" | "xMediumCap" | "xHeavyCap") => {
    bindSlider(el, (n) => {
      state.settings[key] = Number.isFinite(n) && n > 0 ? n : 1;
    }, formatRequestCap);
  };
  bindRequestCap(xLightEl, "xLightCap");
  bindRequestCap(xMediumEl, "xMediumCap");
  bindRequestCap(xHeavyEl, "xHeavyCap");

  fillOriginBanner();
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.tab;
      if (!id || !isAppTab(id)) return;
      setTab(id);
      render();
    });
  });
  const jump = (id: AppTab) => {
    document.getElementById(`review-to-${id}`)?.addEventListener("click", () => {
      setTab(id);
      render();
    });
  };
  jump("cursor");
  jump("xgrok");
  jump("history");
  jump("add");
  fileInput?.addEventListener("change", () => onFilePicked(fileInput));
  fileInput?.addEventListener("input", () => onFilePicked(fileInput));
  document.getElementById("choose-files")?.addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput?.click();
  });

  drop?.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("button, input, a, summary")) return;
    fileInput?.click();
  });
  drop?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    fileInput?.click();
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
      const before = state.readings;
      const readings = parsePaste(pasteEl?.value ?? paste, capturedIso(), state.settings);
      state.readings = [...state.readings, ...readings];
      persist();
      confirmImport({
        before,
        after: state.readings,
        added: readings,
        sourceLabel: "Pasted text",
        names: "paste box",
        summary: `Saved ${readings.length} reading${readings.length === 1 ? "" : "s"} in this browser.`,
      });
      render();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      render();
    }
  });

  document.getElementById("fill-sample")?.addEventListener("click", () => {
    paste = sampleDashboardPaste();
    notice = "Sample Spending text is in the box. Press Save pasted reading to store it.";
    error = undefined;
    render();
  });

  document.getElementById("load-example")?.addEventListener("click", () => {
    const before = state.readings;
    state.readings = buildExampleWeek();
    persist();
    error = undefined;
    confirmImport({
      before,
      after: state.readings,
      added: state.readings,
      sourceLabel: "Example week",
      names: "bundled 2-reading demo",
      summary: "Loaded a two-reading example week (all four tanks, on-pace Bot week).",
    });
    render();
  });

  document.getElementById("load-accel")?.addEventListener("click", () => {
    const before = state.readings;
    state.readings = buildAcceleratingWeek();
    persist();
    error = undefined;
    confirmImport({
      before,
      after: state.readings,
      added: state.readings,
      sourceLabel: "Accelerating week",
      names: "bundled 3-reading demo",
      summary: "Loaded an accelerating Bot week. The Grok Bot tank should warn it will empty before weekly reset.",
    });
    render();
  });

  document.getElementById("load-sample-csv")?.addEventListener("click", () => {
    void loadBundledCsv();
  });

  const restoreInput = document.getElementById("restore-json-input") as HTMLInputElement | null;
  document.getElementById("restore-json")?.addEventListener("click", () => restoreInput?.click());
  restoreInput?.addEventListener("change", () => onFilePicked(restoreInput));

  document.getElementById("export-json")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grok-usage-gauge-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notice = "Downloaded a backup from this browser (nothing was uploaded). Keep that file somewhere private if you want a copy off this computer.";
    render();
  });

  document.getElementById("clear-data")?.addEventListener("click", () => {
    if (!confirm("Clear all local readings and settings from this browser?")) return;
    state = clearState();
    paste = "";
    capturedAtLocal = toDatetimeLocalValue();
    notice = "Local data cleared.";
    error = undefined;
    ingestReview = undefined;
    render();
  });
}

async function loadBundledCsv() {
  error = undefined;
  notice = undefined;
  busy = "Loading the sample Cursor Usage spreadsheet…";
  render();
  try {
    const res = await fetch(new URL("usage-events-2026-09-16.csv", document.baseURI));
    if (!res.ok) throw new Error(`Could not load the sample Cursor Usage spreadsheet (${res.status}).`);
    const text = await res.text();
    const before = state.readings;
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
      summary: `Loaded ${readings.length} daily Cursor spend readings from the sample spreadsheet.`,
    });
    confirmImport({
      before,
      after: state.readings,
      added: readings,
      sourceLabel: "Sample Cursor Usage spreadsheet",
      names: "usage-events-2026-09-16.csv",
      bytes: new TextEncoder().encode(text).length,
      summary: state.lastImport?.summary ?? "",
    });
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
