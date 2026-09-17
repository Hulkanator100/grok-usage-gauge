import type { Reading, TankId } from "./types";
import { TANK_IDS, isXGrokTank } from "./types";
import { impliedGrantUsd } from "./metrics";
import { sortedReadings } from "./storage";

/** Relative jump that counts as a backend grant/cap change, not noise. */
export const ESTIMATE_CHANGE_RATIO = 0.12;
export const ESTIMATE_MIN_PERCENT = 0.5;
export const ESTIMATE_STABLE_SAMPLES = 3;

export interface EstimatePoint {
  t: number;
  value: number;
}

export interface TankEstimate {
  tank: TankId;
  unit: "usd" | "requests";
  samples: EstimatePoint[];
  sampleCount: number;
  estimate?: number;
  latest?: number;
  previousEra?: number;
  changedAt?: number;
  stable: boolean;
  vsFallback?: { fallback: number; deltaRatio: number };
  note: string;
}

export function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function splitEras(points: EstimatePoint[], ratio = ESTIMATE_CHANGE_RATIO): EstimatePoint[][] {
  if (!points.length) return [];
  const eras: EstimatePoint[][] = [[points[0]]];
  for (let i = 1; i < points.length; i++) {
    const era = eras[eras.length - 1];
    const med = median(era.map((p) => p.value));
    const v = points[i].value;
    if (med != null && med > 0 && Math.abs(v - med) / med > ratio && era.length >= 2) {
      eras.push([points[i]]);
    } else {
      era.push(points[i]);
    }
  }
  return eras;
}

function usdObservation(snap: { spendUsd?: number; percentUsed?: number }): number | undefined {
  return impliedGrantUsd(snap.spendUsd, snap.percentUsed);
}

function requestCapObservation(snap: {
  requestUsed?: number;
  requestCap?: number;
  percentUsed?: number;
}): number | undefined {
  if (snap.requestCap != null && snap.requestCap > 0) return snap.requestCap;
  if (snap.requestUsed != null && snap.percentUsed != null && snap.percentUsed >= ESTIMATE_MIN_PERCENT) {
    return snap.requestUsed / (snap.percentUsed / 100);
  }
  return undefined;
}

export function observationsForTank(readings: Reading[], tank: TankId): EstimatePoint[] {
  const out: EstimatePoint[] = [];
  for (const r of sortedReadings(readings)) {
    const snap = r.tanks[tank];
    if (!snap) continue;
    const value = isXGrokTank(tank) ? requestCapObservation(snap) : usdObservation(snap);
    if (value == null || !Number.isFinite(value) || value <= 0) continue;
    out.push({ t: new Date(r.capturedAt).getTime(), value });
  }
  return out;
}

export function estimateTank(
  readings: Reading[],
  tank: TankId,
  fallback?: number,
): TankEstimate {
  const samples = observationsForTank(readings, tank);
  const unit = isXGrokTank(tank) ? "requests" : "usd";
  const base: TankEstimate = {
    tank,
    unit,
    samples,
    sampleCount: samples.length,
    stable: false,
    note:
      samples.length === 0
        ? isXGrokTank(tank)
          ? "Need two or more X pastes that show replies used of a limit (for example 42 of 50) so we can guess the real 2-hour limit."
          : "Need two or more readings that show both dollars spent and % used so we can guess the hidden included amount."
        : "",
  };
  if (!samples.length) return base;

  const eras = splitEras(samples);
  const current = eras[eras.length - 1];
  const estimate = median(current.map((p) => p.value));
  const latest = samples[samples.length - 1].value;
  const previousEra = eras.length > 1 ? median(eras[eras.length - 2].map((p) => p.value)) : undefined;
  const changedAt = eras.length > 1 ? current[0].t : undefined;
  const stable = current.length >= ESTIMATE_STABLE_SAMPLES && eras.length === 1;

  let vsFallback: TankEstimate["vsFallback"];
  if (fallback != null && fallback > 0 && estimate != null) {
    const deltaRatio = Math.abs(estimate - fallback) / fallback;
    if (deltaRatio > ESTIMATE_CHANGE_RATIO) vsFallback = { fallback, deltaRatio };
  }

  let note: string;
  if (changedAt && previousEra != null && estimate != null) {
    note = `Newer readings disagree with older ones — the hidden ${unit === "usd" ? "dollar amount" : "reply limit"} may have changed. Keep adding screenshots; we never log into Cursor or X for you.`;
  } else if (stable && estimate != null) {
    note = `Middle of ${current.length} readings. Treat this as the figure they will not publish. Check again when you add a new meter.`;
  } else if (estimate != null) {
    note = `${current.length} reading${current.length === 1 ? "" : "s"} so far — wait for ${ESTIMATE_STABLE_SAMPLES} that agree before trusting it.`;
  } else {
    note = base.note;
  }

  return {
    ...base,
    estimate,
    latest,
    previousEra,
    changedAt,
    stable,
    vsFallback,
    note,
  };
}

export function estimateAllTanks(
  readings: Reading[],
  fallbacks: Partial<Record<TankId, number>>,
): TankEstimate[] {
  return TANK_IDS.map((id) => estimateTank(readings, id, fallbacks[id]));
}

export function polylineValues(points: EstimatePoint[], width: number, height: number, padX = 8, padY = 8): string {
  if (!points.length) return "";
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const span = Math.max(1, t1 - t0);
  const lo = Math.min(...points.map((p) => p.value));
  const hi = Math.max(...points.map((p) => p.value));
  const vspan = Math.max(1e-6, hi - lo);
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  return points
    .map((p, i) => {
      const x = padX + ((p.t - t0) / span) * innerW;
      const y = padY + (1 - (p.value - lo) / vspan) * innerH;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
