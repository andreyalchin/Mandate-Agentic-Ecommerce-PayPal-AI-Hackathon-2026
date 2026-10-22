export type Category = "coffee" | "kitchen" | "household" | "books" | "electronics" | "gifts" | "digital";
export const CATEGORIES: Category[] = ["coffee", "kitchen", "household", "books", "electronics", "gifts", "digital"];
export interface Mandate {
  id: string; userId: string; walletRef: string; summary: string; currency: "USD";
  budget: { amount: string; period: "once" | "week" | "month" }; approvalAbove: string; perPurchaseMax?: string;
  categories: Category[]; merchants?: string[]; agents?: string[]; expiresAt: string; createdAt: string; status: "active" | "revoked"; signature: string;
}
export type MandateInput = Omit<Mandate, "id" | "createdAt" | "status" | "signature">;
export interface MandateState { mandate: Mandate; budgetCents: number; spentCents: number; remainingCents: number; periodStart: string; signatureValid: boolean; fingerprint: string }
export interface Line { sku: string; name: string; unitAmount: string; quantity: number; category: Category; merchant: string; image?: string; url?: string }
export interface ShipTo { name?: string; line1?: string; city?: string; region?: string; postalCode?: string; country?: string }
export interface Receipt { id: string; mandateId: string; agentId: string; lines: Line[]; totalCents: number; allowedBy: string; reason: string; rationale: string; orderId: string; captureId?: string; status: "captured" | "refunded" | "pending"; at: string; shipTo?: ShipTo; refundedAt?: string }
export interface CartMandate { id: string; mandateId: string; agentId: string; lines: Line[]; totalCents: number; rationale: string; policy: { reason: string; rule: string }; status: "pending" | "approved" | "declined" | "expired"; createdAt: string; orderId?: string }
export interface ActivityEvent { id: string; at: string; mandateId: string; agentId: string; decision: "allow" | "needs_approval" | "deny"; rule: string; reason: string; totalCents: number; items: string; rationale: string }
export interface Wallet { walletRef: string; label?: string; createdAt: string }
export interface AgentStep { tool: string; input: any; result: any }
export interface AgentRun { reply: string; steps: AgentStep[]; outcomes: any[] }

export class ApiError extends Error { constructor(public status: number, public body: any) { super(body?.message || body?.error || `HTTP ${status}`); } }

export async function api<T = any>(path: string, body?: unknown, method?: string): Promise<T> {
  const r = await fetch(path, { method: method ?? (body === undefined ? "GET" : "POST"), headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, j);
  return j as T;
}

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
export const amt = (s: string) => `$${Number(s).toFixed(Number(s) % 1 ? 2 : 0)}`;
export const per = (p: Mandate["budget"]["period"]) => (p === "once" ? "in total" : `a ${p}`);
export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
export const dateOf = (iso: string) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
export const USER_ID = "demo-user";

const PER: Record<string, string> = { month: "/mo", week: "/wk", once: " total" };
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
/** Short mandate name, e.g. "Coffee & kitchen · $60/mo" (same rule as the server's console rows). */
export function mandateTitle(m: Pick<Mandate, "categories" | "budget">) {
  const c = m.categories.slice(0, 2); const cats = c.map((x, i) => (i ? x : cap(x))).join(" & ") + (m.categories.length > 2 ? " +" : "");
  return `${cats} · $${Number(m.budget.amount).toFixed(0)}${PER[m.budget.period] ?? ""}`;
}
export const shipLine = (s?: ShipTo) => (s ? [s.line1, [s.city, s.region].filter(Boolean).join(", "), s.postalCode].filter(Boolean).join(", ") : "");
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
export const agentLabel = (_id: string) => "Shopping agent";
