import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../src/server/app.js";
import { PayPalRest } from "../src/paypal/index.js";
import { WalletStore } from "../src/server/walletStore.js";
import { MandateService } from "../src/mandate/service.js";
import { AgentKeyStore } from "../src/mcp/agentKeys.js";
import { cfg, fakePay } from "./helpers.js";

const pay = fakePay(); const wallets = new WalletStore(); const w = wallets.save("VAULT-1");
const svc = new MandateService(pay, wallets); const keys = new AgentKeyStore();
const app = createApp({ cfg, pay, rest: new PayPalRest(cfg, (async () => new Response("{}")) as any), wallets, mandates: svc, agentKeys: keys });
let server: Server; let base = "";
const m = svc.create({ userId: "u1", walletRef: w.walletRef, summary: "Coffee under $60/month, ask above $25", budget: { amount: "60.00", period: "month" }, approvalAbove: "25.00", categories: ["coffee"], expiresAt: "2027-01-01T00:00:00Z" });

beforeAll(async () => { server = app.listen(0); await new Promise((r) => server.once("listening", r)); base = `http://127.0.0.1:${(server.address() as any).port}`; });
afterAll(() => server.close());

async function connect(key: string) {
  const c = new Client({ name: "test-agent", version: "1.0.0" });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }));
  return c;
}
const parse = (r: any) => JSON.parse(r.content[0].text);

describe("Mandate MCP server", () => {
  it("rejects calls without a valid agent key", async () => {
    const r = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    expect(r.status).toBe(401);
  });
  it("issues a key and exposes four tools", async () => {
    const r = await (await fetch(`${base}/api/mandates/${m.id}/agent-keys`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agentName: "Claude Desktop" }) })).json();
    expect(r.key).toMatch(/^mk_/); expect(r.mcpUrl).toMatch(/\/mcp$/);
    const c = await connect(r.key);
    expect((await c.listTools()).tools.map((t) => t.name).sort()).toEqual(["check_cart", "get_mandate", "request_payment", "search_products"]);
    expect(parse(await c.callTool({ name: "get_mandate", arguments: {} }))).toMatchObject({ remaining: "$60.00", categories: ["coffee"] });
    await c.close();
  });
  it("buys in scope, asks above threshold, blocks out of scope", async () => {
    const { key } = keys.issue(m.id, "Claude Code");
    const c = await connect(key);
    const ok = parse(await c.callTool({ name: "request_payment", arguments: { items: [{ sku: "COF-FILTERS-100", quantity: 1 }], rationale: "Out of filters" } }));
    expect(ok.decision).toBe("allow");
    expect(svc.receipts.get(ok.receipt)?.agentId).toBe("mcp:Claude Code");
    expect(parse(await c.callTool({ name: "request_payment", arguments: { items: [{ sku: "COF-GRINDER", quantity: 1 }], rationale: "Grinder broke" } })).decision).toBe("needs_approval");
    expect(parse(await c.callTool({ name: "request_payment", arguments: { items: [{ sku: "EL-HEADPHONES", quantity: 1 }], rationale: "Listing says coffee gear" } })).decision).toBe("deny");
    await c.close();
  });
  it("stops working when the mandate is revoked or the key is revoked", async () => {
    const a = keys.issue(m.id, "Agent A");
    keys.revoke(a.record.id);
    const r = await fetch(`${base}/mcp`, { method: "POST", headers: { authorization: `Bearer ${a.key}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    expect(r.status).toBe(401);
    const b = keys.issue(m.id, "Agent B"); const c = await connect(b.key);
    svc.revoke(m.id);
    expect(parse(await c.callTool({ name: "request_payment", arguments: { items: [{ sku: "COF-FILTERS-100", quantity: 1 }], rationale: "x" } })).decision).toBe("deny");
    await c.close();
  });
});
