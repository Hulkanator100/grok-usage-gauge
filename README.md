# Grok Usage Gauge

Local four-tank page for **Grok Bot weekly**, **Cursor Models (monthly)**, **Other Models (monthly)**, and **Cursor on-demand $**. It never merges those pools into one bar.

This is **not** a Grok Bot that polls usage (that would burn the same weekly pool). It is **not** a public site that stores Cursor/Grok session tokens. v1 is paste-in only.

## Run locally

```bash
npm install
npm run dev
```

Open the printed localhost URL (Vite default is `http://localhost:5173`).

```bash
npm test
npm run build
```

## How to record a reading

1. Open [cursor.com/dashboard/spending](https://cursor.com/dashboard/spending).
2. Copy percent used, reset / billing-cycle end, optional USD (or cents÷100), optional token totals, optional mix **cents**.
3. Paste JSON or labeled text into the page. Set **Captured at** if the snapshot is not “now”.
4. **Save pasted reading**. Two or more timestamped readings unlock burn / empty-at. Three unlock acceleration.

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

**Load example week** seeds two on-pace readings so the page works before a real paste. **Load accelerating week** must warn **empty before weekly reset** on the Grok Bot tank.

## Out of v1 (do not build tanks)

- grok.com SuperGrok week (Chat / Imagine / Voice / Build, iOS/Android Grok, Companions, Tesla Grok signed into that Grok account)
- xAI API prepaid (`api.x.ai`, `cost_in_usd_ticks`, 1 USD = 10^10 ticks)
- X developer API credits (`GET /2/usage/credits`) — **not** Grok-on-X chat
- Message counts (retired June 2026) and Tab completions (unlimited on paid Cursor)

## Later (not this page)

Optional Cursor MCP + status chip, or reading Cursor’s existing **local** login on this machine only. Do not proxy `api2.cursor.sh` or grok.com through Vercel.
