import type { PayPalRest } from "./rest.js";

export interface WebhookHeaders { [k: string]: string | string[] | undefined }

const h = (headers: WebhookHeaders, k: string) => {
  const v = headers[k] ?? headers[k.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
};

/**
 * Verify a webhook with PayPal's verify-webhook-signature API.
 * The raw request body must be passed unmodified (parse JSON only after verifying).
 */
export async function verifyWebhook(rest: PayPalRest, webhookId: string, headers: WebhookHeaders, rawBody: string): Promise<boolean> {
  const required = ["paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id", "paypal-transmission-sig", "paypal-transmission-time"];
  if (required.some((k) => !h(headers, k))) return false;
  const res = await rest.request<{ verification_status: string }>("POST", "/v1/notifications/verify-webhook-signature", {
    body: {
      auth_algo: h(headers, "paypal-auth-algo"),
      cert_url: h(headers, "paypal-cert-url"),
      transmission_id: h(headers, "paypal-transmission-id"),
      transmission_sig: h(headers, "paypal-transmission-sig"),
      transmission_time: h(headers, "paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: JSON.parse(rawBody),
    },
  });
  return res.verification_status === "SUCCESS";
}

/** Idempotent event processing: PayPal retries deliveries, so dedupe on event id. */
export class WebhookInbox {
  private seen = new Map<string, number>();
  constructor(private ttlMs = 72 * 3600 * 1000) {}
  firstTime(eventId: string): boolean {
    const now = Date.now();
    for (const [k, t] of this.seen) if (now - t > this.ttlMs) this.seen.delete(k);
    if (this.seen.has(eventId)) return false;
    this.seen.set(eventId, now);
    return true;
  }
}

export const HANDLED_EVENTS = [
  "CHECKOUT.ORDER.APPROVED",
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.DENIED",
  "PAYMENT.CAPTURE.PENDING",
  "PAYMENT.CAPTURE.REFUNDED",
  "VAULT.PAYMENT-TOKEN.CREATED",
  "VAULT.PAYMENT-TOKEN.DELETED",
  "CUSTOMER.DISPUTE.CREATED",
] as const;
