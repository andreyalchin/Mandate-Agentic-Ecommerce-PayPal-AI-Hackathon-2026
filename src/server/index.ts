import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
// Node's built-in fetch ignores HTTPS_PROXY; route it through the proxy when one is set.
if (process.env.HTTPS_PROXY) setGlobalDispatcher(new EnvHttpProxyAgent());
import { createApp } from "./app.js";
import { createClaude, resolveModel } from "../ai/claude.js";
import { createSdkClient, loadConfig, PayPalPayments, PayPalRest } from "../paypal/index.js";
import { MandateService } from "../mandate/service.js";
import { MandateSigner } from "../mandate/signing.js";
import { WalletStore } from "./walletStore.js";
import { AgentKeyStore } from "../mcp/agentKeys.js";
import { attachPersistence, signingKeyPem } from "./persist.js";
import { setWebCatalog } from "./catalog.js";
import { Channel3 } from "../catalog/channel3.js";
import { claudeClassifier } from "../ai/classify.js";

const cfg = loadConfig();
const dataDir = process.env.DATA_DIR ?? "data";
const pay = new PayPalPayments(createSdkClient(cfg));
const wallets = new WalletStore(); const agentKeys = new AgentKeyStore();
const mandates = new MandateService(pay, wallets, new MandateSigner(signingKeyPem(dataDir)));
attachPersistence(dataDir, mandates, wallets, agentKeys);
const claude = createClaude(); const llm = { client: claude, model: () => resolveModel(claude) };
// Live product discovery through Channel3's MCP server (free tier works without a key).
if (process.env.CHANNEL3 !== "off") setWebCatalog(new Channel3({ apiKey: process.env.CHANNEL3_API_KEY, classify: claudeClassifier(llm.client, llm.model) }));
const app = createApp({
  cfg, pay, wallets, mandates, agentKeys,
  rest: new PayPalRest(cfg),
  llm,
  onEvent: (e) => console.log(`[webhook] ${e.event_type} ${e.resource?.id ?? ""}`),
});
const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`Mandate on ${cfg.publicOrigin} (${cfg.env})`));
