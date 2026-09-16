import type { AppSettings, Reading, TankId, TankSnapshot } from "./types";
import { otherModelsCapUsd } from "./metrics";
import { sortedReadings } from "./storage";

export interface HistoryPoint {
  t: number;
  used: number;
  remaining: number;
}

function usedFromSnap(snap: TankSnapshot, fallbackCapUsd?: number): number | undefined {
  if (snap.percentUsed != null && Number.isFinite(snap.percentUsed)) return snap.percentUsed;
  const cap = snap.capUsd ?? fallbackCapUsd;
  if (snap.spendUsd != null && cap != null && cap > 0) return (snap.spendUsd / cap) * 100;
  if (cap === 0 && snap.spendUsd != null) return snap.spendUsd > 0 ? 100 : 0;
  return undefined;
}

function fallbackCap(tank: TankId, settings: AppSettings): number | undefined {
  if (tank === "otherModelsMonthly") return otherModelsCapUsd(settings.plan, settings.customOtherModelsUsd);
  if (tank === "onDemandMonthly") return settings.onDemandCapUsd;
  return undefined;
}

export function historyPoints(readings: Reading[], tank: TankId, settings: AppSettings): HistoryPoint[] {
  const cap = fallbackCap(tank, settings);
  const out: HistoryPoint[] = [];
  for (const r of sortedReadings(readings)) {
    const snap = r.tanks[tank];
    if (!snap) continue;
    const used = usedFromSnap(snap, cap);
    if (used == null) continue;
    const clamped = Math.max(0, Math.min(100, used));
    out.push({ t: new Date(r.capturedAt).getTime(), used: clamped, remaining: 100 - clamped });
  }
  return out;
}

export function timeWindow(series: HistoryPoint[][]): { t0: number; t1: number } | undefined {
  let t0 = Number.POSITIVE_INFINITY;
  let t1 = Number.NEGATIVE_INFINITY;
  for (const points of series) {
    for (const p of points) {
      if (p.t < t0) t0 = p.t;
      if (p.t > t1) t1 = p.t;
    }
  }
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return undefined;
  return { t0, t1 };
}

export function polylineRemaining(
  points: HistoryPoint[],
  width: number,
  height: number,
  padX = 8,
  padY = 8,
  window?: { t0: number; t1: number },
): string {
  if (points.length === 0) return "";
  const t0 = window?.t0 ?? points[0].t;
  const t1 = window?.t1 ?? points[points.length - 1].t;
  const span = Math.max(1, t1 - t0);
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  return points
    .map((p, i) => {
      const x = padX + ((p.t - t0) / span) * innerW;
      const y = padY + (1 - p.remaining / 100) * innerH;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
