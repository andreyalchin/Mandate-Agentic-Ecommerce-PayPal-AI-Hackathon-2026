import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/server/app.js";
import { PayPalRest } from "../src/paypal/index.js";
import { WalletStore } from "../src/server/walletStore.js";
import { MandateService } from "../src/mandate/service.js";
import { cfg, fakePay } from "./helpers.js";

const SHIP = { name: { fullName: "John Doe" }, address: { addressLine1: "2211 N First St", adminArea2: "San Jose", adminArea1: "CA", postalCode: "95131", countryCode: "US" } };

/** Two testers share one server; `who.id` decides which one is calling. */
function setup() {
  const pay = fakePay({
    createOrder: vi.fn(async () => ({ id: "ORDER-1", status: "COMPLETED", purchaseUnits: [{ shipping: SHIP, payments: { captures: [{ id: "CAP-V" }] } }] })),
    getOrder: vi.fn(async (id: string) => ({ id, status: "COMPLETED", payer: { name: { givenName: "John", surname: "Doe" }, emailAddress: "buyer@example.com" }, purchaseUnits: [{ shipping: SHIP, payments: { captures: [{ id: "CAP-V", status: "COMPLETED", amount: { value: "6.50" }, createTime: "2026-10-21T10:00:00Z" }] } }] })),
  });
  const wallets = new WalletStore();
  const wa = wallets.save("VAULT-A", "CUST-A", "PayPal", "a");
  const wb = wallets.save("VAULT-B", "CUST-B", "PayPal", "b");
  const mandates = new MandateService(pay, wallets);
  const who = { id: "a" };
  const app = createApp({ ownerOf: () => who.id, cfg, pay, rest: new PayPalRest(cfg, (async () => new Response("{}")) as any), wallets, mandates });
  const body = (walletRef: string, userId: string) => ({ userId, walletRef, summary: "Coffee and filters under $60 a month", budget: { amount: "60.00", period: "month" }, approvalAbove: "25.00", categories: ["coffee"], expiresAt: "2027-01-01T00:00:00Z" });
  const buy = async (walletRef: string, userId: string) => {
    who.id = userId;
    const m = (await request(app).post("/api/mandates").send(body(walletRef, userId))).body;
    const r = await request(app).post("/api/agent/purchase").send({ mandateId: m.id, agentId: "a", items: [{ sku: "COF-FILTERS-100", quantity: 1 }], rationale: "filters" });
    return { m, receipt: r.body.receipt };
  };
  return { app, pay, wallets, who, buy, wa: wa.walletRef, wb: wb.walletRef };
}

describe("order details", () => {
  it("returns PayPal's delivery address and payer, and stores the ship-to on the receipt", async () => {
    const { app, buy, wa } = setup();
    const { receipt } = await buy(wa, "a");
    expect(receipt.shipTo).toMatchObject({ name: "John Doe", city: "San Jose", region: "CA" });
    const d = (await request(app).get(`/api/receipts/${receipt.id}/details`)).body;
    expect(d).toMatchObject({ status: "COMPLETED", payer: { name: "John Doe", email: "buyer@example.com" }, capture: { id: "CAP-V", at: "2026-10-21T10:00:00Z" } });
    expect(d.shipTo.line1).toBe("2211 N First St");
  });
  it("hides another tester's receipt (address and refund)", async () => {
    const { app, who, buy, wa } = setup();
    const { receipt } = await buy(wa, "a");
    who.id = "b";
    expect((await request(app).get(`/api/receipts/${receipt.id}/details`)).status).toBe(404);
    expect((await request(app).post(`/api/receipts/${receipt.id}/undo`)).status).toBe(404);
  });
});

describe("session reset", () => {
  it("start fresh clears only the caller's mandates and history, keeps PayPal linked", async () => {
    const { app, wallets, who, buy, wa, wb } = setup();
    await buy(wa, "a"); await buy(wb, "b");
    who.id = "a";
    const r = await request(app).post("/api/session/reset").send({ mode: "fresh" });
    expect(r.body).toMatchObject({ mode: "fresh", removedMandates: 1, unlinkedWallets: 0 });
    expect(r.headers["set-cookie"]).toBeUndefined();
    expect((await request(app).get("/api/mandates")).body).toHaveLength(0);
    expect((await request(app).get("/api/receipts")).body).toHaveLength(0);
    expect(wallets.list("a")).toHaveLength(1);
    who.id = "b";
    expect((await request(app).get("/api/receipts")).body).toHaveLength(1);
  });
  it("new tester also unlinks the caller's wallet and expires the session cookie", async () => {
    const { app, wallets, who, buy, wa, wb } = setup();
    await buy(wa, "a"); await buy(wb, "b");
    who.id = "a";
    const r = await request(app).post("/api/session/reset").send({ mode: "new" });
    expect(r.body).toMatchObject({ mode: "new", removedMandates: 1, unlinkedWallets: 1 });
    expect(String(r.headers["set-cookie"])).toMatch(/mandate_sid=;.*Max-Age=0/);
    expect(wallets.list("a")).toHaveLength(0);
    expect(wallets.list("b")).toHaveLength(1);
  });
});

describe("setup before PayPal", () => {
  it("previews a draft with no linked wallet, but never signs one", async () => {
    const { app, who } = setup(); who.id = "fresh";
    const d = { summary: "x", budget: { amount: "100.00", period: "month" }, approvalAbove: "25.00", categories: ["coffee"], expiresAt: "2027-01-01T00:00:00Z", walletRef: "pending" };
    const pv = await request(app).post("/api/mandates/preview").send(d);
    expect(pv.status).toBe(200);
    expect(pv.body.map((r: any) => r.decision)).toEqual(["allow", "needs_approval", "deny"]);
    expect((await request(app).post("/api/mandates").send({ ...d, userId: "fresh" })).status).toBe(404);
  });
});
