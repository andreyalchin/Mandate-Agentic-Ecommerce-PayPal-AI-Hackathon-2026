import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/server/app.js";
import { PayPalRest } from "../src/paypal/index.js";
import { WalletStore } from "../src/server/walletStore.js";
import { MandateService } from "../src/mandate/service.js";
import { cfg, fakePay } from "./helpers.js";
import { PRODUCTS, STORES, shopLookup, shopSku } from "../src/catalog/shop.js";
import { cartLines, findProducts } from "../src/server/catalog.js";

function setup(over: Record<string, unknown> = {}) {
  const pay = fakePay(); const wallets = new WalletStore(); const w = wallets.save("VAULT-SECRET-1", "CUST-1", "PayPal", "u1");
  const mandates = new MandateService(pay, wallets);
  const app = createApp({ ownerOf: () => "u1", cfg, pay, rest: new PayPalRest(cfg, (async () => new Response("{}")) as any), wallets, mandates });
  const body = { userId: "u1", walletRef: w.walletRef, summary: "Coffee and kitchen, $60 a month, ask me above $25", budget: { amount: "60.00", period: "month" }, approvalAbove: "25.00", categories: ["coffee", "kitchen"], expiresAt: new Date(Date.now() + 864e5 * 90).toISOString(), currency: "USD", ...over };
  return { app, pay, body };
}

describe("shop catalog", () => {
  it("has variants sold by known stores, with unique ids and images", () => {
    const ids = PRODUCTS.flatMap((p) => p.variants.map((v) => v.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PRODUCTS) { expect(p.image).toMatch(/^\/sample\/.+\.webp$/); for (const v of p.variants) for (const o of v.offers) expect(STORES.some((s) => s.name === o.store)).toBe(true); }
  });
  it("prices shop skus on the server and refuses unknown or out-of-stock offers", () => {
    const [l] = cartLines([{ sku: shopSku("beans-house-16", "Harbor Market"), quantity: 2 }]);
    expect(l).toMatchObject({ unitAmount: "18.75", merchant: "Harbor Market", category: "coffee" });
    expect(() => shopLookup("SH-beans-house-16@volt-outlet")).toThrow(/unknown/);
    expect(() => shopLookup(shopSku("beans-fern-12", "Harbor Market"))).toThrow(/out of stock/);
  });
  it("search returns shop items with the cheapest store and alternatives", async () => {
    const r = await findProducts("oat milk");
    const top = r.products.find((p: any) => p.source === "Mandate shop" && /Oatfield Barista oat milk, 32 oz, 6 pack/.test(p.name)) as any;
    expect(top).toMatchObject({ merchant: "Harbor Market", price: "19.80" });
    expect(top.otherStores.length).toBe(2);
  });
});

describe("repeat list", () => {
  it("suggests items for the mandate's categories with decisions and a monthly estimate", async () => {
    const { app, body } = setup();
    const m = (await request(app).post("/api/mandates").send(body)).body;
    const r = (await request(app).get(`/api/mandates/${m.id}/shelf`)).body;
    expect(r.suggested).toBe(true);
    expect(r.items.map((x: any) => x.variantId)).toEqual(["beans-house-16", "filters-brew-100", "oat-barista-6"]);
    expect(r.items.every((x: any) => x.verdict.decision === "allow")).toBe(true);
    // 18.00 monthly + 5.99 every 60 days + 19.80 every 14 days
    expect(r.monthlyCents).toBe(1800 + Math.round(599 / 2) + Math.round((1980 * 30) / 14));
    expect(r.budgetMonthlyCents).toBe(6000);
  });
  it("saves choices, honors a chosen store, and flags items outside the mandate", async () => {
    const { app, body } = setup();
    const m = (await request(app).post("/api/mandates").send(body)).body;
    const r = await request(app).put(`/api/mandates/${m.id}/shelf`).send({ items: [
      { variantId: "beans-summit-32", store: "QuickMart", qty: 1, every: 30 },
      { variantId: "towels-soft-6", store: "best", qty: 2, every: 30 },
    ] });
    expect(r.status).toBe(200);
    expect(r.body.suggested).toBe(false);
    expect(r.body.items[0]).toMatchObject({ storeChosen: "QuickMart", price: "31.00", isBest: false, bestStore: "Parcel & Pantry", verdict: { decision: "needs_approval" } });
    expect(r.body.items[1].verdict).toMatchObject({ decision: "deny", rule: "category" });
    expect((await request(app).put(`/api/mandates/${m.id}/shelf`).send({ items: [{ variantId: "beans-house-16", store: "Volt Outlet", qty: 1, every: 30 }] })).status).toBe(400);
    expect((await request(app).put(`/api/mandates/${m.id}/shelf`).send({ items: [{ variantId: "beans-house-16", store: "best", qty: 1, every: 45 }] })).status).toBe(400);
  });
  it("only uses stores the mandate allows when picking the best price", async () => {
    const { app, body } = setup({ merchants: ["Ridgeline Roasters", "Corner Supply Co."] });
    const m = (await request(app).post("/api/mandates").send(body)).body;
    const r = (await request(app).get(`/api/mandates/${m.id}/shelf`)).body;
    expect(r.items.find((x: any) => x.variantId === "filters-brew-100")).toMatchObject({ storeChosen: "Corner Supply Co.", price: "6.25" });
    const cat = (await request(app).get(`/api/shop/catalog?mandateId=${m.id}`)).body;
    const qm = cat.products.find((p: any) => p.id === "paper-filters").variants[0].offers.find((o: any) => o.store === "QuickMart");
    expect(qm.verdict).toMatchObject({ decision: "deny", rule: "merchant" });
  });
  it("hides another person's repeat list", async () => {
    const { app, body } = setup();
    const m = (await request(app).post("/api/mandates").send(body)).body;
    const other = createApp({ ownerOf: () => "u2", cfg, pay: fakePay(), rest: new PayPalRest(cfg, (async () => new Response("{}")) as any), wallets: new WalletStore(), mandates: new MandateService(fakePay(), new WalletStore()) });
    expect((await request(other).get(`/api/mandates/${m.id}/shelf`)).status).toBe(404);
  });
});
