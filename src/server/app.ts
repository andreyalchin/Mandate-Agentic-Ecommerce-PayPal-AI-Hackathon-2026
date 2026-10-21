import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import { z } from "zod";
import {
  buildOrderRequest, captureIdOf, normalizeError, PayPalError, PayPalPayments, PayPalRest,
  verifyWebhook, vaultIdOf, WebhookInbox, webSdkUrl, type PayPalConfig,
} from "../paypal/index.js";
import { priceCart } from "./catalog.js";
import { WalletStore } from "./walletStore.js";
import { MandateService } from "../mandate/service.js";
import { mandateRoutes, type Llm } from "./mandateRoutes.js";

export interface Deps { cfg: PayPalConfig; pay: PayPalPayments; rest: PayPalRest; wallets?: WalletStore; mandates?: MandateService; llm?: Llm; onEvent?: (e: any) => void | Promise<void> }

const Cart = z.object({ items: z.array(z.object({ sku: z.string().min(1), quantity: z.number().int().min(1).max(20) })).min(1) });

export function createApp({ cfg, pay, rest, wallets = new WalletStore(), mandates, llm, onEvent }: Deps) {
  const svc = mandates ?? new MandateService(pay, wallets);
  const app = express();
  const inbox = new WebhookInbox();
  // Sandbox-only negative testing: forward ?mock=<PayPal-Mock-Response JSON> to PayPal.
  const mockOf = (req: Request) => (cfg.env === "sandbox" && typeof req.query.mock === "string" ? req.query.mock : undefined);

  // Webhooks need the raw body for signature verification, so register before express.json().
  app.post("/api/webhooks/paypal", express.raw({ type: "*/*", limit: "1mb" }), async (req, res, next) => {
    try {
      const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
      if (!cfg.webhookId) return res.status(503).json({ error: "PAYPAL_WEBHOOK_ID not configured" });
      const ok = await verifyWebhook(rest, cfg.webhookId, req.headers, raw);
      if (!ok) return res.status(400).json({ error: "INVALID_SIGNATURE" });
      const event = JSON.parse(raw);
      if (inbox.firstTime(event.id)) await onEvent?.(event);
      res.sendStatus(200); // ack fast; PayPal retries non-2xx
    } catch (e) { next(e); }
  });

  app.use(express.json({ limit: "100kb" }));
  // Product UI (Vite build) first, then the developer harness at /harness.html.
  app.use(express.static(path.resolve("dist/web")));
  app.use(express.static(path.resolve("public")));

  app.use(mandateRoutes(svc, cfg.publicOrigin, llm));

  app.get("/api/health", (_req, res) => res.json({ ok: true, env: cfg.env }));

  app.get("/api/wallets", (_req, res) => res.json(wallets.list()));
  app.get("/api/config", (_req, res) => res.json({ env: cfg.env, sdkUrl: webSdkUrl(cfg.env), clientId: cfg.clientId.startsWith("proxy") ? undefined : cfg.clientId }));

  app.post("/api/client-token", async (_req, res, next) => {
    try {
      // domains[] is only required by Fastlane and PayPal rejects "localhost"; send it for real hosts only.
      const host = new URL(cfg.publicOrigin).hostname;
      const { token, expiresIn } = await rest.clientToken(/^(localhost|127\.)/.test(host) ? [] : [host]);
      res.json({ clientToken: token, expiresIn });
    } catch (e) { next(e); }
  });

  app.post("/api/orders", async (req, res, next) => {
    try {
      const { items } = Cart.parse(req.body);
      const order = await pay.createOrder(buildOrderRequest(priceCart(items), "USD", {
        brandName: "Hackathon Demo", storeInVault: req.body?.saveForLater === true,
        returnUrl: `${cfg.publicOrigin}/?return=1`, cancelUrl: `${cfg.publicOrigin}/?cancel=1`,
      }), req.get("x-idempotency-key") ?? undefined, mockOf(req));
      res.status(201).json({ id: order.id, status: order.status });
    } catch (e) { next(e); }
  });

  app.post("/api/orders/:id/capture", async (req, res, next) => {
    try {
      const order = await pay.captureOrder(req.params.id, undefined, mockOf(req));
      const vaultId = vaultIdOf(order);
      const walletRef = vaultId ? wallets.save(vaultId, (order.paymentSource as any)?.paypal?.attributes?.vault?.customer?.id, "PayPal").walletRef : undefined;
      res.json({ id: order.id, status: order.status, captureId: captureIdOf(order), walletRef, payer: order.payer?.emailAddress });
    } catch (e) { next(e); }
  });

  app.get("/api/orders/:id", async (req, res, next) => {
    try { res.json(await pay.getOrder(req.params.id)); } catch (e) { next(e); }
  });

  app.post("/api/vault/setup-token", async (req, res, next) => {
    try {
      const st = await pay.createPayPalSetupToken({
        description: String(req.body?.description ?? "Save PayPal for future purchases").slice(0, 127),
        returnUrl: `${cfg.publicOrigin}/?vault=return`, cancelUrl: `${cfg.publicOrigin}/?vault=cancel`, brandName: "Hackathon Demo",
      });
      res.status(201).json({ id: st.id, status: st.status });
    } catch (e) { next(e); }
  });

  app.post("/api/vault/payment-token", async (req, res, next) => {
    try {
      const { setupTokenId } = z.object({ setupTokenId: z.string().min(1) }).parse(req.body);
      const pt = await pay.createPaymentTokenFromSetupToken(setupTokenId);
      if (!pt.id) throw new Error("PayPal returned no payment token id");
      const w = wallets.save(pt.id, pt.customer?.id, "PayPal");
      res.status(201).json({ walletRef: w.walletRef, label: w.label }); // vault id stays server-side
    } catch (e) { next(e); }
  });

  /** Human-not-present charge with a saved PayPal payment token (agent / recurring use). */
  app.post("/api/orders/vaulted", async (req, res, next) => {
    try {
      const { walletRef, items } = Cart.extend({ walletRef: z.string().min(1) }).parse(req.body);
      const wallet = wallets.get(walletRef);
      if (!wallet) return res.status(404).json({ error: "UNKNOWN_WALLET" });
      const vaultId = wallet.vaultId;
      let order = await pay.createOrder(buildOrderRequest(priceCart(items), "USD", { vaultId }), req.get("x-idempotency-key") ?? undefined, mockOf(req));
      if (order.status === "APPROVED") order = await pay.captureOrder(order.id!);
      res.status(201).json({ id: order.id, status: order.status, captureId: captureIdOf(order) });
    } catch (e) { next(e); }
  });

  app.post("/api/refunds", async (req, res, next) => {
    try {
      const { captureId, value, note } = z.object({ captureId: z.string().min(1), value: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(), note: z.string().max(255).optional() }).parse(req.body);
      const r = await pay.refundCapture(captureId, value ? { currency: "USD", value } : undefined, note);
      res.status(201).json({ id: r.id, status: r.status });
    } catch (e) { next(e); }
  });

  // Error mapping: always surface debug_id; tell the client when to restart with another funding source.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) return res.status(400).json({ error: "INVALID_REQUEST", issues: err.issues });
    const st = (err as any)?.status;
    if (!(err instanceof PayPalError) && st === 503) return res.status(503).json({ error: "UNAVAILABLE", message: (err as Error).message });
    if (!(err instanceof PayPalError) && typeof st === "number" && st >= 400 && st < 500) return res.status(st).json({ error: st === 404 ? "NOT_FOUND" : st === 409 ? "CONFLICT" : "INVALID_REQUEST", message: (err as Error).message });
    const e = normalizeError(err);
    const status = e.isInstrumentDeclined ? 422 : e.status >= 400 && e.status < 600 ? e.status : 502;
    console.error(`[paypal] ${e.status} ${e.name_} debug_id=${e.debugId} ${e.message}`);
    res.status(status).json({ ...e.toJSON(), restart: e.isInstrumentDeclined || undefined });
  });

  return app;
}
