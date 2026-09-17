import { sortedReadings } from "./storage";
import { TANK_IDS, TANK_META, type Reading, type TankId, type TankSnapshot } from "./types";

export interface TankMetricChange {
  tank: TankId;
  title: string;
  beforeLabel: string;
  afterLabel: string;
  beforeAt?: string;
  afterAt?: string;
  changed: boolean;
}

export interface ReviewStamp {
  label: string;
  capturedAt: string;
  note?: string;
}

export interface IngestReview {
  submittedAt: string;
  sourceLabel: string;
  names: string;
  bytes?: number;
  addedCount: number;
  stamps: ReviewStamp[];
  changes: TankMetricChange[];
  changedCount: number;
  summary: string;
  error?: string;
}

export function formatWhen(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function tankMetricLabel(snap: TankSnapshot | undefined): string {
  if (!snap) return "— no reading";
  if (snap.requestUsed != null && snap.requestCap != null) {
    const left = Math.max(0, snap.requestCap - snap.requestUsed);
    return `${left} of ${snap.requestCap} remaining · ${snap.requestUsed} used`;
  }
  if (snap.percentUsed != null) {
    const rem = Math.max(0, 100 - snap.percentUsed);
    const spend = snap.spendUsd != null ? ` · $${snap.spendUsd.toFixed(2)} spent` : "";
    return `${rem.toFixed(1)}% remaining · ${snap.percentUsed.toFixed(1)}% used${spend}`;
  }
  if (snap.spendUsd != null) return `$${snap.spendUsd.toFixed(2)} spent`;
  return "—";
}

export function latestForTank(readings: Reading[], tank: TankId) {
  const rows = sortedReadings(readings).filter((r) => r.tanks[tank]);
  const last = rows[rows.length - 1];
  return last ? { capturedAt: last.capturedAt, snap: last.tanks[tank]! } : undefined;
}

export function diffTankMetrics(before: Reading[], after: Reading[]): TankMetricChange[] {
  return TANK_IDS.map((tank) => {
    const b = latestForTank(before, tank);
    const a = latestForTank(after, tank);
    const beforeLabel = tankMetricLabel(b?.snap);
    const afterLabel = tankMetricLabel(a?.snap);
    const changed = !!a && (!b || beforeLabel !== afterLabel || b.capturedAt !== a.capturedAt);
    return {
      tank,
      title: TANK_META[tank].title,
      beforeLabel,
      afterLabel,
      beforeAt: b?.capturedAt,
      afterAt: a?.capturedAt,
      changed,
    };
  });
}

export function stampsFromReadings(added: Reading[]): ReviewStamp[] {
  if (added.length > 8) {
    const sorted = sortedReadings(added);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    return [
      {
        label: `${added.length} readings in this batch`,
        capturedAt: first.capturedAt,
        note: `Span ${formatWhen(first.capturedAt)} → ${formatWhen(last.capturedAt)}`,
      },
    ];
  }
  return added.map((r) => ({
    label: r.drop?.fileName ?? (r.source === "paste" ? "Pasted text" : r.source),
    capturedAt: r.capturedAt,
    note: r.notes?.[0],
  }));
}

export function buildIngestReview(args: {
  before: Reading[];
  after: Reading[];
  added: Reading[];
  sourceLabel: string;
  names: string;
  bytes?: number;
  summary: string;
  error?: string;
  submittedAt?: string;
}): IngestReview {
  const changes = diffTankMetrics(args.before, args.after);
  return {
    submittedAt: args.submittedAt ?? new Date().toISOString(),
    sourceLabel: args.sourceLabel,
    names: args.names,
    bytes: args.bytes,
    addedCount: args.added.length,
    stamps: stampsFromReadings(args.added),
    changes,
    changedCount: changes.filter((c) => c.changed).length,
    summary: args.summary,
    error: args.error,
  };
}
