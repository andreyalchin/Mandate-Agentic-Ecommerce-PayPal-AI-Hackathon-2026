import { describe, expect, it } from "vitest";
import { buildOrderRequest } from "../src/paypal/index.js";

describe("buildOrderRequest", () => {
  it("computes totals server-side in integer cents", () => {
    const o: any = buildOrderRequest([{ sku: "A", name: "A", unitAmount: "0.10", quantity: 3 }, { sku: "B", name: "B", unitAmount: "19.99", quantity: 1 }]);
    expect(o.purchaseUnits[0].amount.value).toBe("20.29");
    expect(o.purchaseUnits[0].amount.breakdown.itemTotal.value).toBe("20.29");
    expect(o.intent).toBe("CAPTURE");
  });
  it("uses vault id and no experience context for buyer-not-present charges", () => {
    const o: any = buildOrderRequest([{ sku: "A", name: "A", unitAmount: "5", quantity: 1 }], "USD", { vaultId: "V1" });
    expect(o.paymentSource.paypal).toEqual({ vaultId: "V1" });
  });
  it("requests vault on success when saving during purchase", () => {
    const o: any = buildOrderRequest([{ sku: "A", name: "A", unitAmount: "5", quantity: 1 }], "USD", { storeInVault: true });
    expect(o.paymentSource.paypal.attributes.vault.storeInVault).toBe("ON_SUCCESS");
  });
  it("skips shipping for digital-only carts", () => {
    const o: any = buildOrderRequest([{ sku: "E", name: "E", unitAmount: "4.99", quantity: 1, category: "DIGITAL_GOODS" }]);
    expect(o.paymentSource.paypal.experienceContext.shippingPreference).toBe("NO_SHIPPING");
  });
  it.each([["-1", 1], ["1.999", 1], ["abc", 1], ["5", 0], ["5", 1.5]])("rejects bad amount %s / quantity %s", (unitAmount, quantity) => {
    expect(() => buildOrderRequest([{ sku: "A", name: "A", unitAmount, quantity }])).toThrow();
  });
  it("rejects empty carts", () => expect(() => buildOrderRequest([])).toThrow());
});
