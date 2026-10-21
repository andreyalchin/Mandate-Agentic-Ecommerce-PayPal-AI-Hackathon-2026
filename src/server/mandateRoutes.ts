import { Router } from "express";
import { z } from "zod";
import type { MandateService } from "../mandate/service.js";
import { cartLines } from "./catalog.js";

const Items = z.array(z.object({ sku: z.string().min(1), quantity: z.number().int().min(1).max(20) })).min(1);

export function mandateRoutes(svc: MandateService, publicOrigin: string) {
  const r = Router();
  r.get("/.well-known/mandate-keys", (_q, s) => s.json({ keys: [{ ...svc.signer.publicJwk(), use: "sig", alg: "EdDSA" }] }));
  r.post("/api/mandates", (q, s) => s.status(201).json(svc.create(q.body)));
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
  r.get("/api/receipts", (q, s) => s.json([...svc.receipts.values()].filter((x) => !q.query.mandateId || x.mandateId === q.query.mandateId).reverse()));
  r.post("/api/receipts/:id/undo", async (q, s, next) => { try { s.json(await svc.undo(q.params.id)); } catch (e) { next(e); } });
  r.get("/api/activity", (_q, s) => s.json(svc.log.slice(-200).reverse()));
  return r;
}
