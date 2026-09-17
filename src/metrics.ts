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

export function fillPercentOfSnap(
  snap: SnapIn,
  kind: "week" | "month" | "cap" | "window2h",
  fallbackCapUsd?: number,
  fallbackRequestCap?: number,
): number | undefined {
  if (snap.percentUsed != null && Number.isFinite(snap.percentUsed)) return snap.percentUsed;
  const requestCap = snap.requestCap ?? fallbackRequestCap;
  const fromReq = percentFromRequests(snap.requestUsed, requestCap);
  if (fromReq != null) return fromReq;
  const capUsd = snap.capUsd ?? fallbackCapUsd;
  if (snap.spendUsd == null || capUsd == null || capUsd <= 0) return undefined;
  if (kind === "cap" || kind === "month") return (snap.spendUsd / capUsd) * 100;
  return undefined;
}

function lastDefined<T>(
  ordered: Array<{ snap: SnapIn }>,
  pick: (snap: SnapIn) => T | undefined,
): T | undefined {
  for (let i = ordered.length - 1; i >= 0; i--) {
    const value = pick(ordered[i].snap);
    if (value != null) return value;
  }
  return undefined;
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

  const capUsd = lastDefined(ordered, (s) => s.capUsd) ?? args.fallbackCapUsd;
  const requestCap = lastDefined(ordered, (s) => s.requestCap) ?? args.fallbackRequestCap;
  const requestUsed = lastDefined(ordered, (s) => s.requestUsed);
  const spendUsd = lastDefined(ordered, (s) => s.spendUsd);
  const hardStop = args.kind === "cap" && capUsd === 0;

  let percentUsed = fillPercentOfSnap(latest.snap, args.kind, capUsd, requestCap);
  if (percentUsed == null && spendUsd != null) {
    const grant = lastDefined(ordered, (s) => impliedGrantUsd(s.spendUsd, s.percentUsed));
    if (grant != null && grant > 0) percentUsed = (spendUsd / grant) * 100;
  }
  if (percentUsed == null) {
    percentUsed = lastDefined(ordered, (s) => fillPercentOfSnap(s, args.kind, capUsd, requestCap));
  }
  if (hardStop) {
    percentUsed = (spendUsd ?? 0) > 0 ? 100 : 0;
  }

  let periodEndRaw = lastDefined(ordered, (s) => s.periodEnd);
  let periodStartRaw = lastDefined(ordered, (s) => s.periodStart);
  let periodEnd = periodEndRaw ? new Date(periodEndRaw) : undefined;
  let periodStart = periodStartRaw ? new Date(periodStartRaw) : undefined;
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

  const grantForFill = lastDefined(ordered, (s) => impliedGrantUsd(s.spendUsd, s.percentUsed));
  const points: Point[] = [];
  let carried: number | undefined;
  for (const row of ordered) {
    let p = fillPercentOfSnap(row.snap, args.kind, capUsd, requestCap);
    if (p == null && row.snap.spendUsd != null && grantForFill != null && grantForFill > 0) {
      p = (row.snap.spendUsd / grantForFill) * 100;
    }
    if (p == null) p = carried;
    if (p == null) continue;
    carried = p;
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
    spendUsd,
    capUsd,
    impliedGrantUsd: impliedGrantUsd(spendUsd, percentUsed) ?? lastDefined(ordered, (s) => impliedGrantUsd(s.spendUsd, s.percentUsed)),
    remainingUsd: remainingUsd({ spendUsd, capUsd, percentUsed }),
    periodStart,
    periodEnd,
    pace,
    emptyAt,
    hoursEarlyVsReset,
    acceleration,
    hardStop,
    mixCents: lastDefined(ordered, (s) => s.mixCents),
    tokenTotals: lastDefined(ordered, (s) => s.tokenTotals),
    requestUsed,
    requestCap,
  };
}
