# Mandate: user flows (check after every UI change)

Prepared by Andrey Alchin with Perplexity Computer.

| Flow | Where | Expected |
|---|---|---|
| Link PayPal | Setup step 1 | PayPal popup with the test buyer; $1.00 authorization is voided; step 2 opens |
| Describe by voice or text | Setup step 2 | Mic fills the box (Chrome, Edge, Safari); example chips fill it too; "Draft my mandate" returns terms |
| Review and sign | Setup step 3 | Editable terms; "Sign mandate" opens the dashboard |
| Chat purchase within rules | Agent: suggestion "Grab a pack of filters" | Step chips: results, Mandate check: Allowed, Paid with PayPal; receipt appears in Activity |
| Live product search | "Cheapest real V60 filters" | Channel3 product strip; real-store item bought in sandbox |
| Approval | "Replace my burr grinder" | Approval card (phone switches to the Activity tab with a badge); PayPal approve gives a receipt |
| Prompt injection | "Try a prompt injection" | Mandate check: Blocked; blocked row in Activity; no money moves |
| Undo | Tap a receipt row, then Undo | Refund; row struck through; budget restored |
| Revoke | Mandate card, Revoke then confirm | Status Revoked; composer disabled; "Create a new mandate" shown |
| Outside agent | Outside agents, Connect an agent | Key, MCP URL, and claude mcp add command, each copyable once |
| Spend console | Console tab | Overview and Agents pages; phone shows a single-column stack with no sideways page scroll |
| Auditor | Console, Ask the auditor (desktop) | AI panel proposes a layout change as a draft |

Breakpoints: three columns at 1240px and above, two columns at 900–1239px, a Chat / Activity / Mandate switcher below 900px.

## Navigation (v3)
Top tabs: **Agent** (`#/`), **Orders** (`#/orders`), **Spending** (`#/spending`, `#/console` still works). Account menu is the person icon, top right.

## Mandates: active and archived
On the Agent page, the button at the top of the mandate card opens the switcher. Tabs **Active / Archived** list every mandate this browser owns; pick one to open it, or **New mandate** to start the setup again (the PayPal link is reused). The current mandate is remembered in `localStorage["mandate.current"]`.

## Orders (what was bought, where it ships, receipts)
- Filters: All / Paid / Refunded, and a mandate picker. Totals sit at the right; **Export CSV** downloads the filtered list.
- Click any order: items with shop, **Delivery** (ship-to read from the PayPal order), **PayPal receipt** (order ID and capture ID with Copy, PayPal status, payer), **Why it was allowed** (rule, mandate, agent's reason), **Print receipt**, and **Undo** (refund) while it's still paid.
- `GET /api/receipts/:id/details` returns 404 for receipts owned by another session.

## Spending
Tabs Overview / Agents. Filters: period (This month / 30 / 90 days / All time), mandate, and **Your data / Sample** (sample is a simulated household run through the real policy engine; no PayPal calls). **Ask AI about my spending** opens the AG Studio agent (desktop). Export CSV covers the filtered attempts.

## Start over (multiple testers on one login)
Data belongs to the browser session, never shared across testers. Account menu:
- **Start fresh**: deletes this browser's mandates, orders, agent keys and history; PayPal stays linked.
- **New tester**: same, and also unlinks PayPal and drops the session cookie, so the next person starts at setup.
