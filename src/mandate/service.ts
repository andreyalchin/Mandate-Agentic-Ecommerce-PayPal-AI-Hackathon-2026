import { randomUUID } from "node:crypto";
import { buildOrderRequest, captureIdOf, type PayPalPayments } from "../paypal/index.js";
import type { WalletStore } from "../server/walletStore.js";
import { evaluate, type SpendRecord } from "./policy.js";
import { MandateSigner } from "./signing.js";
import { cartCents, fmt } from "./money.js";
import { IntentMandateInput, type CartLine, type CartMandate, type IntentMandate, type PolicyResult, type Receipt } from "./types.js";

/** Mandate categories are ours; PayPal only needs physical vs digital. */
const toItems = (lines: CartLine[]) => lines.map(({ sku, name, unitAmount, quantity, category }) => ({ sku, name, unitAmount, quantity, category: category === "digital" ? ("DIGITAL_GOODS" as const) : ("PHYSICAL_GOODS" as const) }));
const id = (p: string) => `${p}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
const signable = ({ signature: _s, status: _st, ...rest }: IntentMandate) => rest;

export type PurchaseOutcome =
  | { decision: "allow"; receipt: Receipt; policy: PolicyResult }
  | { decision: "needs_approval"; cartMandate: CartMandate; policy: PolicyResult }
  | { decision: "deny"; policy: PolicyResult };

export class MandateService {
  readonly mandates = new Map<string, IntentMandate>();
  readonly carts = new Map<string, CartMandate>();
  readonly receipts = new Map<string, Receipt>();
  readonly log: { at: string; mandateId: string; agentId: string; decision: string; rule: string; totalCents: number }[] = [];

  constructor(private pay: PayPalPayments, private wallets: WalletStore, readonly signer = new MandateSigner(), private now = () => new Date()) {}

  create(input: unknown): IntentMandate {
    const parsed = IntentMandateInput.parse(input);
    if (!this.wallets.get(parsed.walletRef)) throw Object.assign(new Error("unknown walletRef: link PayPal first"), { status: 400 });
    const draft = { ...parsed, id: id("mdt"), createdAt: this.now().toISOString(), status: "active" as const, signature: "" };
    draft.signature = this.signer.sign(signable(draft));
    this.mandates.set(draft.id, draft);
    return draft;
  }

  revoke(mandateId: string) { const m = this.must(mandateId); m.status = "revoked"; return m; }

  private must(mandateId: string) {
    const m = this.mandates.get(mandateId);
    if (!m) throw Object.assign(new Error("unknown mandate"), { status: 404 });
    return m;
  }

  private spend(): SpendRecord[] {
    return [...this.receipts.values()].map((r) => ({ mandateId: r.mandateId, totalCents: r.totalCents, at: r.at, status: r.status }));
  }

  check(mandateId: string, lines: CartLine[], agentId: string): PolicyResult {
    const m = this.must(mandateId);
    return evaluate(m, lines, this.spend(), agentId, this.now(), this.signer.verify(signable(m), m.signature));
  }

  /** Agent entry point. In-scope carts are charged to the saved wallet with the buyer absent. */
  async purchase(mandateId: string, agentId: string, lines: CartLine[], rationale: string): Promise<PurchaseOutcome> {
    const policy = this.check(mandateId, lines, agentId);
    this.log.push({ at: this.now().toISOString(), mandateId, agentId, decision: policy.decision, rule: policy.rule, totalCents: policy.totalCents });
    if (policy.decision === "deny") return { decision: "deny", policy };
    if (policy.decision === "needs_approval") {
      const cm: CartMandate = { id: id("cart"), mandateId, agentId, lines, totalCents: policy.totalCents, rationale, policy, status: "pending", createdAt: this.now().toISOString() };
      this.carts.set(cm.id, cm);
      return { decision: "needs_approval", cartMandate: cm, policy };
    }
    const m = this.must(mandateId);
    const wallet = this.wallets.get(m.walletRef)!;
    const rid = `mdt-${mandateId}-${randomUUID()}`;
    let order = await this.pay.createOrder(buildOrderRequest(toItems(lines), m.currency, { vaultId: wallet.vaultId, customId: mandateId }), rid);
    if (order.status === "APPROVED") order = await this.pay.captureOrder(order.id!);
    const receipt = this.record(mandateId, agentId, lines, `mandate:${policy.rule}`, policy.reason, rationale, order.id!, captureIdOf(order), order.status === "COMPLETED" ? "captured" : "pending");
    return { decision: "allow", receipt, policy };
  }

  /** Human-present approval: create a PayPal order the user approves with the v6 one-time payment session. */
  async createApprovalOrder(cartId: string, returnUrl: string, cancelUrl: string) {
    const cm = this.carts.get(cartId);
    if (!cm || cm.status !== "pending") throw Object.assign(new Error("cart mandate not pending"), { status: 409 });
    const order = await this.pay.createOrder(buildOrderRequest(toItems(cm.lines), "USD", { customId: cm.mandateId, referenceId: cm.id, returnUrl, cancelUrl, brandName: "Mandate" }), `cart-${cm.id}`);
    cm.orderId = order.id;
    return { orderId: order.id!, cartMandate: cm };
  }

  async captureApproval(cartId: string) {
    const cm = this.carts.get(cartId);
    if (!cm?.orderId) throw Object.assign(new Error("no approval order"), { status: 409 });
    const order = await this.pay.captureOrder(cm.orderId);
    cm.status = "approved";
    return this.record(cm.mandateId, cm.agentId, cm.lines, `approval:${cm.id}`, `You approved this one purchase (${fmt(cm.totalCents)}).`, cm.rationale, order.id!, captureIdOf(order), "captured");
  }

  decline(cartId: string) { const cm = this.carts.get(cartId); if (cm) cm.status = "declined"; return cm; }

  /** One-tap undo: full refund through PayPal; the spend no longer counts against the budget. */
  async undo(receiptId: string) {
    const r = this.receipts.get(receiptId);
    if (!r?.captureId) throw Object.assign(new Error("receipt has no capture"), { status: 409 });
    if (r.status === "refunded") return r;
    await this.pay.refundCapture(r.captureId, undefined, "Undone from Mandate");
    r.status = "refunded";
    return r;
  }

  private record(mandateId: string, agentId: string, lines: CartLine[], allowedBy: string, reason: string, rationale: string, orderId: string, captureId: string | undefined, status: Receipt["status"]) {
    const r: Receipt = { id: id("rcp"), mandateId, agentId, lines, totalCents: cartCents(lines), allowedBy, reason, rationale: rationale.slice(0, 500), orderId, captureId, status, at: this.now().toISOString() };
    this.receipts.set(r.id, r);
    return r;
  }
}
