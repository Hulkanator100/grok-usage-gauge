export type SurfaceId =
  | "grok-bot-settings"
  | "grok-bot-chat-banner"
  | "grok-bot-routines"
  | "grok-bot-cua"
  | "grok-bot-mcp"
  | "cursor-spending"
  | "cursor-usage-dashboard"
  | "cursor-usage-events"
  | "cursor-editor"
  | "cursor-cli"
  | "cursor-cloud-agent"
  | "cursor-bugbot"
  | "grok-com"
  | "x-grok-windows"
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
    drop: "Screenshot of Settings → Usage (or the sidebar Weekly usage + extra-pay rows). Best source for Grok Bot week and Cursor extra-pay dollars.",
    tank: "Grok Bot weekly + Cursor on-demand $",
    fillsTank: true,
  },
  {
    id: "grok-bot-chat-banner",
    title: "Grok Bot — chat / Command Agent / specialist bots",
    history:
      "Every Bot on the Cursor account shares ONE weekly grant (plans do not stack). Chat transcripts are not a usage export. When the pool is empty you get “You’ve reached your Grok Bot usage limit. It resets in N days.” Windows desktop may stay silent instead of showing the banner. Bot-to-bot turns still burn the week. There is no per-Bot usage spreadsheet.",
    drop: "Screenshot of the limit banner or sidebar Weekly usage. Do not drop chat logs expecting cost — they are not cents.",
    tank: "Grok Bot weekly (100% + reset-in-N-days)",
    fillsTank: true,
  },
  {
    id: "grok-bot-routines",
    title: "Grok Bot — Routines",
    history:
      "View conversation details → Routines. Run history keeps the 20 most recent runs. Copy request ID is for support, not billing. A test run spends usage. A saved inactive routine spends nothing. No dollar totals here. Mix cents live on Cursor Spending under scheduled routines (cost, not tokens; cache reads puff token counts).",
    drop: "Routine history screenshots are activity, not a tank fill. Pair with Settings Usage or Spending mix cents.",
    tank: "Does not fill a tank by itself",
    fillsTank: false,
  },
  {
    id: "grok-bot-cua",
    title: "Grok Bot — computer / browser",
    history:
      "Computer-use sessions on the Bot share the same weekly included pool. There is no public per-session cost export. Cents show up on Cursor Spending as computer / browser mix.",
    drop: "There is no computer-use history file to import. Screenshot Settings Usage, or Spending mix cents for computer / browser.",
    tank: "Grok Bot weekly (via Settings / mix cents)",
    fillsTank: false,
  },
  {
    id: "grok-bot-mcp",
    title: "Grok Bot — plugins",
    history:
      "Plugin tool calls are the same Cursor-account weekly grant. Marketplace / Yours lists plugins; that is not a usage ledger.",
    drop: "Plugin lists are not usage. Use Settings Usage.",
    tank: "Grok Bot weekly",
    fillsTank: false,
  },
  {
    id: "cursor-spending",
    title: "Cursor — dashboard Spending",
    history:
      "cursor.com/dashboard/spending: separate Cursor Models % and Other Models % (never one combined bar), extra-pay spend vs Monthly Limit, billing-cycle reset. This is the source of truth for Cursor Models, Other Models, and extra pay. grok-bot rows under Cursor Models are a display bug — the header % is Cursor-app usage.",
    drop: "Screenshot or copy of the Spending page. Highest-value drop after Grok Bot Settings.",
    tank: "Cursor Models, Other Models, on-demand $",
    fillsTank: true,
  },
  {
    id: "cursor-usage-dashboard",
    title: "Cursor — dashboard Usage (token chart)",
    history:
      "cursor.com/dashboard/usage shows Total tokens / Included / On-demand for the selected 1d · 7d · 30d · MTD range, plus a cumulative chart grouped by model. Those cards are token counts, not tank %. Cost in the table is often the word Included or Free. Export a spreadsheet for dollars. Spending is the % meters for Cursor Models / Other Models.",
    drop: "A screenshot is recognized (tokens + extra-pay 0 in that window). Prefer the Usage export or a Spending screenshot for tank %. Do not treat 108M tokens as 108% used.",
    tank: "Extra-pay $0 if the On-demand token card is 0; Cursor/Other get token context only. Chart range is not Bot weekly reset.",
    fillsTank: true,
  },
  {
    id: "cursor-usage-events",
    title: "Cursor — dashboard Usage event list / spreadsheet",
    history:
      "cursor.com/dashboard/usage lists each request’s model, Kind (Included vs extra pay), tokens, and Cost. Export columns we match by name: Date, Kind, Model, Max Mode, Input (w/ Cache Write), Input (w/o Cache Write), Cache Read, Output Tokens, Total Tokens, Cost. grok-bot Included rows fill Bot mix cents — not Cursor Models (that header grouping is a display bug). Composer / grok-4.6 / grok-4.5 → Cursor Models spend. Claude/GPT/etc → Other Models. Extra-pay Kind → extra-pay dollars. Cost Included/Free/- = $0 charged. The spreadsheet has spend, not hidden %. Other Models / extra-pay % come from your plan and cap. Incomplete Chrome downloads are empty and unusable.",
    drop: "A finished spreadsheet from Usage (never a still-downloading Chrome file). Add or paste it here. Daily totals unlock empty-by dates on tanks with a known cap.",
    tank: "All four Cursor tanks as spend (Bot/Cursor Models stay spend-only unless % is known; Other Models/extra-pay % from plan/cap)",
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
      "In the CLI, /usage shows included-usage meters (Auto / API breakdowns), extra-pay spend vs limit, plan name, and billing-cycle reset. CLI work hits the Cursor month (Cursor Models, Other Models, and maybe extra pay), not only Grok Bot week.",
    drop: "Screenshot or copied /usage text.",
    tank: "Cursor Models, Other Models, on-demand $",
    fillsTank: true,
  },
  {
    id: "cursor-cloud-agent",
    title: "Cursor Cloud Agents (and Grok Bot-launched agents)",
    history:
      "Team analytics count agents created / PRs / lines — not dollars. Spend shows up as usage events with a Cloud Agent ID. If Grok Bot starts a cloud agent, that run bills Cursor (Cursor Models, Other Models, and maybe extra pay) as well as whatever Bot week already spent. Show both; do not add them together.",
    drop: "Spending/Usage screenshot that includes the cloud-agent request, not the analytics export of agent counts.",
    tank: "Cursor Models / Other Models / extra pay (plus Bot week if Grok Bot started it)",
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
    title: "grok.com / SuperGrok / Tesla Grok (not these tanks)",
    history:
      "No public Tesla usage export. Settings → Usage has % + product split + reset + Extra Usage $. Free Chat/Voice have a second shorter clock after 100%. That is a different account meter than Cursor Grok Bot. Tesla in-car Grok follows the signed-in Grok account.",
    drop: "Recognized and rejected: Weekly SuperGrok Limit, Extra Usage Credits, Auto Top-Up, Buy Credits. Do not mix into these four tanks. Use Cursor Grok Bot Settings → Usage instead.",
    tank: "Not these tanks",
    fillsTank: false,
  },
  {
    id: "x-grok-windows",
    title: "X — Grok Light / Medium / Heavy (2-hour replies)",
    history:
      "Grok on x.com / the X app counts Light (Fast/default), Medium (Think), and Heavy as three separate reply grants that refill about every two hours. That is not Cursor Grok Bot week, not Cursor Models, and not grok.com SuperGrok weekly %. X developer prepaid credits are a different meter and stay out of these tanks.",
    drop: "Screenshot or paste of the X Grok usage strip: Light 42/50, Medium 11/20, Heavy 2/10, Resets in 1 hour 18 minutes. Do not drop this onto Cursor tanks.",
    tank: "X Grok Light, Medium, Heavy — never merged with Cursor",
    fillsTank: true,
  },
];

