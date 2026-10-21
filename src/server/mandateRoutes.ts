import { Router } from "express";
import { z } from "zod";
import type { MandateService } from "../mandate/service.js";
import { CATALOG, cartLines, findProducts } from "./catalog.js";
import type { LlmClient } from "../ai/claude.js";
import { draftMandate } from "../ai/drafter.js";
import { runAgent } from "../ai/agent.js";

export interface Llm { client: LlmClient; model: () => Promise<string> }

const Items = z.array(z.object({ sku: z.string().min(1), quantity: z.number().int().min(1).max(20) })).min(1);

export function mandateRoutes(svc: MandateService, publicOrigin: string, llm?: Llm) {
  const r = Router();
  const needLlm = () => { if (!llm) throw Object.assign(new Error("AI not configured"), { status: 503 }); return llm; };
  r.post("/api/mandates/draft", async (q, s, next) => {
    try {
      const { text, userId, walletRef } = z.object({ text: z.string().min(3).max(2000), userId: z.string().min(1), walletRef: z.string().min(1) }).parse(q.body);
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
  r.get("/api/receipts", (q, s) => s.json([...svc.receipts.values()].filter((x) => owned(q, x.mandateId) && !q.query.mandateId || x.mandateId === q.query.mandateId).reverse()));
  r.post("/api/receipts/:id/undo", async (q, s, next) => { try { s.json(await svc.undo(q.params.id)); } catch (e) { next(e); } });
  r.get("/api/activity", (q, s) => s.json(svc.log.filter((e) => owned(q, e.mandateId) && !q.query.mandateId || e.mandateId === q.query.mandateId).slice(-200).reverse()));
  return r;
}
