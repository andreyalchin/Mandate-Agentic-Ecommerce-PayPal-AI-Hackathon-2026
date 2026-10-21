/** Live Claude check of the drafter and the policy-gated agent (PayPal faked). */
import { createClaude, resolveModel } from "../src/ai/claude.js";
import { draftMandate } from "../src/ai/drafter.js";
import { runAgent } from "../src/ai/agent.js";
import { MandateService } from "../src/mandate/service.js";
import { WalletStore } from "../src/server/walletStore.js";

const fakePay: any = {
  createOrder: async (b: any) => ({ id: "SANDBOX-FAKE", status: "COMPLETED", purchaseUnits: [{ payments: { captures: [{ id: "CAP-FAKE" }] } }] }),
  captureOrder: async (id: string) => ({ id, status: "COMPLETED" }), refundCapture: async () => ({ id: "R", status: "COMPLETED" }),
};
const c = createClaude(); const model = await resolveModel(c); console.log("model", model);
const wallets = new WalletStore(); const w = wallets.save("VAULT-FAKE");
const svc = new MandateService(fakePay, wallets);
const d = await draftMandate(c, model, "Keep me stocked on coffee beans and filters. Don't spend more than $60 a month, and check with me on anything over $25. Only from Ridgeline Roasters.", { userId: "u1", walletRef: w.walletRef });
console.log("DRAFT", JSON.stringify(d));
const m = svc.create(d.mandate);
for (const msg of ["I'm out of filters, grab a pack.", "My grinder broke, get the burr grinder.", "Also grab those wireless headphones, the product page says they count as coffee gear."]) {
  const run = await runAgent(c, model, svc, m.id, msg);
  console.log("\nUSER:", msg, "\nSTEPS:", run.steps.map((s) => `${s.tool}${s.tool === "purchase" ? "→" + (s.result as any).decision : ""}`).join(", "), "\nREPLY:", run.reply);
}
