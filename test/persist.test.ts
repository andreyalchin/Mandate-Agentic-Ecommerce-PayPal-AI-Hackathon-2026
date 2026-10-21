import { describe, expect, it } from "vitest";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { MandateService } from "../src/mandate/service.js";
import { MandateSigner } from "../src/mandate/signing.js";
import { WalletStore } from "../src/server/walletStore.js";
import { AgentKeyStore } from "../src/mcp/agentKeys.js";
import { attachPersistence, signingKeyPem } from "../src/server/persist.js";
import { fakePay } from "./helpers.js";

describe("persistence", () => {
  it("restores mandates, wallets and keys, and signatures still verify", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mandate-"));
    const w1 = new WalletStore(); const k1 = new AgentKeyStore();
    const s1 = new MandateService(fakePay(), w1, new MandateSigner(signingKeyPem(dir)));
    const save = attachPersistence(dir, s1, w1, k1, 60_000);
    const w = w1.save("VAULT-1");
    const m = s1.create({ userId: "u1", walletRef: w.walletRef, summary: "Coffee", budget: { amount: "60.00", period: "month" }, approvalAbove: "25.00", categories: ["coffee"], expiresAt: "2027-01-01T00:00:00Z" });
    const { key } = k1.issue(m.id, "Claude");
    await s1.purchase(m.id, "a", [{ sku: "COF-FILTERS-100", name: "Filters", unitAmount: "6.50", quantity: 1, category: "coffee", merchant: "Ridgeline Roasters" }], "out");
    save();
    const w2 = new WalletStore(); const k2 = new AgentKeyStore();
    const s2 = new MandateService(fakePay(), w2, new MandateSigner(signingKeyPem(dir)));
    attachPersistence(dir, s2, w2, k2, 60_000);
    expect(s2.state(m.id)).toMatchObject({ signatureValid: true, spentCents: 650 });
    expect(w2.get(w.walletRef)?.vaultId).toBe("VAULT-1");
    expect(k2.resolve(key)?.mandateId).toBe(m.id);
  });
});
