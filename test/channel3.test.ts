import { describe, expect, it } from "vitest";
import { bestOffer, getWebProduct, ruleCategory, toWebProduct } from "../src/catalog/channel3.js";
import { cartLines, findProducts, setWebCatalog } from "../src/server/catalog.js";
import { evaluate } from "../src/mandate/policy.js";
import type { IntentMandate } from "../src/mandate/types.js";

const offer = (domain: string, price: number, o = {}) => ({ url: `https://buy.example/${domain}`, domain, price: { price, currency: "USD" }, availability: "InStock", condition: "new", ...o });
const grinder = { id: "WBm7cFO", title: "Conical Burr Coffee Grinder", brands: [{ name: "Costway" }], images: [{ url: "https://img/x.png", is_main_image: true }],
  offers: [offer("bestbuy.com", 54.99), offer("walmart.com", 49.99, { availability: "OutOfStock" }), offer("costway.com", 59.99), offer("used.example", 20, { condition: "used" })] };
const mandate: IntentMandate = { id: "m1", userId: "u", walletRef: "w", summary: "Coffee", currency: "USD", budget: { amount: "120.00", period: "month" }, approvalAbove: "60.00", categories: ["coffee"], expiresAt: "2027-01-01T00:00:00Z", createdAt: "2026-10-01T00:00:00Z", status: "active", signature: "x" };

describe("Channel3 web catalog", () => {
  it("assigns categories with rules, not from the agent", () => {
    expect(ruleCategory("Conical Burr Coffee Grinder")).toBe("coffee");
    expect(ruleCategory("Noise cancelling wireless headphones")).toBe("electronics");
    expect(ruleCategory("Lavender candle")).toBeUndefined();
  });
  it("picks the cheapest in-stock, new USD offer", () => {
    expect(bestOffer(grinder.offers as any)?.domain).toBe("bestbuy.com");
  });
  it("registers products server-side so the agent can only send sku + quantity", async () => {
    const p = (await toWebProduct(grinder as any))!;
    expect(p).toMatchObject({ sku: "C3-WBm7cFO", unitAmount: "54.99", merchant: "bestbuy.com", mandateCategory: "coffee", categorySource: "rules", offers: 4 });
    expect(getWebProduct("C3-WBm7cFO")?.unitAmount).toBe("54.99");
    expect(cartLines([{ sku: "C3-WBm7cFO", quantity: 1 }])[0]).toMatchObject({ unitAmount: "54.99", category: "coffee", merchant: "bestbuy.com" });
    expect(() => cartLines([{ sku: "C3-never-seen", quantity: 1 }])).toThrow(/search again/);
  });
  it("unclassifiable products are 'other' and no mandate allows them", async () => {
    const p = (await toWebProduct({ id: "zz", title: "Mystery bundle", offers: [offer("shop.example", 10)] } as any))!;
    expect(p.mandateCategory).toBe("other");
    expect(evaluate(mandate, cartLines([{ sku: p.sku, quantity: 1 }]), [], "a", new Date("2026-10-21T00:00:00Z")).decision).toBe("deny");
  });
  it("uses the classifier only when rules can't decide", async () => {
    const p = (await toWebProduct({ id: "yy", title: "Lavender candle", offers: [offer("shop.example", 12)] } as any, async () => "gifts"))!;
    expect(p).toMatchObject({ mandateCategory: "gifts", categorySource: "classifier" });
  });
  it("search merges demo shops with live results and degrades if Channel3 fails", async () => {
    setWebCatalog({ search: async () => [(await toWebProduct(grinder as any))!] } as any);
    const r = await findProducts("grinder");
    expect(r.products.map((p) => p.source)).toEqual(["demo shop", "Channel3 live price"]);
    setWebCatalog({ search: async () => { throw new Error("timeout"); } } as any);
    expect((await findProducts("grinder")).note).toMatch(/unavailable/);
    setWebCatalog(undefined);
  });
});
