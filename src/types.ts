export const CURSOR_TANK_IDS = [
  "grokBotWeekly",
  "cursorModelsMonthly",
  "otherModelsMonthly",
  "onDemandMonthly",
] as const;

export const X_GROK_TANK_IDS = ["xGrokLight", "xGrokMedium", "xGrokHeavy"] as const;

export const TANK_IDS = [...CURSOR_TANK_IDS, ...X_GROK_TANK_IDS] as const;

export type TankId = (typeof TANK_IDS)[number];
export type CursorTankId = (typeof CURSOR_TANK_IDS)[number];
export type XGrokTankId = (typeof X_GROK_TANK_IDS)[number];

export function isXGrokTank(id: TankId): id is XGrokTankId {
  return (X_GROK_TANK_IDS as readonly string[]).includes(id);
}

export type XGrokPlan = "free" | "premium" | "premiumPlus";

/** Fallback request caps for Grok-on-X Light / Medium / Heavy 2-hour windows. Paste of 12/50 overrides. */
export const X_GROK_CAPS: Record<XGrokPlan, { light: number; medium: number; heavy: number }> = {
  free: { light: 20, medium: 10, heavy: 5 },
  premium: { light: 50, medium: 20, heavy: 10 },
  premiumPlus: { light: 100, medium: 30, heavy: 10 },
};

export type CursorPlan = "pro" | "proPlus" | "ultra" | "custom";

export const OTHER_MODELS_INCLUDED_USD: Record<Exclude<CursorPlan, "custom">, number> = {
  pro: 20,
  proPlus: 70,
  ultra: 400,
};

export const MIX_KEYS = ["grok-bot-default", "grok-bot-automation", "grok-bot-cua"] as const;
export type MixKey = (typeof MIX_KEYS)[number];

export interface MixCents {
  "grok-bot-default"?: number;
  "grok-bot-automation"?: number;
  "grok-bot-cua"?: number;
  [key: string]: number | undefined;
}

export interface TokenTotals {
  input?: number;
  output?: number;
  cacheRead?: number;
  /** Dashboard Usage chart / card totals (not input vs output). Not tank %. */
  total?: number;
}

export interface TankSnapshot {
  percentUsed?: number;
  periodStart?: string;
  periodEnd?: string;
  spendUsd?: number;
  capUsd?: number;
  /** Grok-on-X Light/Medium/Heavy: requests used in the current ~2h window. */
  requestUsed?: number;
  requestCap?: number;
  mixCents?: MixCents;
  tokenTotals?: TokenTotals;
}

export type ReadingSource =
  | "paste"
  | "example"
  | "accelerating-example"
  | "screenshot"
  | "drop"
  | "csv"
  | "csv-sample";

export interface DropMeta {
  fileName: string;
  mime: string;
  previewDataUrl?: string;
  byteLength?: number;
  unfinishedChromeDownload?: boolean;
}

export interface Reading {
  id: string;
  capturedAt: string;
  tanks: Partial<Record<TankId, TankSnapshot>>;
  source: ReadingSource;
  rawPaste?: string;
  surface?: string;
  notes?: string[];
  drop?: DropMeta;
}

export interface AppSettings {
  plan: CursorPlan;
  customOtherModelsUsd: number;
  onDemandCapUsd: number;
  xPlan: XGrokPlan;
  xLightCap: number;
  xMediumCap: number;
  xHeavyCap: number;
}

export interface LastImport {
  names: string;
  bytes: number;
  extracted: string;
  summary: string;
}

export interface StoredState {
  version: 1;
  readings: Reading[];
  settings: AppSettings;
  lastImport?: LastImport;
}

export const DEFAULT_SETTINGS: AppSettings = {
  plan: "pro",
  customOtherModelsUsd: 20,
  onDemandCapUsd: 20,
  xPlan: "premiumPlus",
  xLightCap: 100,
  xMediumCap: 30,
  xHeavyCap: 10,
};

export const TANK_META: Record<
  TankId,
  {
    title: string;
    clock: string;
    surfaces: string;
    grantNote: string;
  }
> = {
  grokBotWeekly: {
    title: "Grok Bot weekly",
    clock: "Refills about once a week",
    surfaces: "Chats, scheduled routines, computer use, and plugins on the Bot. This is Cursor-account cost, not grok.com.",
    grantNote: "Cursor does not publish the included dollar amount. When you have both spend and % used, we estimate it.",
  },
  cursorModelsMonthly: {
    title: "Cursor Models",
    clock: "Resets with your Cursor billing month",
    surfaces: "Grok and Composer in the Cursor app. The big % on Spending is this tank — not the grok-bot rows underneath.",
    grantNote: "Included dollars are unpublished. Do not add this tank to the others.",
  },
  otherModelsMonthly: {
    title: "Other Models",
    clock: "Resets with your Cursor billing month",
    surfaces: "Claude, GPT, and similar. Cloud Agents, Bugbot, and the Cursor CLI also spend this month.",
    grantNote: "Published included dollars: Pro about $20 · Pro+ about $70 · Ultra about $400.",
  },
  onDemandMonthly: {
    title: "Cursor on-demand $",
    clock: "Monthly extra-pay cap",
    surfaces: "Real dollars after included pools run out — from Cursor and from Grok Bot once the Bot week is empty (if extra pay is on).",
    grantNote: "Cursor bills Bot week first, then promo credits, then this. Slide the cap to $0 to stop extra charges.",
  },
  xGrokLight: {
    title: "X Grok Light",
    clock: "Refills about every 2 hours",
    surfaces: "Grok on x.com or the X app, Fast / default replies. Not a Cursor tank and not grok.com SuperGrok.",
    grantNote: "Counted as replies this window, not Cursor dollars. A paste like 42 of 50 beats the plan guess.",
  },
  xGrokMedium: {
    title: "X Grok Medium",
    clock: "Refills about every 2 hours",
    surfaces: "Grok on X in Think / Medium. Its own count — not shared with Light or Heavy, and not Cursor Models.",
    grantNote: "Same two-hour clock as Light and Heavy, but a separate reply limit.",
  },
  xGrokHeavy: {
    title: "X Grok Heavy",
    clock: "Refills about every 2 hours",
    surfaces: "Grok on X Heavy mode. Not SuperGrok Heavy on grok.com, and not Cursor Grok Bot.",
    grantNote: "Replies this window only. Never added to Light, Medium, or Cursor.",
  },
};
