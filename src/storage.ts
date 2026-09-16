import { DEFAULT_SETTINGS, type Reading, type StoredState } from "./types";

export const STORAGE_KEY = "grok-usage-gauge.v1";

export function loadState(): StoredState {
  if (typeof localStorage === "undefined") {
    return { version: 1, readings: [], settings: { ...DEFAULT_SETTINGS } };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, readings: [], settings: { ...DEFAULT_SETTINGS } };
    const parsed = JSON.parse(raw) as StoredState;
    if (parsed?.version !== 1 || !Array.isArray(parsed.readings)) {
      return { version: 1, readings: [], settings: { ...DEFAULT_SETTINGS } };
    }
    return {
      version: 1,
      readings: parsed.readings,
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
    };
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
