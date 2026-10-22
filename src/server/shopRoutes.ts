import { Router } from "express";
import { z } from "zod";
import type { MandateService } from "../mandate/service.js";
import type { IntentMandate } from "../mandate/types.js";
import { Cadences, PRODUCTS, STORES, bestOffer, findVariant, shelves, shopSku, suggestedShelf, variantName, type ShelfItem } from "../catalog/shop.js";
import { cartLines } from "./catalog.js";

const Shelf = z.object({ items: z.array(z.object({
  variantId: z.string().min(1).max(60), store: z.string().min(1).max(60), qty: z.number().int().min(1).max(12),
  every: z.number().int().refine((n) => (Cadences as readonly number[]).includes(n), "cadence must be 7, 14, 30, 60 or 90 days"),
})).max(40) });

const agentOf = (m: IntentMandate) => m.agents?.[0] ?? "mandate-claude-agent";
const verdict = (svc: MandateService, m: IntentMandate, sku: string, quantity: number) => {
  try { const p = svc.check(m.id, cartLines([{ sku, quantity }]), agentOf(m)); return { decision: p.decision, rule: p.rule, reason: p.reason }; }
  catch (e) { return { decision: "deny" as const, rule: "unavailable", reason: (e as Error).message }; }
};
/** Budget expressed per month so a repeat list can be compared with it. */
const monthlyBudgetCents = (m: IntentMandate) => { const c = Math.round(Number(m.budget.amount) * 100); return m.budget.period === "month" ? c : m.budget.period === "week" ? Math.round((c * 52) / 12) : null; };

/** Suggestions should leave room for one-offs: stretch the priciest item's cadence, then drop items, until it fits 80% of the budget. */
function fitToBudget(items: ShelfItem[], m: IntentMandate) {
  const cap = monthlyBudgetCents(m); if (cap == null) return items;
  const cost = (it: ShelfItem) => { const h = findVariant(it.variantId); return h ? (Math.round(Number(bestOffer(h.v, m.merchants).price) * 100) * it.qty * 30) / it.every : 0; };
  const out = items.map((x) => ({ ...x })); const steps = [...Cadences];
  while (out.length && out.reduce((a, x) => a + cost(x), 0) > cap * 0.8) {
    const top = [...out].sort((a, b) => cost(b) - cost(a)).find((x) => x.every < 90);
    if (top) top.every = steps[steps.indexOf(top.every as (typeof steps)[number]) + 1] ?? 90; else out.splice(out.indexOf([...out].sort((a, b) => cost(b) - cost(a))[0]), 1);
  }
  return out;
}

/** The repeat list with the store, price and mandate decision for every line, plus the monthly estimate. */
export function shelfView(svc: MandateService, m: IntentMandate) {
  const saved = shelves.get(m.id); const raw: ShelfItem[] = saved ?? fitToBudget(suggestedShelf(m.categories), m);
  const items = raw.flatMap((it) => {
    const hit = findVariant(it.variantId); if (!hit) return [];
    const { p, v } = hit; const best = bestOffer(v, m.merchants);
    const chosen = it.store === "best" ? best : v.offers.find((f) => f.store === it.store && f.stock) ?? best;
    const sku = shopSku(v.id, chosen.store); const unitCents = Math.round(Number(chosen.price) * 100);
    return [{ ...it, productId: p.id, name: variantName(p, v), product: p.name, brand: v.brand, size: v.size, pack: v.pack, image: p.image, category: p.category,
      sku, storeChosen: chosen.store, price: chosen.price, days: chosen.days, isBest: chosen === best, bestStore: best.store, bestPrice: best.price,
      monthlyCents: Math.round((unitCents * it.qty * 30) / it.every), verdict: verdict(svc, m, sku, it.qty) }];
  });
  const monthlyCents = items.reduce((a, x) => a + x.monthlyCents, 0);
  const cartCents = items.reduce((a, x) => a + Math.round(Number(x.price) * 100) * x.qty, 0);
  let restock: ReturnType<typeof verdict> | null = null;
  if (items.length) try { const r = svc.check(m.id, cartLines(items.map((x) => ({ sku: x.sku, quantity: x.qty }))), agentOf(m)); restock = { decision: r.decision, rule: r.rule, reason: r.reason }; } catch { restock = null; }
  return { mandateId: m.id, suggested: !saved, items, monthlyCents, budgetMonthlyCents: monthlyBudgetCents(m), cartCents, restock, stores: [...new Set(items.map((x) => x.storeChosen))] };
}

export function shopRoutes(svc: MandateService) {
  const r = Router();
  const must = (id: string) => { const m = svc.mandates.get(id); if (!m) throw Object.assign(new Error("unknown mandate"), { status: 404 }); return m; };
  // Catalog; with ?mandateId the mandate's decision for one of each offer is attached.
  r.get("/api/shop/catalog", (q, s) => {
    const m = typeof q.query.mandateId === "string" ? svc.mandates.get(q.query.mandateId) : undefined;
    const products = PRODUCTS.map((p) => ({ ...p, variants: p.variants.map((v) => ({ ...v, name: variantName(p, v), offers: v.offers.map((f) => ({ ...f, sku: shopSku(v.id, f.store), ...(m && f.stock && { verdict: verdict(svc, m, shopSku(v.id, f.store), 1) }) })) })) }));
    s.json({ products, stores: STORES, cadences: Cadences });
  });
  r.get("/api/mandates/:id/shelf", (q, s, next) => { try { s.json(shelfView(svc, must(q.params.id))); } catch (e) { next(e); } });
  r.put("/api/mandates/:id/shelf", (q, s, next) => {
    try {
      const m = must(q.params.id); const { items } = Shelf.parse(q.body);
      for (const it of items) { const hit = findVariant(it.variantId); if (!hit) throw Object.assign(new Error(`unknown item ${it.variantId}`), { status: 400 }); if (it.store !== "best" && !hit.v.offers.some((f) => f.store === it.store)) throw Object.assign(new Error(`${it.store} doesn't sell ${it.variantId}`), { status: 400 }); }
      shelves.set(m.id, items); s.json(shelfView(svc, m));
    } catch (e) { next(e); }
  });
  return r;
}
