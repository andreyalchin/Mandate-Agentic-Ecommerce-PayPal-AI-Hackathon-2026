import type { MandateService } from "../mandate/service.js";
import { evaluate, type SpendRecord } from "../mandate/policy.js";
import type { CartLine, Category, IntentMandate, Receipt, ShipTo } from "../mandate/types.js";

/** One row per agent payment attempt: the spend console's fact table. */
export interface AttemptRow {
  id: string; at: string; day: string; source: "Live" | "Simulated";
  mandateId: string; agent: string; merchant: string; item: string; category: string;
  amount: number; spent: number; spentThisMonth: number; blockedAmount: number; attempts: number;
  outcome: "Allowed" | "Approved by you" | "Waiting for you" | "Declined by you" | "Blocked" | "Refunded";
  decision: "allow" | "needs_approval" | "deny"; rule: string; reason: string; rationale: string; paypalOrderId: string;
  /** Short mandate name for filters and labels, e.g. "Coffee · $60/mo". */ mandate: string; /** "$9.00" for grids. */ amountText?: string; image?: string; shipTo?: string;
}
export interface MandateRow { id: string; title: string; summary: string; budget: number; period: string; askAbove: number; status: string; source: "Live" | "Simulated" }

const PER: Record<string, string> = { month: "/mo", week: "/wk", once: " total" };
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
/** "Coffee & kitchen · $60/mo": short enough for a dropdown or a chart label. */
export function mandateTitle(m: Pick<IntentMandate, "categories" | "budget">) {
  const cats = m.categories.slice(0, 2).map(cap).join(" & ").replace(/ & (\w)/, (_x, c) => ` & ${c.toLowerCase()}`) + (m.categories.length > 2 ? " +" : "");
  return `${cats} · $${Number(m.budget.amount).toFixed(0)}${PER[m.budget.period] ?? ""}`;
}

const RULE_LABEL: Record<string, string> = {
  within_mandate: "Within mandate", approval_threshold: "Over ask-above", budget: "Over budget", category: "Category not allowed",
  merchant: "Shop not allowed", per_purchase_max: "Over per-purchase max", agent: "Agent not allowed", expired: "Mandate expired", revoked: "Mandate revoked", signature: "Bad signature", approval: "Your approval",
};
export const ruleLabel = (r: string) => RULE_LABEL[r] ?? r;
const agentName = (id: string) => (id.startsWith("mcp:") ? id.slice(4) : id === "mandate-claude-agent" ? "Shopping agent" : id);
const usd = (c: number) => Math.round(c) / 100;
function withThisMonth(rows: AttemptRow[], now = new Date()) { const m = now.toISOString().slice(0, 7); for (const r of rows) { r.spentThisMonth = r.at.slice(0, 7) === m ? r.spent : 0; r.amountText = `$${r.amount.toFixed(2)}`; } }

/** Live rows from the mandate service: receipts, pending/declined approvals and blocked attempts. */
export function liveRows(svc: MandateService): { attempts: AttemptRow[]; mandates: MandateRow[] } {
  const attempts: AttemptRow[] = [];
  const titles = new Map([...svc.mandates.values()].map((m) => [m.id, mandateTitle(m)]));
  const base = (at: string, mandateId: string, agentId: string, lines: { name: string; quantity: number; merchant: string; category: string; image?: string }[]) => ({
    at, day: at.slice(0, 10), source: "Live" as const, mandateId, mandate: titles.get(mandateId) ?? "", image: lines[0]?.image, agent: agentName(agentId), merchant: lines[0]?.merchant ?? "", category: lines[0]?.category ?? "",
    item: lines.map((l) => `${l.quantity > 1 ? `${l.quantity} × ` : ""}${l.name}`).join(", "), attempts: 1,
  });
  for (const r of svc.receipts.values()) {
    const approved = r.allowedBy.startsWith("approval:");
    attempts.push({ id: r.id, ...base(r.at, r.mandateId, r.agentId, r.lines), amount: usd(r.totalCents), spent: r.status === "refunded" ? 0 : usd(r.totalCents), spentThisMonth: 0, blockedAmount: 0,
      outcome: r.status === "refunded" ? "Refunded" : approved ? "Approved by you" : "Allowed", decision: approved ? "needs_approval" : "allow",
      rule: ruleLabel(approved ? "approval" : "within_mandate"), reason: r.reason, rationale: r.rationale, paypalOrderId: r.orderId, shipTo: r.shipTo ? [r.shipTo.city, r.shipTo.region].filter(Boolean).join(", ") : undefined });
  }
  for (const c of svc.carts.values()) {
    if (c.status === "approved") continue; // shows as its receipt
    attempts.push({ id: c.id, ...base(c.createdAt, c.mandateId, c.agentId, c.lines), amount: usd(c.totalCents), spent: 0, spentThisMonth: 0, blockedAmount: 0,
      outcome: c.status === "pending" ? "Waiting for you" : "Declined by you", decision: "needs_approval", rule: ruleLabel(c.policy.rule), reason: c.policy.reason, rationale: c.rationale, paypalOrderId: c.orderId ?? "" });
  }
  for (const e of svc.log) {
    if (e.decision !== "deny") continue;
    attempts.push({ id: e.id, at: e.at, day: e.at.slice(0, 10), source: "Live", mandateId: e.mandateId, mandate: titles.get(e.mandateId) ?? "", agent: agentName(e.agentId), merchant: "", item: e.items, category: "", amount: usd(e.totalCents), spent: 0, spentThisMonth: 0, blockedAmount: usd(e.totalCents), attempts: 1,
      outcome: "Blocked", decision: "deny", rule: ruleLabel(e.rule), reason: e.reason, rationale: e.rationale, paypalOrderId: "" });
  }
  withThisMonth(attempts);
  const mandates = [...svc.mandates.values()].map((m) => ({ id: m.id, title: titles.get(m.id)!, summary: m.summary, budget: Number(m.budget.amount), period: m.budget.period, askAbove: Number(m.approvalAbove), status: m.status, source: "Live" as const }));
  return { attempts, mandates };
}

/** Deterministic PRNG so the simulated history is identical on every load. */
function rng(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

type SimProduct = [name: string, price: string, category: Category, merchant: string];
type Sim = IntentMandate & { agentsList: string[]; products: SimProduct[]; rate: number };
const SIM_SHIP: ShipTo = { name: "Jordan Lee", line1: "742 Maple Ave", city: "Portland", region: "OR", postalCode: "97205", country: "US" };
const WHY = ["Running low, so it reordered the usual.", "Cheapest in-stock option across the shops it checked.", "Regular reorder: the last one was about three weeks ago.", "You asked for this in chat.", "On sale today, under your usual price."];

/** The simulated household: five mandates, seven agents, everyday products. Shared by Spending and Orders. */
function sims(created: string): Sim[] {
  const base = { userId: "sim", walletRef: "sim", currency: "USD", expiresAt: "2027-12-31T00:00:00Z", createdAt: created, status: "active", signature: "sim" } as const;
  return [
    { ...base, id: "sim_coffee", summary: "Coffee and kitchen supplies up to $120 a month, ask me above $25", budget: { amount: "120.00", period: "month" }, approvalAbove: "25.00", categories: ["coffee", "kitchen"], rate: 0.3,
      agentsList: ["Shopping agent", "Claude Code"], products: [["Single-origin coffee beans, 1 lb", "18.00", "coffee", "Ridgeline Roasters"], ["Paper filters, 100 pack", "6.50", "coffee", "Ridgeline Roasters"], ["Oat milk, 6 pack", "21.00", "kitchen", "Corner Supply Co."], ["Burr grinder", "79.00", "coffee", "Ridgeline Roasters"], ["Gooseneck kettle", "34.00", "kitchen", "Corner Supply Co."], ["Wireless headphones", "149.00", "electronics", "Volt Outlet"]] },
    { ...base, id: "sim_household", summary: "Household basics up to $80 a month from Corner Supply Co., ask me above $20", budget: { amount: "80.00", period: "month" }, approvalAbove: "20.00", categories: ["household"], merchants: ["Corner Supply Co."], rate: 0.28,
      agentsList: ["Household bot", "ChatGPT"], products: [["Dish soap refill, 1 L", "9.00", "household", "Corner Supply Co."], ["Paper towels, 6 rolls", "14.00", "household", "Corner Supply Co."], ["Laundry pods, 42 ct", "19.00", "household", "Corner Supply Co."], ["Trash bags, 50 ct", "12.00", "household", "Corner Supply Co."], ["Cordless vacuum", "189.00", "household", "Corner Supply Co."], ["Paper towels, 12 rolls", "22.00", "household", "QuickMart"]] },
    { ...base, id: "sim_books", summary: "Books and audiobooks up to $40 a month, ask me above $25", budget: { amount: "40.00", period: "month" }, approvalAbove: "25.00", categories: ["books", "digital"], rate: 0.12,
      agentsList: ["Gemini"], products: [["Paperback novel", "16.00", "books", "Pageturner Books"], ["E-book: field guide", "9.99", "digital", "Pageturner Books"], ["Audiobook credit", "14.95", "digital", "Pageturner Books"], ["Art book, hardcover", "65.00", "books", "Pageturner Books"]] },
    { ...base, id: "sim_gifts", summary: "Gifts up to $100 a month, ask me above $30", budget: { amount: "100.00", period: "month" }, approvalAbove: "30.00", categories: ["gifts"], rate: 0.08,
      agentsList: ["Gift concierge"], products: [["Greeting card", "6.00", "gifts", "Bloom & Co."], ["Chocolate box", "22.00", "gifts", "Bloom & Co."], ["Candle set", "28.00", "gifts", "Bloom & Co."], ["Flower bouquet", "55.00", "gifts", "Bloom & Co."]] },
    { ...base, id: "sim_tech", summary: "Cables and small tech up to $50 a month, ask me above $20", budget: { amount: "50.00", period: "month" }, approvalAbove: "20.00", categories: ["electronics"], rate: 0.08,
      agentsList: ["Cursor"], products: [["USB-C cable, 2 m", "12.00", "electronics", "Volt Outlet"], ["Wireless mouse", "24.00", "electronics", "Volt Outlet"], ["65 W charger", "29.00", "electronics", "Volt Outlet"], ["27-inch monitor", "249.00", "electronics", "Volt Outlet"]] },
  ] as Sim[];
}

/** A simulated order, shaped like a live Receipt so the Orders page renders it the same way. */
export interface SimOrder extends Receipt { sample: true }

/**
 * Twelve weeks of simulated history, labelled "Simulated" everywhere it appears. Every decision comes from
 * the real policy engine run against the simulated mandates; no PayPal calls are made.
 */
export function simulatedRows(now = new Date()): { attempts: AttemptRow[]; mandates: MandateRow[]; orders: SimOrder[] } {
  const r = rng(20261112);
  const created = new Date(now.getTime() - 90 * 86400e3).toISOString();
  const all = sims(created);
  const spend: SpendRecord[] = []; const attempts: AttemptRow[] = []; const orders: SimOrder[] = [];
  let n = 0; let allowed = 0;
  for (let d = 84; d >= 0; d--) {
    for (const m of all) {
      if (r() > m.rate) continue;
      const at = new Date(now.getTime() - d * 86400e3 - Math.floor(r() * 10 + 1) * 3600e3).toISOString();
      const [name, price, category, merchant] = m.products[Math.floor(r() * m.products.length)];
      const quantity = category === "coffee" && Number(price) < 20 && r() > 0.7 ? 2 : 1;
      const lines: CartLine[] = [{ sku: `sim-${name}`, name, unitAmount: price, quantity, category, merchant }];
      const agent = m.agentsList[Math.floor(r() * m.agentsList.length)];
      const p = evaluate(m, lines, spend, agent, new Date(at));
      let outcome: AttemptRow["outcome"]; let spent = 0;
      if (p.decision === "allow") { outcome = ++allowed % 9 === 4 ? "Refunded" : "Allowed"; } // about 1 in 9 undone, so refunds always show
      else if (p.decision === "needs_approval") { outcome = r() < (p.rule === "budget" ? 0.15 : 0.6) ? "Approved by you" : "Declined by you"; }
      else outcome = "Blocked";
      if (outcome === "Allowed" || outcome === "Approved by you") { spent = p.totalCents; spend.push({ mandateId: m.id, totalCents: p.totalCents, at, status: "captured" }); }
      const id = `sim_${++n}`; const why = WHY[Math.floor(r() * WHY.length)];
      const orderId = `SAMPLE-${(1e9 + n * 7919).toString(36).toUpperCase()}`;
      attempts.push({ id, at, day: at.slice(0, 10), source: "Simulated", mandateId: m.id, mandate: mandateTitle(m), shipTo: "Portland, OR", agent, merchant, item: `${quantity > 1 ? `${quantity} × ` : ""}${name}`, category,
        amount: usd(p.totalCents), spent: usd(spent), spentThisMonth: 0, blockedAmount: outcome === "Blocked" ? usd(p.totalCents) : 0, attempts: 1, outcome, decision: p.decision,
        rule: ruleLabel(outcome === "Approved by you" ? "approval" : p.rule), reason: p.reason, rationale: why, paypalOrderId: outcome === "Blocked" || outcome === "Declined by you" ? "" : orderId });
      if (outcome === "Allowed" || outcome === "Approved by you" || outcome === "Refunded")
        orders.push({ sample: true, id, mandateId: m.id, agentId: agent, lines, totalCents: p.totalCents, allowedBy: outcome === "Approved by you" ? "approval:sim" : `mandate:${p.rule}`, reason: p.reason, rationale: why,
          orderId, captureId: `SAMPLECAP${n}`, status: outcome === "Refunded" ? "refunded" : "captured", at, shipTo: SIM_SHIP, refundedAt: outcome === "Refunded" ? new Date(new Date(at).getTime() + 5 * 3600e3).toISOString() : undefined } as SimOrder);
    }
  }
  withThisMonth(attempts, now);
  return { attempts, orders: orders.reverse(), mandates: all.map((m) => ({ id: m.id, title: mandateTitle(m), summary: m.summary, budget: Number(m.budget.amount), period: m.budget.period, askAbove: Number(m.approvalAbove), status: m.status, source: "Simulated" as const })) };
}
