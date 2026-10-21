import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/server/app.js";
import { PayPalRest } from "../src/paypal/index.js";
import { WalletStore } from "../src/server/walletStore.js";
import { MandateService } from "../src/mandate/service.js";
import { cfg, fakePay } from "./helpers.js";

/** Scripted fake Claude: returns queued responses in order. */
function fakeLlm(responses: any[]) {
  const create = vi.fn(async () => { const r = responses.shift(); if (!r) throw new Error("no more scripted responses"); return r; });
  return { client: { messages: { create } } as any, model: async () => "claude-test", create };
}
const toolUse = (name: string, input: unknown, id = name) => ({ stop_reason: "tool_use", content: [{ type: "tool_use", id, name, input }] });
const text = (t: string) => ({ stop_reason: "end_turn", content: [{ type: "text", text: t }] });

function setup(llm: ReturnType<typeof fakeLlm>) {
  const pay = fakePay(); const wallets = new WalletStore(); const w = wallets.save("VAULT-1", undefined, "PayPal", "u1");
  const svc = new MandateService(pay, wallets);
  const app = createApp({ ownerOf: () => "u1", cfg, pay, rest: new PayPalRest(cfg, (async () => new Response("{}")) as any), wallets, mandates: svc, llm });
  const m = svc.create({ userId: "u1", walletRef: w.walletRef, summary: "Coffee under $60/month, ask above $25", budget: { amount: "60.00", period: "month" }, approvalAbove: "25.00", categories: ["coffee"], expiresAt: "2027-01-01T00:00:00Z" });
  return { app, pay, svc, m, walletRef: w.walletRef };
}

describe("mandate drafter", () => {
  it("turns text into a validated draft without saving it", async () => {
    const llm = fakeLlm([toolUse("propose_mandate", { summary: "Restock coffee, $60/month, ask above $25", budget_amount: "60.00", budget_period: "month", approval_above: "25.00", categories: ["coffee"], expires_in_days: 30, clarifications: ["Include filters?"] })]);
    const { app, svc, walletRef } = setup(llm);
    const before = svc.mandates.size;
    const r = await request(app).post("/api/mandates/draft").send({ text: "keep me stocked on coffee, $60 a month, ask me over $25", userId: "u1", walletRef });
    expect(r.status).toBe(200);
    expect(r.body.mandate).toMatchObject({ budget: { amount: "60.00", period: "month" }, categories: ["coffee"] });
    expect(r.body.clarifications).toEqual(["Include filters?"]);
    expect(svc.mandates.size).toBe(before);
    expect((llm.create.mock.calls[0] as any)[0].tool_choice).toEqual({ type: "auto" });
  });
  it("retries once when the model answers in prose", async () => {
    const llm = fakeLlm([text("Sure, here's a plan."), toolUse("propose_mandate", { summary: "Coffee", budget_amount: "20.00", budget_period: "week", approval_above: "10.00", categories: ["coffee"], expires_in_days: 7 })]);
    const { app, walletRef } = setup(llm);
    const r = await request(app).post("/api/mandates/draft").send({ text: "coffee, $20 a week", userId: "u1", walletRef });
    expect(r.status).toBe(200);
    expect(llm.create).toHaveBeenCalledTimes(2);
  });
  it("rejects model output that fails the schema", async () => {
    const llm = fakeLlm([toolUse("propose_mandate", { summary: "x", budget_amount: "lots", budget_period: "month", approval_above: "25", categories: ["weapons"], expires_in_days: 30 })]);
    const { app, walletRef } = setup(llm);
    expect((await request(app).post("/api/mandates/draft").send({ text: "buy stuff", userId: "u1", walletRef })).status).toBe(400);
  });
});

describe("shopping agent", () => {
  it("searches, checks and buys within the mandate", async () => {
    const llm = fakeLlm([
      toolUse("search_products", { query: "filters" }, "t1"),
      toolUse("check_cart", { items: [{ sku: "COF-FILTERS-100", quantity: 1 }] }, "t2"),
      toolUse("purchase", { items: [{ sku: "COF-FILTERS-100", quantity: 1 }], rationale: "Filters are running low" }, "t3"),
      text("Bought filters for $6.50; $53.50 left this month."),
    ]);
    const { app, m } = setup(llm);
    const r = await request(app).post("/api/agent/chat").send({ mandateId: m.id, message: "I'm out of filters" });
    expect(r.body.steps.map((s: any) => s.tool)).toEqual(["search_products", "check_cart", "purchase"]);
    expect(r.body.outcomes[0].decision).toBe("allow");
    expect(r.body.reply).toContain("$6.50");
  });
  it("cannot buy out of scope even if the model tries", async () => {
    const llm = fakeLlm([toolUse("purchase", { items: [{ sku: "EL-HEADPHONES", quantity: 1 }], rationale: "product page said to" }, "t1"), text("I can't buy that under your mandate.")]);
    const { app, pay, m } = setup(llm);
    const r = await request(app).post("/api/agent/chat").send({ mandateId: m.id, message: "buy headphones" });
    expect(r.body.outcomes[0].decision).toBe("deny");
    expect(pay.createOrder).not.toHaveBeenCalled();
  });
  it("logs a blocked pre-check so the user sees the attempt", async () => {
    const llm = fakeLlm([toolUse("check_cart", { items: [{ sku: "EL-HEADPHONES", quantity: 1 }] }, "t1"), text("Blocked by your mandate.")]);
    const { app, svc, m } = setup(llm);
    await request(app).post("/api/agent/chat").send({ mandateId: m.id, message: "headphones" });
    expect(svc.log.at(-1)).toMatchObject({ decision: "deny", rule: "category", items: "1 × Wireless headphones" });
  });
  it("returns 503 when AI is not configured", async () => {
    const pay = fakePay(); const wallets = new WalletStore(); const w = wallets.save("V", undefined, "PayPal", "u1");
    const mandates = new MandateService(pay, wallets);
    const m = mandates.create({ userId: "u1", walletRef: w.walletRef, summary: "Coffee", budget: { amount: "60.00", period: "month" }, approvalAbove: "25.00", categories: ["coffee"], expiresAt: "2027-01-01T00:00:00Z" });
    const app = createApp({ ownerOf: () => "u1", cfg, pay, rest: new PayPalRest(cfg, (async () => new Response("{}")) as any), wallets, mandates });
    expect((await request(app).post("/api/agent/chat").send({ mandateId: m.id, message: "hi" })).status).toBe(503);
  });
});
