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
