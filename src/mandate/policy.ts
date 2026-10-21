import type { CartLine, IntentMandate, PolicyResult } from "./types.js";
import { cartCents, fmt, toCents } from "./money.js";

export interface SpendRecord { mandateId: string; totalCents: number; at: string; status: "captured" | "refunded" | "pending" }

/** Start of the budget period containing `now` (UTC). */
export function periodStart(period: "once" | "week" | "month", createdAt: string, now: Date): Date {
  if (period === "once") return new Date(createdAt);
  if (period === "month") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Monday
  return d;
}

/**
 * Deterministic policy check. The LLM never decides whether money moves:
 * categories and prices come from the catalog, not from the agent.
 * Order: hard denies → approval triggers → allow.
 */
export function evaluate(m: IntentMandate, lines: CartLine[], spend: SpendRecord[], agentId: string, now = new Date(), signatureValid = true): PolicyResult {
  const total = cartCents(lines);
  const since = periodStart(m.budget.period, m.createdAt, now).getTime();
  const spent = spend.filter((s) => s.mandateId === m.id && s.status !== "refunded" && new Date(s.at).getTime() >= since).reduce((a, s) => a + s.totalCents, 0);
  const budget = toCents(m.budget.amount);
  const checks: PolicyResult["checks"] = [];
  const add = (rule: string, ok: boolean, detail: string) => (checks.push({ rule, ok, detail }), ok);
  const base = { totalCents: total, spentCents: spent, remainingCents: Math.max(0, budget - spent), checks };
  const deny = (rule: string, reason: string): PolicyResult => ({ decision: "deny", rule, reason, ...base });

  if (!add("signature", signatureValid, signatureValid ? "mandate signature valid" : "mandate signature invalid")) return deny("signature", "This mandate's signature doesn't verify, so nothing can be charged against it.");
  if (!add("active", m.status === "active", `status ${m.status}`)) return deny("revoked", "You revoked this mandate.");
  if (!add("not_expired", now < new Date(m.expiresAt), `expires ${m.expiresAt}`)) return deny("expired", "This mandate has expired.");
  if (!add("agent_allowed", !m.agents || m.agents.includes(agentId), `agent ${agentId}`)) return deny("agent_not_allowed", `Agent "${agentId}" isn't allowed to use this mandate.`);
  if (!add("non_empty", lines.length > 0 && total > 0, `${lines.length} lines`)) return deny("empty_cart", "The cart is empty.");
  const badCat = lines.find((l) => !(m.categories as string[]).includes(l.category));
  if (!add("category", !badCat, badCat ? `${badCat.name} is ${badCat.category}` : "all categories allowed")) return deny("category", `"${badCat!.name}" is ${badCat!.category}, which this mandate doesn't cover (${m.categories.join(", ")}).`);
  const badMerchant = m.merchants && lines.find((l) => !m.merchants!.includes(l.merchant));
  if (!add("merchant", !badMerchant, badMerchant ? badMerchant.merchant : "merchant allowed")) return deny("merchant", `${badMerchant!.merchant} isn't one of your allowed shops.`);
  if (m.perPurchaseMax && !add("per_purchase_max", total <= toCents(m.perPurchaseMax), `${fmt(total)} vs max ${fmt(toCents(m.perPurchaseMax))}`))
    return deny("per_purchase_max", `${fmt(total)} is over your hard limit of ${fmt(toCents(m.perPurchaseMax))} per purchase.`);

  const overBudget = spent + total > budget;
  add("budget", !overBudget, `${fmt(spent)} spent + ${fmt(total)} vs ${fmt(budget)} per ${m.budget.period}`);
  const overThreshold = total > toCents(m.approvalAbove);
  add("approval_threshold", !overThreshold, `${fmt(total)} vs ask-above ${fmt(toCents(m.approvalAbove))}`);
  if (overBudget) return { decision: "needs_approval", rule: "budget", reason: `This would bring ${m.budget.period === "once" ? "the total" : `this ${m.budget.period}'s spend`} to ${fmt(spent + total)}, over your ${fmt(budget)} budget.`, ...base };
  if (overThreshold) return { decision: "needs_approval", rule: "approval_threshold", reason: `${fmt(total)} is above the ${fmt(toCents(m.approvalAbove))} you asked to approve.`, ...base };
  return { decision: "allow", rule: "within_mandate", reason: `Within your mandate: ${lines.map((l) => l.category).filter((c, i, a) => a.indexOf(c) === i).join(", ")}, ${fmt(total)} ≤ ${fmt(toCents(m.approvalAbove))}, ${fmt(budget - spent - total)} left this ${m.budget.period === "once" ? "mandate" : m.budget.period}.`, ...base };
}
