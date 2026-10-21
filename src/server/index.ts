import { createApp } from "./app.js";
import { createSdkClient, loadConfig, PayPalPayments, PayPalRest } from "../paypal/index.js";

const cfg = loadConfig();
const app = createApp({
  cfg,
  pay: new PayPalPayments(createSdkClient(cfg)),
  rest: new PayPalRest(cfg),
  onEvent: (e) => console.log(`[webhook] ${e.event_type} ${e.resource?.id ?? ""}`),
});
const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`PayPal core on ${cfg.publicOrigin} (${cfg.env})`));
