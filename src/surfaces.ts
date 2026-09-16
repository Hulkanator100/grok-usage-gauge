export type SurfaceId =
  | "grok-bot-settings"
  | "grok-bot-chat-banner"
  | "grok-bot-routines"
  | "grok-bot-cua"
  | "grok-bot-mcp"
  | "cursor-spending"
  | "cursor-usage-events"
  | "cursor-editor"
  | "cursor-cli"
  | "cursor-cloud-agent"
  | "cursor-bugbot"
  | "grok-com"
  | "unknown";

export interface SurfaceGuide {
  id: SurfaceId;
  title: string;
  history: string;
  drop: string;
  tank: string;
  fillsTank: boolean;
}

/** How each Bot / Cursor surface actually emits “history,” and what to drop here. */
export const SURFACE_GUIDE: SurfaceGuide[] = [
  {
    id: "grok-bot-settings",
    title: "Grok Bot — Settings → Usage & Billing",
    history:
      "The only official Bot usage meter. Account menu can also show Weekly usage. Shows included weekly % + reset, and on-demand (Billed through Cursor) vs the monthly cap. SuperGrok / X Premium+ titles on that meter are the linked grant, not a second grok.com clock.",
    drop: "Screenshot of Settings → Usage (or the sidebar Weekly usage + on-demand rows). Best source for tank 1 and tank 4.",
    tank: "Grok Bot weekly + Cursor on-demand $",
    fillsTank: true,
  },
  {
    id: "grok-bot-chat-banner",
    title: "Grok Bot — chat / Command Agent / specialist bots",
    history:
      "Every Bot on the Cursor account shares ONE weekly grant (plans do not stack). Chat transcripts are not a usage export. When the pool is empty you get “You’ve reached your Grok Bot usage limit. It resets in N days.” Windows desktop may stay silent instead of showing the banner. Bot-to-bot turns still burn the week. No per-Bot usage CSV.",
    drop: "Screenshot of the limit banner or sidebar Weekly usage. Do not drop chat logs expecting cost — they are not cents.",
    tank: "Grok Bot weekly (100% + reset-in-N-days)",
    fillsTank: true,
  },
  {
    id: "grok-bot-routines",
    title: "Grok Bot — Routines (grok-bot-automation)",
    history:
      "View conversation details → Routines. Run history keeps the 20 most recent runs. Right-click → Copy request ID (support, not billing). Test run spends usage. A saved inactive routine spends nothing. No dollar totals in this panel. Mix cents live on Cursor Spending under grok-bot-automation (cost, not tokens; cache reads inflate tokens).",
    drop: "Routine history screenshots are activity, not a tank fill. Pair with Settings Usage or Spending mix cents.",
    tank: "Does not fill a tank by itself",
    fillsTank: false,
  },
  {
    id: "grok-bot-cua",
    title: "Grok Bot — computer / browser (grok-bot-cua)",
    history:
      "CUA sessions on the Bot PC share the same weekly included pool. There is no public Tesla/CUA usage API and no per-session cost export. Mix line grok-bot-cua is cents on the Cursor account.",
    drop: "No CUA history file to import. Screenshot Settings Usage, or Spending mix cents for grok-bot-cua.",
    tank: "Grok Bot weekly (via Settings / mix cents)",
    fillsTank: false,
  },
  {
    id: "grok-bot-mcp",
    title: "Grok Bot — MCP / plugins on the Bot PC",
    history:
      "Plugin/MCP tool calls are the same Cursor-account weekly grant. Marketplace / Yours lists plugins; that is not a usage ledger.",
    drop: "Plugin lists are not usage. Use Settings Usage.",
    tank: "Grok Bot weekly",
    fillsTank: false,
  },
  {
    id: "cursor-spending",
    title: "Cursor — dashboard Spending",
    history:
      "cursor.com/dashboard/spending: separate Cursor Models % and Other Models % (never one combined bar), on-demand spend vs Monthly Limit, billing-cycle reset. This is the v1 source of truth for tanks 2–4. grok-bot-* rows under Cursor Models are a display bug — header % is Cursor-app usage.",
    drop: "Screenshot or copy of the Spending page. Highest-value drop after Grok Bot Settings.",
    tank: "Cursor Models, Other Models, on-demand $",
    fillsTank: true,
  },
  {
    id: "cursor-usage-events",
    title: "Cursor — dashboard Usage event list / CSV",
    history:
      "cursor.com/dashboard/usage lists per-request model, Kind (Included vs usage-based / On-Demand), tokens, Cost. Export CSV columns matched by name: Date, Kind, Model, Max Mode, Input (w/ Cache Write), Input (w/o Cache Write), Cache Read, Output Tokens, Total Tokens, Cost. Newer exports may add Cloud Agent ID, Automation ID, User. grok-bot-* Included rows fill Bot mix cents — not Cursor Models (that header grouping is a display bug). Composer / grok-4.6 / grok-4.5 → Cursor Models spend. Claude/GPT/etc → Other Models. Usage-based/On-Demand Kind → on-demand $. Cost Included/Free/- = $0 charged. CSV has spend, not unpublished %. Other Models / on-demand % come from plan/cap. Incomplete Chrome .crdownload files are empty and unusable.",
    drop: "Finished .csv from Usage (never a 0-byte .crdownload). Import or paste locally. Daily cumulative readings unlock 2+ burn on tanks with a known cap.",
    tank: "All four tanks as spend (Bot/Cursor Models stay spend-only unless % is known; Other Models/on-demand % from plan/cap)",
    fillsTank: true,
  },
  {
    id: "cursor-editor",
    title: "Cursor editor — usage chip / limit notification",
    history:
      "Editor settings and notifications show Cursor Models vs Other Models included %. Hitting a limit prompts on-demand or upgrade. Tab completions are unlimited on paid plans — not a tank. Header % is Cursor-app usage, not Grok Bot.",
    drop: "Screenshot of the editor usage meters or the limit toast.",
    tank: "Cursor Models and/or Other Models",
    fillsTank: true,
  },
  {
    id: "cursor-cli",
    title: "Cursor CLI — /usage",
    history:
      "In the CLI, /usage shows included-usage meters (Auto / API breakdowns), on-demand spend vs limit, plan name, and billing-cycle reset. CLI work hits the Cursor month (tanks 2/3 and maybe on-demand), not only Grok Bot week.",
    drop: "Screenshot or copied /usage text.",
    tank: "Cursor Models, Other Models, on-demand $",
    fillsTank: true,
  },
  {
    id: "cursor-cloud-agent",
    title: "Cursor Cloud Agents (and Grok Bot-launched agents)",
    history:
      "Team analytics count agents created / PRs / lines — not dollars. Spend shows up as usage events with a Cloud Agent ID. If Grok Bot launches a cloud agent, that run bills Cursor (tanks 2/3 and maybe on-demand) as well as whatever Bot week already spent. Show both; do not merge.",
    drop: "Spending/Usage screenshot that includes the cloud-agent request, not the analytics CSV of agent counts.",
    tank: "Cursor Models / Other Models / on-demand (coupling)",
    fillsTank: true,
  },
  {
    id: "cursor-bugbot",
    title: "Bugbot",
    history:
      "Reviews live on GitHub PRs. Team analytics (Enterprise) have per-PR issue counts — not personal $ tanks. Bugbot usage still hits the Cursor month (usually Other Models / on-demand).",
    drop: "No Bugbot usage export for individuals. Use Spending after Bugbot runs.",
    tank: "Other Models / on-demand",
    fillsTank: false,
  },
  {
    id: "grok-com",
    title: "grok.com / SuperGrok / Tesla Grok (out of v1)",
    history:
      "Settings → Usage has % + product split + reset + Extra Usage $. Free Chat/Voice have a second shorter clock after 100%. That is a different account meter than Cursor Grok Bot. Tesla in-car Grok follows the signed-in Grok account. No public Tesla usage API.",
    drop: "Recognized so we can warn: do not mix into these four tanks.",
    tank: "Out of v1 — no tank",
    fillsTank: false,
  },
];

