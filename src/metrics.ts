export function otherModelsCapUsd(
  plan: "pro" | "proPlus" | "ultra" | "custom",
  customUsd: number,
): number {
  if (plan === "custom") return customUsd;
  const table = { pro: 20, proPlus: 70, ultra: 400 } as const;
  return table[plan];
}

export function impliedGrantUsd(spendUsd: number | undefined, percentUsed: number | undefined): number | undefined {
  if (spendUsd == null || spendUsd <= 0 || percentUsed == null || percentUsed < 0.5) return undefined;
  return spendUsd / (percentUsed / 100);
}

export function remainingPercent(percentUsed: number | undefined): number | undefined {
  if (percentUsed == null || Number.isNaN(percentUsed)) return undefined;
  return 100 - percentUsed;
}

export function remainingUsd(args: {
  spendUsd?: number;
  capUsd?: number;
  percentUsed?: number;
}): number | undefined {
  if (args.capUsd != null) {
    const spend = args.spendUsd ?? 0;
    return Math.max(0, args.capUsd - spend);
  }
  const grant = impliedGrantUsd(args.spendUsd, args.percentUsed);
  if (grant == null || args.spendUsd == null) return undefined;
  return Math.max(0, grant - args.spendUsd);
}

export function inferPeriodStart(periodEnd: Date, kind: "week" | "month" | "window2h", periodStart?: Date): Date {
  if (periodStart) return periodStart;
  if (kind === "week") return new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (kind === "window2h") return new Date(periodEnd.getTime() - 2 * 60 * 60 * 1000);
  const start = new Date(periodEnd.getTime());
  start.setUTCMonth(start.getUTCMonth() - 1);
  return start;
}

export function paceMultiplier(
  percentUsed: number,
  periodStart: Date,
  periodEnd: Date,
  at: Date,
): number | undefined {
  const total = periodEnd.getTime() - periodStart.getTime();
  const elapsed = at.getTime() - periodStart.getTime();
  if (total <= 0 || elapsed <= 0) return undefined;
  const fracElapsed = elapsed / total;
  if (fracElapsed <= 0) return undefined;
  return percentUsed / 100 / fracElapsed;
}

export interface Point {
  t: number;
  p: number;
}

export function intervalBurnPercentPerMs(a: Point, b: Point): number | undefined {
  const dt = b.t - a.t;
  if (dt <= 0) return undefined;
  return (b.p - a.p) / dt;
}

export function emptyAtFromBurn(latest: Point, burnPerMs: number): Date | undefined {
  if (!(burnPerMs > 0)) return undefined;
  if (latest.p >= 100) return new Date(latest.t);
  return new Date(latest.t + (100 - latest.p) / burnPerMs);
}

export const ACCEL_FASTER_RATIO = 1.15;

export interface AccelerationWarning {
  emptyAt: Date;
  periodEnd: Date;
  hoursEarly: number;
  fasterRatio: number;
  newestBurnPercentPerHour: number;
  previousBurnPercentPerHour: number;
}

export function accelerationWarning(args: {
  points: Point[];
  periodEnd: Date;
}): AccelerationWarning | undefined {
  const pts = [...args.points].sort((a, b) => a.t - b.t);
  if (pts.length < 3) return undefined;
  const a = pts[pts.length - 3];
  const b = pts[pts.length - 2];
  const c = pts[pts.length - 1];
  const prev = intervalBurnPercentPerMs(a, b);
  const newest = intervalBurnPercentPerMs(b, c);
  if (prev == null || newest == null || prev <= 0 || newest <= 0) return undefined;
  const fasterRatio = newest / prev;
  if (fasterRatio <= ACCEL_FASTER_RATIO) return undefined;
  const emptyAt = emptyAtFromBurn(c, newest);
  if (!emptyAt) return undefined;
  const hoursEarly = (args.periodEnd.getTime() - emptyAt.getTime()) / 3_600_000;
  if (hoursEarly <= 0) return undefined;
  return {
    emptyAt,
    periodEnd: args.periodEnd,
    hoursEarly,
    fasterRatio,
    newestBurnPercentPerHour: newest * 3_600_000,
    previousBurnPercentPerHour: prev * 3_600_000,
  };
}

export interface TankMetrics {
  percentUsed?: number;
  remainingPct?: number;
  spendUsd?: number;
  capUsd?: number;
  impliedGrantUsd?: number;
  remainingUsd?: number;
  periodStart?: Date;
  periodEnd?: Date;
  pace?: number;
  emptyAt?: Date;
  hoursEarlyVsReset?: number;
  acceleration?: AccelerationWarning;
  hardStop: boolean;
  mixCents?: Record<string, number | undefined>;
  tokenTotals?: { input?: number; output?: number; cacheRead?: number; total?: number };
  requestUsed?: number;
  requestCap?: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WINDOW_2H_MS = 2 * 60 * 60 * 1000;

export function percentFromRequests(requestUsed?: number, requestCap?: number): number | undefined {
  if (requestUsed == null || requestCap == null || requestCap <= 0) return undefined;
  return (requestUsed / requestCap) * 100;
}

type SnapIn = {
  percentUsed?: number;
  periodStart?: string;
  periodEnd?: string;
  spendUsd?: number;
  capUsd?: number;
  requestUsed?: number;
  requestCap?: number;
  mixCents?: Record<string, number | undefined>;
  tokenTotals?: { input?: number; output?: number; cacheRead?: number; total?: number };
};

export function computeTankMetrics(args: {
  kind: "week" | "month" | "cap" | "window2h";
  snapshots: Array<{ capturedAt: string; snap: SnapIn }>;
  now: Date;
  fallbackCapUsd?: number;
  fallbackRequestCap?: number;
}): TankMetrics {
  const ordered = [...args.snapshots].sort(
    (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
  );
  const latest = ordered[ordered.length - 1];
  if (!latest) return { hardStop: args.fallbackCapUsd === 0 && args.kind === "cap" };

  const snap = latest.snap;
  const capUsd = snap.capUsd ?? args.fallbackCapUsd;
  const requestCap = snap.requestCap ?? args.fallbackRequestCap;
  const requestUsed = snap.requestUsed;
  const hardStop = args.kind === "cap" && capUsd === 0;

  const derivePctFromCap = (kind: typeof args.kind, cap: number | undefined, spend: number | undefined) => {
    if (spend == null || cap == null || cap <= 0) return undefined;
    if (kind === "cap" || kind === "month") return (spend / cap) * 100;
    return undefined;
  };

  let percentUsed =
    snap.percentUsed ??
    percentFromRequests(requestUsed, requestCap) ??
    derivePctFromCap(args.kind, capUsd, snap.spendUsd);
  if (hardStop) {
    percentUsed = (snap.spendUsd ?? 0) > 0 ? 100 : 0;
  }

  let periodEnd = snap.periodEnd ? new Date(snap.periodEnd) : undefined;
  let periodStart = snap.periodStart ? new Date(snap.periodStart) : undefined;
  if (periodEnd && !periodStart) {
    const startKind = args.kind === "week" ? "week" : args.kind === "window2h" ? "window2h" : "month";
    periodStart = inferPeriodStart(periodEnd, startKind);
  }
  if (periodStart && !periodEnd && args.kind === "week") {
    periodEnd = new Date(periodStart.getTime() + WEEK_MS);
  }
  if (periodStart && !periodEnd && args.kind === "window2h") {
    periodEnd = new Date(periodStart.getTime() + WINDOW_2H_MS);
  }

  const pace =
    percentUsed != null && periodStart && periodEnd
      ? paceMultiplier(percentUsed, periodStart, periodEnd, args.now)
      : undefined;

  const points: Point[] = [];
  for (const row of ordered) {
    const cap = row.snap.capUsd ?? capUsd;
    const p =
      row.snap.percentUsed ??
      percentFromRequests(row.snap.requestUsed, row.snap.requestCap ?? requestCap) ??
      derivePctFromCap(args.kind, cap, row.snap.spendUsd);
    if (p == null) continue;
    points.push({ t: new Date(row.capturedAt).getTime(), p });
  }

  let emptyAt: Date | undefined;
  let hoursEarlyVsReset: number | undefined;
  if (points.length >= 2) {
    const a = points[points.length - 2];
    const b = points[points.length - 1];
    const burn = intervalBurnPercentPerMs(a, b);
    if (burn != null && burn > 0) {
      emptyAt = emptyAtFromBurn(b, burn);
      if (emptyAt && periodEnd) {
        hoursEarlyVsReset = (periodEnd.getTime() - emptyAt.getTime()) / 3_600_000;
      }
    }
  }

  const acceleration =
    periodEnd && points.length >= 3 ? accelerationWarning({ points, periodEnd }) : undefined;

  return {
    percentUsed,
    remainingPct: remainingPercent(percentUsed),
    spendUsd: snap.spendUsd,
    capUsd,
    impliedGrantUsd: impliedGrantUsd(snap.spendUsd, percentUsed),
    remainingUsd: remainingUsd({ spendUsd: snap.spendUsd, capUsd, percentUsed }),
    periodStart,
    periodEnd,
    pace,
    emptyAt,
    hoursEarlyVsReset,
    acceleration,
    hardStop,
    mixCents: snap.mixCents,
    tokenTotals: snap.tokenTotals,
    requestUsed,
    requestCap,
  };
}
