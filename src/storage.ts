import { DEFAULT_SETTINGS, type Reading, type StoredState } from "./types";

export const STORAGE_KEY = "grok-usage-gauge.v1";

export function parseStoredStateJson(raw: string): StoredState | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    const obj = parsed as Record<string, unknown>;
    if (obj.version !== 1 || !Array.isArray(obj.readings)) return undefined;
    const readings = obj.readings.filter((row): row is Reading => {
      if (!row || typeof row !== "object") return false;
      const r = row as Partial<Reading>;
      return typeof r.capturedAt === "string" && r.tanks != null && typeof r.tanks === "object";
    });
    const settingsRaw = obj.settings && typeof obj.settings === "object" ? (obj.settings as StoredState["settings"]) : undefined;
    const lastImport =
      obj.lastImport && typeof obj.lastImport === "object" ? (obj.lastImport as StoredState["lastImport"]) : undefined;
    return {
      version: 1,
      readings,
      settings: { ...DEFAULT_SETTINGS, ...settingsRaw },
      lastImport,
    };
  } catch {
    return undefined;
  }
}

export function loadState(): StoredState {
  if (typeof localStorage === "undefined") {
    return { version: 1, readings: [], settings: { ...DEFAULT_SETTINGS } };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, readings: [], settings: { ...DEFAULT_SETTINGS } };
    return parseStoredStateJson(raw) ?? { version: 1, readings: [], settings: { ...DEFAULT_SETTINGS } };
  } catch {
    return { version: 1, readings: [], settings: { ...DEFAULT_SETTINGS } };
  }
}

export function saveState(state: StoredState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearState(): StoredState {
  const next: StoredState = { version: 1, readings: [], settings: { ...DEFAULT_SETTINGS } };
  localStorage.removeItem(STORAGE_KEY);
  return next;
}

export function sortedReadings(readings: Reading[]): Reading[] {
  return [...readings].sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
}
