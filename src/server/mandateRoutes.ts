import { Router } from "express";
import { z } from "zod";
import type { MandateService } from "../mandate/service.js";
import { CATALOG, cartLines, findProducts } from "./catalog.js";
import type { LlmClient } from "../ai/claude.js";
import { draftMandate } from "../ai/drafter.js";
import { runAgent } from "../ai/agent.js";
import { evaluate } from "../mandate/policy.js";
import { IntentMandateInput, type CartLine, type Category, type IntentMandate } from "../mandate/types.js";

export interface Llm { client: LlmClient; model: () => Promise<string> }

/** Everyday examples per category, used only to preview how a draft mandate would decide. Never sold. */
const EXAMPLES: Record<Category, [string, string, string][]> = {
  coffee: [["Coffee beans, 1 lb", "18.00", "Ridgeline Roasters"], ["Burr grinder", "79.00", "Ridgeline Roasters"]],
  kitchen: [["Gooseneck kettle", "34.00", "Corner Supply Co."], ["Stand mixer", "279.00", "Corner Supply Co."]],
  household: [["Dish soap refill", "9.00", "Corner Supply Co."], ["Cordless vacuum", "189.00", "Corner Supply Co."]],
  books: [["Paperback novel", "16.00", "Pageturner Books"], ["Art book, hardcover", "65.00", "Pageturner Books"]],
  electronics: [["USB-C cable", "12.00", "Volt Outlet"], ["Wireless headphones", "149.00", "Volt Outlet"]],
  gifts: [["Greeting card", "6.00", "Bloom & Co."], ["Flower bouquet", "55.00", "Bloom & Co."]],
  digital: [["Brewing guide e-book", "4.99", "Ridgeline Roasters"], ["Photo app, 1 year", "59.99", "App Store"]],
};
const line = (c: Category, [name, unitAmount, merchant]: [string, string, string]): CartLine => ({ sku: `preview-${c}-${name}`, name, unitAmount, quantity: 1, category: c, merchant });

const Items = z.array(z.object({ sku: z.string().min(1), quantity: z.number().int().min(1).max(20) })).min(1);

export function mandateRoutes(svc: MandateService, publicOrigin: string, llm?: Llm) {
  const r = Router();
  const needLlm = () => { if (!llm) throw Object.assign(new Error("AI not configured"), { status: 503 }); return llm; };
  r.post("/api/mandates/draft", async (q, s, next) => {
    try {
      // walletRef is optional: people describe what they want before linking PayPal; it's filled in at signing.
      const { text, userId, walletRef } = z.object({ text: z.string().min(3).max(2000), userId: z.string().min(1), walletRef: z.string().min(1).default("pending") }).parse(q.body);
      const l = needLlm();
      s.json(await draftMandate(l.client, await l.model(), text, { userId, walletRef }));
    } catch (e) { next(e); }
  });
  r.post("/api/agent/chat", async (q, s, next) => {
    try {
      const { mandateId, message, history } = z.object({ mandateId: z.string(), message: z.string().min(1).max(2000), history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(20).optional() }).parse(q.body);
      const l = needLlm();
      s.json(await runAgent(l.client, await l.model(), svc, mandateId, message, undefined, undefined, history));
    } catch (e) { next(e); }
  });
  // "What would happen": runs the real policy engine on everyday examples for an unsigned draft. No money, no state.
  r.post("/api/mandates/preview", (q, s) => {
    const d = IntentMandateInput.parse({ walletRef: "pending", userId: "preview", ...q.body });
    const m: IntentMandate = { ...d, id: "preview", createdAt: new Date().toISOString(), status: "active", signature: "preview" };
    const inCat = m.categories.flatMap((c) => EXAMPLES[c].map((e) => line(c, e)));
    const cheap = inCat.filter((l) => Number(l.unitAmount) <= Number(m.approvalAbove)).sort((a, b) => Number(b.unitAmount) - Number(a.unitAmount))[0];
    const pricey = inCat.filter((l) => Number(l.unitAmount) > Number(m.approvalAbove)).sort((a, b) => Number(a.unitAmount) - Number(b.unitAmount))[0];
    const outCat = (Object.keys(EXAMPLES) as Category[]).find((c) => !m.categories.includes(c));
    const picks = [cheap, pricey, outCat ? line(outCat, EXAMPLES[outCat][1]) : undefined].filter(Boolean) as CartLine[];
    s.json(picks.map((l) => { const p = evaluate(m, [l], [], "preview"); return { name: l.name, price: l.unitAmount, merchant: l.merchant, category: l.category, decision: p.decision, reason: p.reason }; }));
  });
  r.get("/.well-known/mandate-keys", (_q, s) => s.json({ keys: [{ ...svc.signer.publicJwk(), use: "sig", alg: "EdDSA" }] }));
  r.post("/api/mandates", (q, s) => s.status(201).json(svc.create(q.body)));
  r.get("/api/mandates", (q, s) => s.json([...svc.mandates.values()].filter((m) => m.userId === q.owner).reverse()));
  const owned = (q: any, mandateId: string) => svc.mandates.get(mandateId)?.userId === q.owner;
  r.get("/api/mandates/:id/state", (q, s) => s.json(svc.state(q.params.id)));
  r.get("/api/cart-mandates", (q, s) => s.json([...svc.carts.values()].filter((c) => owned(q, c.mandateId) && (!q.query.mandateId || c.mandateId === q.query.mandateId) && (!q.query.status || c.status === q.query.status)).reverse()));
  // Same search the agents use (demo shops + Channel3 live products).
  r.get("/api/products/search", async (q, s, next) => { try { s.json(await findProducts(z.string().min(2).max(120).parse(q.query.q))); } catch (e) { next(e); } });
  r.get("/api/products", (_q, s) => s.json(Object.values(CATALOG).map((p) => ({ sku: p.sku, name: p.name, price: p.unitAmount, category: p.mandateCategory, merchant: p.merchant }))));
  r.get("/api/mandates/:id", (q, s) => { const m = svc.mandates.get(q.params.id); m ? s.json(m) : s.status(404).json({ error: "NOT_FOUND" }); });
  r.post("/api/mandates/:id/revoke", (q, s) => s.json(svc.revoke(q.params.id)));
  r.post("/api/mandates/:id/check", (q, s) => {
    const { items, agentId } = z.object({ items: Items, agentId: z.string().min(1) }).parse(q.body);
    s.json(svc.check(q.params.id, cartLines(items), agentId));
  });
  r.post("/api/agent/purchase", async (q, s, next) => {
    try {
      const { mandateId, agentId, items, rationale } = z.object({ mandateId: z.string(), agentId: z.string().min(1), items: Items, rationale: z.string().min(1).max(500) }).parse(q.body);
      const out = await svc.purchase(mandateId, agentId, cartLines(items), rationale);
      s.status(out.decision === "allow" ? 201 : out.decision === "needs_approval" ? 202 : 403).json(out);
    } catch (e) { next(e); }
  });
  r.post("/api/cart-mandates/:id/order", async (q, s, next) => {
    try { const { orderId } = await svc.createApprovalOrder(q.params.id, `${publicOrigin}/?approved=${q.params.id}`, `${publicOrigin}/?declined=${q.params.id}`); s.status(201).json({ id: orderId }); } catch (e) { next(e); }
  });
  r.post("/api/cart-mandates/:id/capture", async (q, s, next) => { try { s.status(201).json(await svc.captureApproval(q.params.id)); } catch (e) { next(e); } });
  r.post("/api/cart-mandates/:id/decline", (q, s) => s.json(svc.decline(q.params.id) ?? { error: "NOT_FOUND" }));
  r.get("/api/receipts", (q, s) => s.json([...svc.receipts.values()].filter((x) => owned(q, x.mandateId) && (!q.query.mandateId || x.mandateId === q.query.mandateId)).reverse()));
  // Receipts carry a shipping address: only the owning session may read or refund one.
  const mine = (q: any) => { const x = svc.receipts.get(q.params.id); return !!x && owned(q, x.mandateId); };
  r.get("/api/receipts/:id/details", async (q, s, next) => { if (!mine(q)) return s.status(404).json({ error: "not_found" }); try { s.json(await svc.orderDetails(q.params.id)); } catch (e) { next(e); } });
  r.post("/api/receipts/:id/undo", async (q, s, next) => { if (!mine(q)) return s.status(404).json({ error: "not_found" }); try { s.json(await svc.undo(q.params.id)); } catch (e) { next(e); } });
  r.get("/api/activity", (q, s) => s.json(svc.log.filter((e) => owned(q, e.mandateId) && (!q.query.mandateId || e.mandateId === q.query.mandateId)).slice(-200).reverse()));
  return r;
}
