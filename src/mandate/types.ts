import { z } from "zod";

export const Money = z.string().regex(/^\d+(\.\d{1,2})?$/, "amount like 12.50");
export const Category = z.enum(["coffee", "kitchen", "household", "books", "electronics", "gifts", "digital"]);
export type Category = z.infer<typeof Category>;

/** What the user authorized an agent to do (AP2 "Intent Mandate"). */
export const IntentMandateInput = z.object({
  userId: z.string().min(1),
  walletRef: z.string().min(1),
  summary: z.string().min(1).max(280), // plain-language text the user approved
  currency: z.literal("USD").default("USD"),
  budget: z.object({ amount: Money, period: z.enum(["once", "week", "month"]) }),
  approvalAbove: Money, // single purchases above this need a tap
  perPurchaseMax: Money.optional(), // hard ceiling even with approval
  categories: z.array(Category).min(1),
  merchants: z.array(z.string()).optional(), // allowlist; omitted = any merchant
  agents: z.array(z.string()).optional(), // which agents may use it; omitted = any
  expiresAt: z.string().datetime(),
});
export type IntentMandateInput = z.infer<typeof IntentMandateInput>;

export interface IntentMandate extends IntentMandateInput {
  id: string;
  createdAt: string;
  status: "active" | "revoked";
  signature: string; // Ed25519 over canonical JSON, verifiable with the public key
}

export interface CartLine { sku: string; name: string; unitAmount: string; quantity: number; category: Category; merchant: string }

export type Decision = "allow" | "needs_approval" | "deny";
export interface PolicyResult {
  decision: Decision;
  rule: string; // machine id of the deciding rule
  reason: string; // plain-language reason shown on receipts
  totalCents: number;
  spentCents: number; // already spent in this period
  remainingCents: number;
  checks: { rule: string; ok: boolean; detail: string }[];
}

/** One user approval of a specific out-of-scope cart (AP2 "Cart Mandate"). */
export interface CartMandate {
  id: string;
  mandateId: string;
  agentId: string;
  lines: CartLine[];
  totalCents: number;
  rationale: string;
  policy: PolicyResult;
  status: "pending" | "approved" | "declined" | "expired";
  createdAt: string;
  orderId?: string;
}

export interface Receipt {
  id: string;
  mandateId: string;
  agentId: string;
  lines: CartLine[];
  totalCents: number;
  allowedBy: string; // "mandate:<rule>" or "approval:<cartMandateId>"
  reason: string;
  rationale: string; // agent's stated reason, shown verbatim
  orderId: string;
  captureId?: string;
  status: "captured" | "refunded" | "pending";
  at: string;
}
