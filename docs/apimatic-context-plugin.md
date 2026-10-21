# APIMatic Context Plugin (ContextMatic) in this build

The PayPal integration was checked against the APIMatic Context Plugin MCP server
(`https://chatbotapi.apimatic.io/mcp/plugins`, OAuth). It was used from the build agent
(Perplexity Computer, which drives Claude) through the same MCP tools Claude Code exposes:
`fetch_api` → `ask`, for the `paypal` TypeScript Server SDK.

Raw answers are in [`docs/apimatic/`](apimatic/).

| Question to the plugin | What it said | What changed in Mandate |
| --- | --- | --- |
| Charge a saved PayPal wallet (`vault_id`) with no buyer present, with idempotency and `PAYER_ACTION_REQUIRED` | Create the order with `paymentSource.paypal.vaultId` and a `PayPal-Request-Id`. If the status is `PAYER_ACTION_REQUIRED`, stop and do not capture. | The agent path in `src/mandate/service.ts` already used vaultId and idempotency keys, but it recorded a non-captured order as a "pending" receipt. It now hands the purchase to the person as an approval card when PayPal asks for the payer or declines the saved wallet (`INSTRUMENT_DECLINED`). The agent never retries silently. Tested in `test/mandate-flow.test.ts`. |
| Refund a capture fully, idempotently, and which errors to handle | Use `PaymentsController.refundCapturedPayment` with an empty body and `paypalRequestId`; handle 400/401/403/404/409/422 via `CustomError`. | This matched the existing undo path (`refundCapture`, keyed `refund-<receipt>` so a double click can't double refund). No change was needed. |
| Verify webhook signatures with the Server SDK | The Server SDK has no webhooks controller (Orders, Payments, Vault, Transaction Search, Subscriptions only). | This confirmed the design choice to call `POST /v1/notifications/verify-webhook-signature` over REST (`src/paypal/webhooks.ts`). |

Plugin version note: the plugin's samples pin `@paypal/paypal-server-sdk@2.0.0`. This repo uses 2.5.0. The controller and field names it gave (`createOrder`, `captureOrder`, `refundCapturedPayment`, `paypalRequestId`, `paymentSource.paypal.vaultId`) are unchanged in 2.5.0.
