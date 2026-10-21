/**
 * Live PayPal sandbox smoke test. Never prints secrets or tokens.
 * Auth: PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET, or PAYPAL_ACCESS_TOKEN (pre-issued sandbox token).
 *   npm run smoke
 */
import { randomUUID } from "node:crypto";
import { buildOrderRequest, PayPalError, PayPalRest, type PayPalConfig } from "../src/paypal/index.js";

const cfg: PayPalConfig = {
  clientId: process.env.PAYPAL_CLIENT_ID ?? "token-mode",
  clientSecret: process.env.PAYPAL_CLIENT_SECRET ?? "token-mode",
  env: "sandbox",
  publicOrigin: process.env.PUBLIC_ORIGIN ?? "http://localhost:8787",
};
const rest = new PayPalRest(cfg, fetch, undefined, process.env.PAYPAL_ACCESS_TOKEN);
const results: { step: string; ok: boolean; detail?: unknown }[] = [];
const step = async (name: string, fn: () => Promise<unknown>) => {
  try { results.push({ step: name, ok: true, detail: await fn() }); }
  catch (e) { const pe = e as PayPalError; results.push({ step: name, ok: false, detail: { status: pe.status, name: pe.name_, debug_id: pe.debugId, message: pe.message } }); }
};

// SDK camelCase -> REST snake_case for the raw call
const toSnake = (v: any): any => Array.isArray(v) ? v.map(toSnake) : v && typeof v === "object"
  ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase()), toSnake(x)])) : v;

let orderId = "";
await step("oauth token", async () => { await rest.accessToken(); return "issued"; });
await step("create order (PayPal-Request-Id)", async () => {
  const body = toSnake(buildOrderRequest([{ sku: "COF-FILTERS-100", name: "Paper filters, 100 pack", unitAmount: "6.50", quantity: 1, category: "PHYSICAL_GOODS" }], "USD", { returnUrl: `${cfg.publicOrigin}/?return=1`, cancelUrl: `${cfg.publicOrigin}/?cancel=1`, brandName: "Smoke Test" }));
  const rid = randomUUID();
  const a = await rest.request("POST", "/v2/checkout/orders", { body, requestId: rid });
  const b = await rest.request("POST", "/v2/checkout/orders", { body, requestId: rid });
  orderId = a.id;
  return { id: a.id, status: a.status, idempotent: a.id === b.id, approveLink: !!a.links?.find((l: any) => l.rel === "payer-action" || l.rel === "approve") };
});
await step("get order", async () => { const o = await rest.request("GET", `/v2/checkout/orders/${orderId}`); return { status: o.status, total: o.purchase_units?.[0]?.amount?.value }; });
await step("capture before approval is rejected", async () => {
  try { await rest.request("POST", `/v2/checkout/orders/${orderId}/capture`, { body: {} }); return { unexpected: "captured" }; }
  catch (e) { const pe = e as PayPalError; if (pe.status !== 422) throw e; return { status: 422, issue: pe.issues[0], debug_id: !!pe.debugId }; }
});
await step("vault setup token (save PayPal without purchase)", async () => {
  const st = await rest.request("POST", "/v3/vault/setup-tokens", { body: { payment_source: { paypal: { usage_type: "MERCHANT", experience_context: { return_url: `${cfg.publicOrigin}/?vault=return`, cancel_url: `${cfg.publicOrigin}/?vault=cancel`, vault_instruction: "ON_PAYER_APPROVAL" } } } } });
  return { id: st.id ? "created" : "missing", status: st.status };
});
await step("webhooks registered on app", async () => { const w = await rest.request("GET", "/v1/notifications/webhooks"); return { count: w.webhooks?.length ?? 0, urls: (w.webhooks ?? []).map((x: any) => x.url) }; });
await step("disputes API reachable", async () => { const d = await rest.request("GET", "/v1/customer/disputes?page_size=1"); return { items: d.items?.length ?? 0 }; });
await step("transaction search reachable", async () => {
  const end = new Date(); const start = new Date(end.getTime() - 25 * 86400e3);
  const t = await rest.request("GET", `/v1/reporting/transactions?start_date=${start.toISOString().slice(0, 19)}Z&end_date=${end.toISOString().slice(0, 19)}Z&page_size=1`);
  return { total_items: t.total_items ?? 0 };
});

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.step}  ${JSON.stringify(r.detail)}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
