import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
// Node's built-in fetch ignores HTTPS_PROXY; route it through the proxy when one is set.
if (process.env.HTTPS_PROXY) setGlobalDispatcher(new EnvHttpProxyAgent());
import { createApp } from "./app.js";
import { createClaude, resolveModel } from "../ai/claude.js";
import { createSdkClient, loadConfig, PayPalPayments, PayPalRest } from "../paypal/index.js";

const cfg = loadConfig();
const app = createApp({
  cfg,
  pay: new PayPalPayments(createSdkClient(cfg)),
  rest: new PayPalRest(cfg),
  llm: (() => { const c = createClaude(); return { client: c, model: () => resolveModel(c) }; })(),
  onEvent: (e) => console.log(`[webhook] ${e.event_type} ${e.resource?.id ?? ""}`),
});
const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`PayPal core on ${cfg.publicOrigin} (${cfg.env})`));
