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
    clock: "Weekly clock (~7 days / 604800s)",
    surfaces: "Chats, routines, CUA, MCP on the Bot PC. Cursor account cost, not grok.com.",
    grantNote: "Included grant is unpublished. Implied $ = spend ÷ (% used) when % ≥ 0.5.",
  },
  cursorModelsMonthly: {
    title: "Cursor Models",
    clock: "Monthly billing cycle",
    surfaces: "Editor Grok 4.6 / 4.5 + Composer 2.5. Header % is Cursor-app usage, not grok-bot-* rows.",
    grantNote: "“Generous” unpublished included amount. Do not sum with other tanks.",
  },
  otherModelsMonthly: {
    title: "Other Models",
    clock: "Monthly billing cycle",
    surfaces: "Claude / GPT / etc. Cloud Agents, Bugbot, and CLI also hit this Cursor month.",
    grantNote: "Public included $: Pro ~$20 · Pro+ ~$70 · Ultra ~$400 (Other Models / API agent).",
  },
  onDemandMonthly: {
    title: "Cursor on-demand $",
    clock: "Monthly cap",
    surfaces: "Real USD overflow from Cursor and from Grok Bot after Bot week hits 100% (if on-demand is on).",
    grantNote: "Charge order: Bot week → promo credits → paid on-demand. $0 cap = hard stop.",
  },
  xGrokLight: {
    title: "X Grok Light",
    clock: "Rolling ~2 hour request window (7200s)",
    surfaces: "Grok on x.com / the X app. Light / Fast / default requests. Separate from Cursor tanks and from grok.com SuperGrok week.",
    grantNote: "Counted as requests this window, not Cursor $. Paste 42/50 or remaining. Fallback cap follows the X plan control.",
  },
  xGrokMedium: {
    title: "X Grok Medium",
    clock: "Rolling ~2 hour request window (7200s)",
    surfaces: "Grok on X Think / Medium mode. Does not share a bar with Light or Heavy, and does not fill Cursor Models.",
    grantNote: "Same 2-hour clock as Light/Heavy but its own request grant.",
  },
  xGrokHeavy: {
    title: "X Grok Heavy",
    clock: "Rolling ~2 hour request window (7200s)",
    surfaces: "Grok on X Heavy mode (multi-agent). Not SuperGrok Heavy the grok.com plan, and not Cursor Grok Bot.",
    grantNote: "Requests this window only. Never summed with Light, Medium, or Cursor.",
  },
};
