import { describe, expect, it } from "vitest";
import { evaluate, periodStart } from "../src/mandate/policy.js";
import { canonical, MandateSigner } from "../src/mandate/signing.js";
import type { CartLine, IntentMandate } from "../src/mandate/types.js";

const NOW = new Date("2026-10-21T18:00:00Z");
const mandate = (o: Partial<IntentMandate> = {}): IntentMandate => ({
  id: "mdt_1", userId: "u1", walletRef: "wal_1", summary: "Coffee restock", currency: "USD",
  budget: { amount: "60.00", period: "month" }, approvalAbove: "25.00", categories: ["coffee"],
  expiresAt: "2026-12-31T00:00:00Z", createdAt: "2026-10-01T00:00:00Z", status: "active", signature: "x", ...o,
});
const line = (o: Partial<CartLine> = {}): CartLine => ({ sku: "COF-FILTERS-100", name: "Filters", unitAmount: "6.50", quantity: 1, category: "coffee", merchant: "Ridgeline Roasters", ...o });

describe("policy engine", () => {
  it("allows an in-scope purchase and explains why", () => {
    const r = evaluate(mandate(), [line()], [], "agent-a", NOW);
    expect(r.decision).toBe("allow");
    expect(r.reason).toContain("$53.50 left this month");
  });
  it("asks for approval above the threshold", () => {
    expect(evaluate(mandate(), [line({ unitAmount: "30.00" })], [], "a", NOW)).toMatchObject({ decision: "needs_approval", rule: "approval_threshold" });
  });
  it("asks for approval when the period budget would be exceeded", () => {
    const spend = [{ mandateId: "mdt_1", totalCents: 5000, at: "2026-10-10T00:00:00Z", status: "captured" as const }];
    expect(evaluate(mandate(), [line({ unitAmount: "18.00" })], spend, "a", NOW)).toMatchObject({ decision: "needs_approval", rule: "budget", spentCents: 5000 });
  });
  it("ignores refunded spend and spend from earlier periods", () => {
    const spend = [
      { mandateId: "mdt_1", totalCents: 5900, at: "2026-10-10T00:00:00Z", status: "refunded" as const },
      { mandateId: "mdt_1", totalCents: 5900, at: "2026-09-28T00:00:00Z", status: "captured" as const },
    ];
    expect(evaluate(mandate(), [line({ unitAmount: "18.00" })], spend, "a", NOW).decision).toBe("allow");
  });
  it("denies categories outside the mandate even if cheap", () => {
    expect(evaluate(mandate(), [line({ category: "electronics", name: "Cable", unitAmount: "3.00" })], [], "a", NOW)).toMatchObject({ decision: "deny", rule: "category" });
  });
  it("denies mixed carts that smuggle one out-of-scope item", () => {
    expect(evaluate(mandate(), [line(), line({ category: "gifts", name: "Gift card" })], [], "a", NOW).decision).toBe("deny");
  });
  it("denies merchants not on the allowlist", () => {
    expect(evaluate(mandate({ merchants: ["Ridgeline Roasters"] }), [line({ merchant: "Volt Outlet" })], [], "a", NOW).rule).toBe("merchant");
  });
  it("denies over the hard per-purchase max even though approval exists", () => {
    expect(evaluate(mandate({ perPurchaseMax: "100.00" }), [line({ unitAmount: "149.00" })], [], "a", NOW)).toMatchObject({ decision: "deny", rule: "per_purchase_max" });
  });
  it("denies revoked, expired, unknown-agent and bad-signature mandates", () => {
    expect(evaluate(mandate({ status: "revoked" }), [line()], [], "a", NOW).rule).toBe("revoked");
    expect(evaluate(mandate({ expiresAt: "2026-10-01T00:00:00Z" }), [line()], [], "a", NOW).rule).toBe("expired");
    expect(evaluate(mandate({ agents: ["agent-a"] }), [line()], [], "agent-b", NOW).rule).toBe("agent_not_allowed");
    expect(evaluate(mandate(), [line()], [], "a", NOW, false).rule).toBe("signature");
  });
  it("splitting a purchase into small carts still hits the budget", () => {
    const spend = Array.from({ length: 9 }, (_, i) => ({ mandateId: "mdt_1", totalCents: 650, at: `2026-10-1${i}T00:00:00Z`, status: "captured" as const }));
    expect(evaluate(mandate(), [line({ quantity: 1 })], spend, "a", NOW).rule).toBe("budget"); // 58.50 + 6.50 > 60
    const more = [...spend, { mandateId: "mdt_1", totalCents: 650, at: "2026-10-20T00:00:00Z", status: "captured" as const }];
    expect(evaluate(mandate(), [line()], more, "a", NOW).rule).toBe("budget");
  });
  it("computes week periods from Monday and once from creation", () => {
    expect(periodStart("week", "2026-10-01T00:00:00Z", NOW).toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(periodStart("once", "2026-10-01T00:00:00Z", NOW).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("mandate signing", () => {
  it("canonicalizes key order", () => expect(canonical({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}'));
  it("detects tampering", () => {
    const s = new MandateSigner(); const p = { budget: "60.00", categories: ["coffee"] };
    const sig = s.sign(p);
    expect(s.verify(p, sig)).toBe(true);
    expect(s.verify({ ...p, budget: "600.00" }, sig)).toBe(false);
  });
});
