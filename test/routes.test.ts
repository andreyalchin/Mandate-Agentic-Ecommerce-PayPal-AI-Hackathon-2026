import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { PayPalError } from "../src/paypal/index.js";
import { fakePay, json, makeApp } from "./helpers.js";

describe("routes", () => {
  it("prices the cart on the server and ignores client amounts", async () => {
    const { app, pay } = makeApp();
    const r = await request(app).post("/api/orders").send({ items: [{ sku: "COF-BEANS-1LB", quantity: 2, unitAmount: "0.01" }] });
    expect(r.status).toBe(201);
    expect(pay.createOrder.mock.calls[0][0].purchaseUnits[0].amount.value).toBe("36.00");
  });
  it("rejects unknown skus and bad quantities", async () => {
    const { app } = makeApp();
    expect((await request(app).post("/api/orders").send({ items: [{ sku: "NOPE", quantity: 1 }] })).status).toBe(400);
    expect((await request(app).post("/api/orders").send({ items: [{ sku: "COF-GRINDER", quantity: 0 }] })).status).toBe(400);
  });
  it("captures and returns the capture id", async () => {
    const { app } = makeApp();
    const r = await request(app).post("/api/orders/ORDER-1/capture");
    expect(r.body).toMatchObject({ status: "COMPLETED", captureId: "CAP-1" });
  });
  it("maps INSTRUMENT_DECLINED to 422 with restart hint and debug_id", async () => {
    const pay = fakePay({ captureOrder: vi.fn(async () => { throw new PayPalError("declined", 422, "UNPROCESSABLE_ENTITY", "dbg9", ["INSTRUMENT_DECLINED"]); }) });
    const { app } = makeApp(pay);
    const r = await request(app).post("/api/orders/ORDER-1/capture");
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ restart: true, debug_id: "dbg9" });
  });
  it("forwards PayPal-Mock-Response only in sandbox", async () => {
    const { app, pay } = makeApp();
    const mock = JSON.stringify({ mock_application_codes: "INSTRUMENT_DECLINED" });
    await request(app).post(`/api/orders/O/capture?mock=${encodeURIComponent(mock)}`);
    expect(pay.captureOrder.mock.calls[0][2]).toBe(mock);
  });
  it("never returns the vault id to the client", async () => {
    const { app, pay } = makeApp();
    const saved = await request(app).post("/api/vault/payment-token").send({ setupTokenId: "SETUP-1" });
    expect(JSON.stringify(saved.body)).not.toContain("VAULT-SECRET-1");
    expect(saved.body.walletRef).toMatch(/^wal_/);
    const charge = await request(app).post("/api/orders/vaulted").send({ walletRef: saved.body.walletRef, items: [{ sku: "COF-FILTERS-100", quantity: 1 }] });
    expect(charge.status).toBe(201);
    expect(pay.createOrder.mock.calls[0][0].paymentSource.paypal.vaultId).toBe("VAULT-SECRET-1");
  });
  it("rejects charges to unknown wallets", async () => {
    const { app } = makeApp();
    const r = await request(app).post("/api/orders/vaulted").send({ walletRef: "wal_nope", items: [{ sku: "COF-FILTERS-100", quantity: 1 }] });
    expect(r.status).toBe(404);
  });
  it("validates refund amounts", async () => {
    const { app } = makeApp();
    expect((await request(app).post("/api/refunds").send({ captureId: "C", value: "1.234" })).status).toBe(400);
    expect((await request(app).post("/api/refunds").send({ captureId: "C", value: "1.23" })).status).toBe(201);
  });
});

describe("webhooks", () => {
  const headers = { "paypal-auth-algo": "SHA256withRSA", "paypal-cert-url": "https://api.sandbox.paypal.com/cert", "paypal-transmission-id": "t1", "paypal-transmission-sig": "sig", "paypal-transmission-time": "2026-10-21T00:00:00Z" };
  const event = { id: "WH-EVT-1", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAP-1" } };
  const verifier = (status: string) => vi.fn(async (url: string, _init?: any) => (String(url).includes("oauth2") ? json(200, { access_token: "AT", expires_in: 32400 }) : json(200, { verification_status: status })));

  it("verifies the signature against the raw body and dedupes retries", async () => {
    const seen: any[] = [];
    const f = verifier("SUCCESS");
    const { app } = makeApp(fakePay(), f as any, (e) => seen.push(e));
    const raw = JSON.stringify(event);
    for (let i = 0; i < 2; i++) expect((await request(app).post("/api/webhooks/paypal").set(headers).set("content-type", "application/json").send(raw)).status).toBe(200);
    expect(seen).toHaveLength(1);
    const verifyCall = f.mock.calls.find((c) => String(c[0]).includes("verify-webhook-signature"))!;
    expect(JSON.parse((verifyCall[1] as any).body).webhook_id).toBe("WH-TEST");
  });
  it("rejects failed signatures", async () => {
    const { app } = makeApp(fakePay(), verifier("FAILURE") as any);
    const r = await request(app).post("/api/webhooks/paypal").set(headers).set("content-type", "application/json").send(JSON.stringify(event));
    expect(r.status).toBe(400);
  });
  it("rejects requests missing PayPal transmission headers", async () => {
    const { app } = makeApp(fakePay(), verifier("SUCCESS") as any);
    const r = await request(app).post("/api/webhooks/paypal").set("content-type", "application/json").send(JSON.stringify(event));
    expect(r.status).toBe(400);
  });
});
