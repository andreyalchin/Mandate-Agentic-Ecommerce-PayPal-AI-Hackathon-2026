import { describe, expect, it } from "vitest";
import request from "supertest";
import { toAnthropic, fromAnthropic } from "../src/console/studioLlm.js";
import { simulatedRows } from "../src/console/rows.js";
import { createApp } from "../src/server/app.js";
import { PayPalRest } from "../src/paypal/index.js";
import { WalletStore } from "../src/server/walletStore.js";
import { MandateService } from "../src/mandate/service.js";
import { cfg, fakePay } from "./helpers.js";

describe("AG Studio ↔ Claude translation", () => {
  it("maps conversation items, tool calls and results to Messages", () => {
    const { system, messages, tools } = toAnthropic({
      instructions: "Build dashboards.", toolChoice: "required",
      tools: [{ name: "add_widget", description: "Add", parameters: { type: "object", properties: { type: { type: "string" } } } }],
      input: [
        { kind: "input", type: "message", role: "user", content: [{ type: "text", text: "Add a chart" }] },
        { kind: "output", type: "function_call", callId: "c1", name: "add_widget", arguments: '{"type":"bar"}' },
        { type: "function_call_output", callId: "c1", output: "ok" },
        { kind: "output", type: "message", role: "assistant", content: [{ type: "text", text: "Done" }] },
      ],
    });
    expect(system).toContain("must call at least one tool");
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant", "user"]);
    expect((messages[1].content as any)[0]).toMatchObject({ type: "tool_use", id: "c1", input: { type: "bar" } });
    expect((messages[2].content as any)[0]).toMatchObject({ type: "tool_result", tool_use_id: "c1" });
    expect(tools[0].input_schema.type).toBe("object");
  });
  it("maps Claude output back to AG Studio items", () => {
    const r = fromAnthropic({ id: "msg_1", model: "m", stop_reason: "tool_use", usage: { input_tokens: 5, output_tokens: 3 }, content: [{ type: "text", text: "```json\n{\"a\":1}\n```" }, { type: "tool_use", id: "t1", name: "x", input: { q: 1 } }] } as any, true);
    expect(r.output[0].content[0].text).toBe('{"a":1}');
    expect(r.output[1]).toMatchObject({ type: "function_call", callId: "t1", arguments: '{"q":1}' });
  });
});

describe("spend console data", () => {
  it("simulated history is deterministic and uses the real policy outcomes", () => {
    const now = new Date("2026-11-01T12:00:00Z");
    const a = simulatedRows(now), b = simulatedRows(now);
    expect(a.attempts).toEqual(b.attempts);
    expect(a.attempts.length).toBeGreaterThan(20);
    expect(new Set(a.attempts.map((x) => x.outcome))).toEqual(new Set(["Allowed", "Approved by you", "Declined by you", "Blocked", "Refunded"].filter((o) => a.attempts.some((x) => x.outcome === o))));
    expect(a.attempts.every((x) => x.source === "Simulated")).toBe(true);
    expect(a.attempts.filter((x) => x.category === "electronics").every((x) => x.outcome === "Blocked")).toBe(true);
  });
  it("merges live rows labelled Live", async () => {
    const pay = fakePay(); const wallets = new WalletStore(); const w = wallets.save("V", undefined, undefined, "u1");
    const svc = new MandateService(pay, wallets);
    const m = svc.create({ userId: "u1", walletRef: w.walletRef, summary: "Coffee", budget: { amount: "60.00", period: "month" }, approvalAbove: "25.00", categories: ["coffee"], expiresAt: "2027-01-01T00:00:00Z" });
    await svc.purchase(m.id, "mcp:Claude Code", [{ sku: "COF-FILTERS-100", name: "Filters", unitAmount: "6.50", quantity: 1, category: "coffee", merchant: "Ridgeline Roasters" }], "out");
    const app = createApp({ ownerOf: () => "u1", cfg, pay, rest: new PayPalRest(cfg, (async () => new Response("{}")) as any), wallets, mandates: svc });
    const r = await request(app).get("/api/console/data");
    const live = r.body.attempts.filter((x: any) => x.source === "Live");
    expect(live).toHaveLength(1); expect(live[0]).toMatchObject({ agent: "Claude Code", outcome: "Allowed", spent: 6.5 });
    expect((await request(app).post("/api/studio/turn").send({ input: [] })).status).toBe(503);
  });
  it("never sends a conversation that ends on an assistant turn (Claude rejects prefill)", () => {
    const { messages } = toAnthropic({ input: [
      { type: "message", role: "user", content: [{ type: "input_text", text: "Add a chart" }] },
      { type: "message", role: "assistant", content: [{ type: "output_text", text: "Done." }] },
    ] });
    expect(messages.at(-1)?.role).toBe("user");
  });
});
