# PayPal core

Reusable, tested PayPal sandbox integration for the PayPal AI Hackathon entry: TypeScript Server SDK for orders, vault and refunds; a small REST client for v6 client tokens, webhook verification, disputes and reporting; v6 Web SDK harness page; sandbox MCP config.

## Run

```bash
cp .env.example .env   # add sandbox client id + secret
npm install
npm test               # 27 offline tests
npm run smoke          # live sandbox checks, prints PASS/FAIL, never prints secrets
npm run dev            # http://localhost:8787 harness: pay once, save PayPal, charge saved wallet, refund
```

Webhooks: expose the server (e.g. `npx localtunnel --port 8787` or a deploy URL), add `<url>/api/webhooks/paypal` to the sandbox app, and set `PAYPAL_WEBHOOK_ID`.

## Routes

| Route | Purpose |
|---|---|
| `GET /api/config` | env, v6 SDK URL, client id |
| `POST /api/client-token` | browser-safe client token (vault flows) |
| `POST /api/orders` | create order from `{items:[{sku,quantity}]}`; `saveForLater` vaults on success |
| `POST /api/orders/:id/capture` | capture; returns `captureId`, `walletRef` if vaulted |
| `POST /api/vault/setup-token` → `POST /api/vault/payment-token` | save PayPal without purchase; returns `walletRef` |
| `POST /api/orders/vaulted` | buyer-not-present charge to a saved wallet |
| `POST /api/refunds` | full or partial refund |
| `POST /api/webhooks/paypal` | verified, idempotent webhook receiver |

Add `?mock=<PayPal-Mock-Response JSON>` in sandbox to force errors, e.g. `{"mock_application_codes":"INSTRUMENT_DECLINED"}`.

See `docs/PAYPAL_BEST_PRACTICES.md` for the compliance map.
