# PayPal best-practices compliance

Checklist from the official [PayPal AI Toolkit](https://github.com/paypal/AI-Toolkit) `paypal-best-practices` skill and the PayPal v6 sample integration, mapped to code. Judges: every row links to the implementation and its test.

| Practice | Where | Test |
|---|---|---|
| Server-side order creation and pricing; client sends only sku + quantity | `src/server/catalog.ts`, `buildOrderRequest` in `src/paypal/payments.ts` | `routes.test.ts` "prices the cart on the server" |
| Integer-cent math, item breakdown matches total | `buildOrderRequest` | `orders.test.ts` |
| `PayPal-Request-Id` on every POST, stable across retries | `PayPalRest.request`, `PayPalPayments.*` | `rest.test.ts` "retries 429 and 5xx with the same PayPal-Request-Id" |
| OAuth token cached, refreshed before expiry, single-flight | `PayPalRest.accessToken`; Server SDK auto-refresh | `rest.test.ts` |
| Exponential backoff with jitter on 429/5xx, honors `Retry-After` | `PayPalRest.request` | `rest.test.ts` |
| No retry on 4xx business errors | `PayPalError.isRetryable` | `rest.test.ts` |
| `debug_id` logged and returned on every error | `src/paypal/errors.ts`, error handler in `app.ts` | `routes.test.ts` |
| `INSTRUMENT_DECLINED` → ask buyer to restart with another funding source | `isInstrumentDeclined`, 422 + `restart` | `routes.test.ts` |
| Webhook signature verified against the raw body before parsing | `verifyWebhook`, raw route before `express.json()` | `routes.test.ts` webhooks |
| Webhook idempotency (PayPal retries) and fast 200 ack | `WebhookInbox` | `routes.test.ts` "dedupes retries" |
| v6 Web SDK: `clientId` for one-time payments, `clientToken` only for vaulting | `web/src/paypal.ts` | manual sandbox run |
| `findEligibleMethods` before rendering buttons | `web/src/paypal.ts` | manual |
| `session.start()` receives a Promise, not a function; no await before start | `web/src/paypal.ts` | manual |
| Vault ids stay server-side; clients get opaque `walletRef` | `src/server/walletStore.ts` | `routes.test.ts` "never returns the vault id" |
| Negative testing via `PayPal-Mock-Response`, sandbox only | `mockOf()` in `app.ts` | `routes.test.ts` |
| Secrets only in env; `.env.example` committed | `.env.example`, `.gitignore` | — |
| Sandbox MCP server for agent tooling | `.mcp.json` | — |
