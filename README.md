# Grok Usage Gauge

Local four-tank page for **Grok Bot weekly**, **Cursor Models (monthly)**, **Other Models (monthly)**, and **Cursor on-demand $**. It never merges those pools into one bar.

This is **not** a Grok Bot that polls usage (that would burn the same weekly pool). It is **not** a public site that stores Cursor/Grok session tokens. v1 is local drop / paste / CSV import only — no API scrape, no Bearer tokens, no `state.vscdb`.

## Drop screenshots or files

Chrome often leaves `usage-events-*.csv.crdownload` at **0 bytes**. The gauge rejects that as an unfinished Chrome download — re-export a finished file from [cursor.com/dashboard/usage](https://cursor.com/dashboard/usage).

**Drop screenshots** (png/jpg/webp) or a finished usage-events `.csv`. Paste CSV in the box. **Load bundled usage-events CSV** uses `public/usage-events-2026-09-16.csv` (Sep 2026, all four tanks, grok-bot mix, a cloud-agent Other Models row). OCR for screenshots is in-browser; nothing is uploaded.

| Surface | What history actually is | What to drop | Tank |
| --- | --- | --- | --- |
| Grok Bot Settings → Usage & Billing | Weekly included % + reset; on-demand billed through Cursor | Screenshot of Usage | Bot week + on-demand |
| Chat / Command Agent / other Bots | Shared **one** weekly grant. Banner: usage limit, resets in N days. Transcripts are not cents. | Limit banner / sidebar Weekly usage | Bot week |
| Routines | Last **20** runs, Copy request ID | Not a tank fill | — |
| CUA / computer | Same weekly pool; no per-session export | Settings Usage or mix cents `grok-bot-cua` | Bot week |
| MCP / plugins | Same weekly pool; Marketplace is not a ledger | Settings Usage | Bot week |
| cursor.com/dashboard/spending | Separate Cursor Models % and Other Models % + on-demand cap | **Best screenshot for tanks 2–4** | Cursor / Other / on-demand |
| cursor.com/dashboard/usage (this page) | Token cards + chart (1d/7d/MTD). Not tank %. Table Cost is often Included/Free. | Screenshot is ingested as tokens + on-demand 0 in that window. **Export CSV** for $. | Token context; on-demand $0 if the On-demand card is 0. Not Bot-week reset. |
| dashboard/usage CSV | Per-event Kind, Model, tokens, Cost. Headers matched by name; extra Cloud Agent ID / Automation ID / User ok. Included grok-bot-* → Bot mix cents (not Cursor Models). composer / grok-4.6 / grok-4.5 → Cursor Models spend. claude/gpt → Other Models. Usage-based/On-Demand Kind → on-demand $. Cost Included/Free/- = $0 charged. | Finished `.csv` (file picker accepts `.csv,.crdownload`) or paste | Spend on all four tanks; Other Models / on-demand % from plan/cap; Bot/Cursor Models stay spend-only unless % is known. Daily cumulative readings for 2+ burn. |
| Editor usage chip | Cursor-app % (not grok-bot-* rows) | Screenshot of meters / limit toast | Cursor / Other |
| CLI `/usage` | Auto/API included meters, on-demand vs limit, reset | Screenshot or copied `/usage` | Cursor month |
| Cloud Agents | Analytics = counts; dollars = usage events. Grok Bot-launched agents also hit Cursor month | Spending screenshot | Tanks 2/3/(4) **and** Bot week |
| Bugbot | GitHub PR reviews; team analytics ≠ $ | Spending after runs | Other / on-demand |
| grok.com Settings → Usage | SuperGrok week, product split, Extra Usage $ | **Out of v1** — rejected | none |

Sample droppable text lives in `public/samples/`.

## Persistence (no terminal left open for a week)

You do **not** need a process running for seven days. The four tanks are stored in **this browser on this PC** (`localStorage` key `grok-usage-gauge.v1`). Sleep, shutdown, and reboot keep that copy. The terminal is only a web server for the minutes you have the page open.

GitHub can host the **app** (static GitHub Pages). GitHub cannot be a live database the page writes to: Pages is read-only files, there is no always-on server, and this project is not a public usage ledger.

**Week test without `npm run dev`:** once Pages is enabled, open `https://hulkanator100.github.io/grok-usage-gauge/` in Edge. Same Edge profile + that URL = the same history after you turn the PC off.

**Off-PC backup (optional):** **Download history JSON**, keep the file in a **private** gist or private repo (do not commit usage to a public repo). **Restore history JSON** (or drop that file) reloads it. That is a file you copy, not a GitHub database.

Repo → **Settings → Pages → Build and deployment → GitHub Actions**. The workflow `.github/workflows/pages.yml` publishes `dist` from `main` and from this branch.

## Run locally (optional)

The Cloud Agent / Cursor Simple Browser is **not** Microsoft Edge on your PC.

```powershell
git clone -b cursor/grok-usage-gauge-d2dc https://github.com/Hulkanator100/grok-usage-gauge.git
cd grok-usage-gauge
npm install
npm run dev
```

Then in **Edge** open **http://127.0.0.1:5173**. You can close that terminal when you close the tab. History stays in Edge until you **Clear local data** or wipe the site’s data.

```bash
npm test
npm run build
npm run preview
```

## How to record a reading

1. Open [cursor.com/dashboard/spending](https://cursor.com/dashboard/spending) or Grok Bot **Settings → Usage**.
2. Drop a screenshot, paste an image, or copy percent used, reset, optional USD, optional mix **cents**.
3. Set **Captured at** if the snapshot is not “now”, then **Save pasted reading** if you typed text.
4. Two or more timestamped readings unlock burn / empty-at. Three unlock acceleration.

Readings live in this browser’s `localStorage` key `grok-usage-gauge.v1`. **Clear local data** wipes them. Nothing is posted to a server.

Do **not** paste API keys, Bearer tokens, or `state.vscdb`. Official session APIs exist (`GetSandUsageStatus`, `GetCurrentPeriodUsage`, grok.com billing, xAI `/v1/api-key`) — v1 does not call or proxy them.

### Example JSON

```json
{
  "capturedAt": "2026-09-16T18:40:00Z",
  "grokBotWeekly": {
    "percentUsed": 61.4,
    "periodStart": "2026-09-10T00:00:00Z",
    "periodEnd": "2026-09-17T00:00:00Z",
    "spendUsd": 4.3,
    "mixCents": {
      "grok-bot-default": 210,
      "grok-bot-automation": 145,
      "grok-bot-cua": 75
    }
  },
  "cursorModelsMonthly": {
    "percentUsed": 28,
    "periodStart": "2026-09-01T00:00:00Z",
    "periodEnd": "2026-10-01T00:00:00Z",
    "spendUsd": 6.1
  },
  "otherModelsMonthly": {
    "percentUsed": 9,
    "spendUsd": 1.8
  },
  "onDemandMonthly": {
    "spendUsd": 0,
    "capUsd": 20
  }
}
```

## The four tanks (v1)

| Tank | Clock | What it is |
| --- | --- | --- |
| Grok Bot weekly included | ~7 day / 604800s reset | Cursor **account** cost ÷ unpublished Bot grant. Surfaces: chats, routines, CUA, MCP on the Bot PC. Separate from grok.com. |
| Cursor Models | Monthly billing cycle | Editor Grok 4.6 / 4.5 + Composer 2.5. “Generous” unpublished included amount. Header % is Cursor-app usage; `grok-bot-*` rows under Cursor Models were a **display bug**. |
| Other Models | Monthly | Claude / GPT / etc. Public included $: Pro ~$20 / Pro+ ~$70 / Ultra ~$400 for Other Models / API agent. Cloud Agents, Bugbot, and CLI also hit the Cursor month. |
| Cursor on-demand $ | Monthly cap | Real USD overflow from Cursor **and** from Grok Bot after Bot week hits 100% if on-demand is on. Charge order: Bot week → promo credits → paid on-demand. **$0 cap = hard stop**. |

Weekly Bot % is **cost-based** (input / output / cache at model rates ÷ unpublished weekly grant), **not** raw tokens. Mix must be **cents**: `grok-bot-default` (chat), `grok-bot-automation` (routines), `grok-bot-cua` (computer/browser). Routines re-send conversation context; cache reads inflate token totals.

Implied grant $ = `spend_usd / (percent_used / 100)` when percent ≥ ~0.5. Cursor does not publish the weekly dollar size.

### Coupling (show both, do not merge)

If Grok Bot launches a Cursor cloud agent, that run bills Cursor (tanks 2/3 and maybe on-demand), not only the Bot week.

### Plans do not stack

Cursor + SuperGrok + X Premium+ for Grok Bot = **one** Bot grant (the larger) on the Cursor account. Linking SuperGrok is a Cursor usage grant, not a second grok.com meter.

## Metrics per tank

- Remaining = 100 − % used; remaining $ if spend/cap known
- Reset / period end
- Pace = (fraction used) / (fraction of period elapsed). **1.0×** = on calendar budget
- Range / empty-at if the latest interval’s burn continues (needs 2+ readings)
- Acceleration: if the newest interval is **>~15% faster** than the previous **and** projected empty is before reset, warn with clock time and hours early

**Load example week** seeds two on-pace readings so the page works before a real paste. **Load accelerating week** must warn **empty before weekly reset** on the Grok Bot tank. **Load bundled usage-events CSV** seeds daily cumulative spend from the sample export.

## Out of v1 (do not build tanks)

- grok.com SuperGrok week (Chat / Imagine / Voice / Build, iOS/Android Grok, Companions, Tesla Grok signed into that Grok account)
- xAI API prepaid (`api.x.ai`, `cost_in_usd_ticks`, 1 USD = 10^10 ticks)
- X developer API credits (`GET /2/usage/credits`) — **not** Grok-on-X chat
- Message counts (retired June 2026) and Tab completions (unlimited on paid Cursor)

## Later (not this page)

Optional Cursor MCP + status chip, or reading Cursor’s existing **local** login on this machine only. Do not proxy `api2.cursor.sh` or grok.com through Vercel.
