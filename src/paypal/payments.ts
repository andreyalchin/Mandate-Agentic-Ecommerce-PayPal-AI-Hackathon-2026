import { randomUUID } from "node:crypto";
import {
  CheckoutPaymentIntent, OrdersController, PaymentsController, PaypalPaymentTokenUsageType, VaultController,
  VaultInstructionAction, VaultTokenRequestType,
  type Client, type Order, type OrderRequest,
} from "@paypal/paypal-server-sdk";
import { normalizeError } from "./errors.js";

export interface LineItem { sku: string; name: string; unitAmount: string; quantity: number; category?: "PHYSICAL_GOODS" | "DIGITAL_GOODS" }
export interface Money { currency: string; value: string }

/** Server-side order math: never trust amounts from the browser or an agent. */
export function buildOrderRequest(items: LineItem[], currency = "USD", opts: { referenceId?: string; customId?: string; vaultId?: string; storeInVault?: boolean; returnUrl?: string; cancelUrl?: string; brandName?: string } = {}): OrderRequest {
  if (!items.length) throw new Error("order needs at least one item");
  const cents = items.reduce((s, i) => {
    if (!/^\d+(\.\d{1,2})?$/.test(i.unitAmount)) throw new Error(`bad amount for ${i.sku}`);
    if (!Number.isInteger(i.quantity) || i.quantity < 1) throw new Error(`bad quantity for ${i.sku}`);
    return s + Math.round(Number(i.unitAmount) * 100) * i.quantity;
  }, 0);
  const total = (cents / 100).toFixed(2);
  const paypal: any = {};
  if (opts.vaultId) {
    paypal.vaultId = opts.vaultId; // returning, human-not-present charge
  } else {
    paypal.experienceContext = {
      brandName: opts.brandName,
      userAction: "PAY_NOW",
      shippingPreference: items.every((i) => i.category === "DIGITAL_GOODS") ? "NO_SHIPPING" : "GET_FROM_FILE",
      returnUrl: opts.returnUrl,
      cancelUrl: opts.cancelUrl,
    };
    if (opts.storeInVault) paypal.attributes = { vault: { storeInVault: "ON_SUCCESS", usageType: "MERCHANT", customerType: "CONSUMER" } };
  }
  return {
    intent: CheckoutPaymentIntent.Capture,
    purchaseUnits: [{
      referenceId: opts.referenceId,
      customId: opts.customId,
      amount: { currencyCode: currency, value: total, breakdown: { itemTotal: { currencyCode: currency, value: total } } },
      items: items.map((i) => ({ name: i.name.slice(0, 127), sku: i.sku, quantity: String(i.quantity), unitAmount: { currencyCode: currency, value: Number(i.unitAmount).toFixed(2) }, category: i.category as any })),
    }],
    paymentSource: { paypal },
  } as OrderRequest;
}

export class PayPalPayments {
  readonly orders: OrdersController;
  readonly payments: PaymentsController;
  readonly vault: VaultController;
  constructor(client: Client) {
    this.orders = new OrdersController(client);
    this.payments = new PaymentsController(client);
    this.vault = new VaultController(client);
  }

  /** Create an order. Pass a stable requestId (e.g. cart or mandate id) so retries are idempotent. */
  async createOrder(body: OrderRequest, requestId: string = randomUUID(), mock?: string): Promise<Order> {
    try {
      const { result } = await this.orders.createOrder({ body, paypalRequestId: requestId, prefer: "return=representation", paypalMockResponse: mock });
      return result;
    } catch (e) { throw normalizeError(e); }
  }

  async captureOrder(id: string, requestId = `capture-${id}`, mock?: string): Promise<Order> {
    try {
      const { result } = await this.orders.captureOrder({ id, paypalRequestId: requestId, prefer: "return=representation", paypalMockResponse: mock });
      return result;
    } catch (e) { throw normalizeError(e); }
  }

  async getOrder(id: string): Promise<Order> {
    try { return (await this.orders.getOrder({ id })).result; } catch (e) { throw normalizeError(e); }
  }

  /** Step 1 of "save PayPal without purchase": returns a setup token the buyer approves in the v6 SDK. */
  async createPayPalSetupToken(opts: { description: string; returnUrl: string; cancelUrl: string; brandName?: string; customerId?: string; requestId?: string }) {
    try {
      const { result } = await this.vault.createSetupToken({
        paypalRequestId: opts.requestId ?? randomUUID(),
        body: {
          customer: opts.customerId ? { id: opts.customerId } : undefined,
          paymentSource: { paypal: {
            description: opts.description,
            usageType: PaypalPaymentTokenUsageType.Merchant,
            experienceContext: { brandName: opts.brandName, returnUrl: opts.returnUrl, cancelUrl: opts.cancelUrl, vaultInstruction: VaultInstructionAction.OnPayerApproval },
          } },
        },
      });
      return result;
    } catch (e) { throw normalizeError(e); }
  }

  /** Step 2: exchange the approved setup token for a long-lived payment token (vault id). */
  async createPaymentTokenFromSetupToken(setupTokenId: string, requestId = `ptok-${setupTokenId}`) {
    try {
      const { result } = await this.vault.createPaymentToken({ paypalRequestId: requestId, body: { paymentSource: { token: { id: setupTokenId, type: VaultTokenRequestType.SetupToken } } } });
      return result;
    } catch (e) { throw normalizeError(e); }
  }

  async refundCapture(captureId: string, amount?: Money, note?: string, requestId = `refund-${captureId}-${amount?.value ?? "full"}`) {
    try {
      const { result } = await this.payments.refundCapturedPayment({
        captureId, paypalRequestId: requestId, prefer: "return=representation",
        body: { amount: amount ? { currencyCode: amount.currency, value: amount.value } : undefined, noteToPayer: note?.slice(0, 255) },
      });
      return result;
    } catch (e) { throw normalizeError(e); }
  }
}

/** First capture id of a captured order, for refunds and receipts. */
export const captureIdOf = (o: Order) => o.purchaseUnits?.[0]?.payments?.captures?.[0]?.id;
export const vaultIdOf = (o: Order) => (o.paymentSource as any)?.paypal?.attributes?.vault?.id as string | undefined;
