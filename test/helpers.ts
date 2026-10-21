import { vi } from "vitest";
import { createApp } from "../src/server/app.js";
import { PayPalRest, type PayPalConfig } from "../src/paypal/index.js";

export const cfg: PayPalConfig = { clientId: "test-client", clientSecret: "test-secret", env: "sandbox", webhookId: "WH-TEST", publicOrigin: "http://localhost:8787" };

/** Fake PayPalPayments with spies so routes can be tested without network. */
export function fakePay(overrides: Record<string, any> = {}) {
  return {
    createOrder: vi.fn(async (body: any) => ({ id: "ORDER-1", status: body.paymentSource?.paypal?.vaultId ? "COMPLETED" : "CREATED", purchaseUnits: [{ payments: { captures: [{ id: "CAP-V" }] } }] })),
    captureOrder: vi.fn(async (id: string) => ({ id, status: "COMPLETED", purchaseUnits: [{ payments: { captures: [{ id: "CAP-1" }] } }], payer: { emailAddress: "buyer@example.com" } })),
    getOrder: vi.fn(async (id: string) => ({ id, status: "CREATED" })),
    createPayPalSetupToken: vi.fn(async () => ({ id: "SETUP-1", status: "CREATED" })),
    createPaymentTokenFromSetupToken: vi.fn(async () => ({ id: "VAULT-SECRET-1", customer: { id: "CUST-1" } })),
    refundCapture: vi.fn(async () => ({ id: "REF-1", status: "COMPLETED" })),
    ...overrides,
  } as any;
}

export function makeApp(pay = fakePay(), restFetch?: typeof fetch, onEvent?: (e: any) => void) {
  const rest = new PayPalRest(cfg, restFetch ?? (vi.fn() as any), async () => {});
  return { app: createApp({ cfg, pay, rest, onEvent }), pay, rest };
}

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
