import { buildAcceleratingWeek, buildExampleWeek } from "./examples";
import { parsePaste, sampleDashboardPaste } from "./parsePaste";
import { clearState, loadState, saveState } from "./storage";
import type { StoredState } from "./types";
import { fromDatetimeLocalValue, renderApp, toDatetimeLocalValue } from "./ui";

let state: StoredState = loadState();
let paste = "";
let capturedAtLocal = toDatetimeLocalValue();
let notice: string | undefined;
let error: string | undefined;

function persist() {
  saveState(state);
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
  });
  bind();
}

function bind() {
  const pasteEl = document.getElementById("paste") as HTMLTextAreaElement | null;
  const capturedEl = document.getElementById("captured-at") as HTMLInputElement | null;
  const planEl = document.getElementById("plan") as HTMLSelectElement | null;
  const customEl = document.getElementById("custom-other") as HTMLInputElement | null;
  const capEl = document.getElementById("ondemand-cap") as HTMLInputElement | null;

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

  document.getElementById("save-paste")?.addEventListener("click", () => {
    error = undefined;
    notice = undefined;
    try {
      const capturedAt = fromDatetimeLocalValue(capturedEl?.value ?? capturedAtLocal);
      const readings = parsePaste(pasteEl?.value ?? paste, capturedAt);
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

render();
