import type { MandateService } from "../mandate/service.js";
import { evaluate, type SpendRecord } from "../mandate/policy.js";
import type { IntentMandate } from "../mandate/types.js";
import { cartLines } from "../server/catalog.js";

/** One row per agent payment attempt: the spend console's fact table. */
export interface AttemptRow {
  id: string; at: string; day: string; source: "Live" | "Simulated";
  mandateId: string; agent: string; merchant: string; item: string; category: string;
  amount: number; spent: number; spentThisMonth: number; blockedAmount: number; attempts: number;
  outcome: "Allowed" | "Approved by you" | "Waiting for you" | "Declined by you" | "Blocked" | "Refunded";
  decision: "allow" | "needs_approval" | "deny"; rule: string; reason: string; rationale: string; paypalOrderId: string;
}
export interface MandateRow { id: string; summary: string; budget: number; period: string; askAbove: number; status: string; source: "Live" | "Simulated" }

const RULE_LABEL: Record<string, string> = {
  within_mandate: "Within mandate", approval_threshold: "Over ask-above", budget: "Over budget", category: "Category not allowed",
  merchant: "Shop not allowed", per_purchase_max: "Over per-purchase max", agent: "Agent not allowed", expired: "Mandate expired", revoked: "Mandate revoked", signature: "Bad signature", approval: "Your approval",
};
export const ruleLabel = (r: string) => RULE_LABEL[r] ?? r;
const agentName = (id: string) => (id.startsWith("mcp:") ? id.slice(4) : id === "mandate-claude-agent" ? "Shopping agent" : id);
const usd = (c: number) => Math.round(c) / 100;
function withThisMonth(rows: AttemptRow[], now = new Date()) { const m = now.toISOString().slice(0, 7); for (const r of rows) r.spentThisMonth = r.at.slice(0, 7) === m ? r.spent : 0; }

/** Live rows from the mandate service: receipts, pending/declined approvals and blocked attempts. */
export function liveRows(svc: MandateService): { attempts: AttemptRow[]; mandates: MandateRow[] } {
  const attempts: AttemptRow[] = [];
  const base = (at: string, mandateId: string, agentId: string, lines: { name: string; quantity: number; merchant: string; category: string }[]) => ({
    at, day: at.slice(0, 10), source: "Live" as const, mandateId, agent: agentName(agentId), merchant: lines[0]?.merchant ?? "", category: lines[0]?.category ?? "",
    item: lines.map((l) => `${l.quantity > 1 ? `${l.quantity} × ` : ""}${l.name}`).join(", "), attempts: 1,
  });
  for (const r of svc.receipts.values()) {
    const approved = r.allowedBy.startsWith("approval:");
    attempts.push({ id: r.id, ...base(r.at, r.mandateId, r.agentId, r.lines), amount: usd(r.totalCents), spent: r.status === "refunded" ? 0 : usd(r.totalCents), spentThisMonth: 0, blockedAmount: 0,
      outcome: r.status === "refunded" ? "Refunded" : approved ? "Approved by you" : "Allowed", decision: approved ? "needs_approval" : "allow",
      rule: ruleLabel(approved ? "approval" : "within_mandate"), reason: r.reason, rationale: r.rationale, paypalOrderId: r.orderId });
  }
  for (const c of svc.carts.values()) {
    if (c.status === "approved") continue; // shows as its receipt
    attempts.push({ id: c.id, ...base(c.createdAt, c.mandateId, c.agentId, c.lines), amount: usd(c.totalCents), spent: 0, spentThisMonth: 0, blockedAmount: 0,
      outcome: c.status === "pending" ? "Waiting for you" : "Declined by you", decision: "needs_approval", rule: ruleLabel(c.policy.rule), reason: c.policy.reason, rationale: c.rationale, paypalOrderId: c.orderId ?? "" });
  }
  for (const e of svc.log) {
    if (e.decision !== "deny") continue;
    attempts.push({ id: e.id, at: e.at, day: e.at.slice(0, 10), source: "Live", mandateId: e.mandateId, agent: agentName(e.agentId), merchant: "", item: e.items, category: "", amount: usd(e.totalCents), spent: 0, spentThisMonth: 0, blockedAmount: usd(e.totalCents), attempts: 1,
      outcome: "Blocked", decision: "deny", rule: ruleLabel(e.rule), reason: e.reason, rationale: e.rationale, paypalOrderId: "" });
  }
  withThisMonth(attempts);
  const mandates = [...svc.mandates.values()].map((m) => ({ id: m.id, summary: m.summary, budget: Number(m.budget.amount), period: m.budget.period, askAbove: Number(m.approvalAbove), status: m.status, source: "Live" as const }));
  return { attempts, mandates };
}

/** Deterministic PRNG so the simulated history is identical on every load. */
function rng(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

/**
 * Eight weeks of simulated history, labelled "Simulated" everywhere it appears. Every decision
 * comes from the real policy engine run against two simulated mandates; no PayPal calls are made.
 */
export function simulatedRows(now = new Date()): { attempts: AttemptRow[]; mandates: MandateRow[] } {
  const r = rng(20261112);
  const created = new Date(now.getTime() - 90 * 86400e3).toISOString();
  const sims: (IntentMandate & { agents2: string[]; skus: string[] })[] = [
    { id: "sim_coffee", userId: "sim", walletRef: "sim", summary: "Coffee supplies up to $120 a month, ask me above $25", currency: "USD", budget: { amount: "120.00", period: "month" }, approvalAbove: "25.00", categories: ["coffee"], expiresAt: "2027-12-31T00:00:00Z", createdAt: created, status: "active", signature: "sim",
      agents2: ["Shopping agent", "Claude Code"], skus: ["COF-BEANS-1LB", "COF-BEANS-1LB", "COF-BEANS-1LB", "COF-FILTERS-100", "COF-FILTERS-100", "COF-FILTERS-100", "COF-BEANS-1LB", "COF-FILTERS-100", "COF-GRINDER", "KIT-KETTLE", "EL-HEADPHONES"] },
    { id: "sim_household", userId: "sim", walletRef: "sim", summary: "Household basics up to $60 a month from Corner Supply Co., ask me above $15", currency: "USD", budget: { amount: "60.00", period: "month" }, approvalAbove: "15.00", categories: ["household"], merchants: ["Corner Supply Co."], expiresAt: "2027-12-31T00:00:00Z", createdAt: created, status: "active", signature: "sim",
      agents2: ["Household bot"], skus: ["HH-DISH-SOAP", "HH-DISH-SOAP", "HH-DISH-SOAP", "HH-DISH-SOAP", "HH-DISH-SOAP", "KIT-KETTLE"] },
  ] as any;
  const spend: SpendRecord[] = []; const attempts: AttemptRow[] = [];
  let n = 0;
  for (let d = 84; d >= 1; d--) {
    for (const m of sims) {
      if (r() > (m.id === "sim_coffee" ? 0.34 : 0.24)) continue;
      const at = new Date(now.getTime() - d * 86400e3 + Math.floor(r() * 12 + 8) * 3600e3).toISOString();
      const sku = m.skus[Math.floor(r() * m.skus.length)];
      const lines = cartLines([{ sku, quantity: sku.startsWith("COF-BEANS") && r() > 0.7 ? 2 : 1 }]);
      const agent = m.agents2[Math.floor(r() * m.agents2.length)];
      const p = evaluate(m, lines, spend, agent, new Date(at));
      let outcome: AttemptRow["outcome"]; let spent = 0;
      if (p.decision === "allow") { outcome = r() < 0.06 ? "Refunded" : "Allowed"; }
      else if (p.decision === "needs_approval") { outcome = r() < (p.rule === "budget" ? 0.15 : 0.65) ? "Approved by you" : "Declined by you"; }
      else outcome = "Blocked";
      if (outcome === "Allowed" || outcome === "Approved by you") { spent = p.totalCents; spend.push({ mandateId: m.id, totalCents: p.totalCents, at, status: "captured" }); }
      attempts.push({ id: `sim_${++n}`, at, day: at.slice(0, 10), source: "Simulated", mandateId: m.id, agent, merchant: lines[0].merchant, item: `${lines[0].quantity > 1 ? `${lines[0].quantity} × ` : ""}${lines[0].name}`, category: lines[0].category,
        amount: usd(p.totalCents), spent: usd(spent), spentThisMonth: 0, blockedAmount: outcome === "Blocked" ? usd(p.totalCents) : 0, attempts: 1, outcome, decision: p.decision,
        rule: ruleLabel(outcome === "Approved by you" ? "approval" : p.rule), reason: p.reason, rationale: "", paypalOrderId: "" });
    }
  }
  withThisMonth(attempts, now);
  return { attempts, mandates: sims.map((m) => ({ id: m.id, summary: m.summary, budget: Number(m.budget.amount), period: m.budget.period, askAbove: Number(m.approvalAbove), status: m.status, source: "Simulated" as const })) };
}
