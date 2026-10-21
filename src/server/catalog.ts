import type { LineItem } from "../paypal/index.js";

/** Demo catalog (sandbox only). Prices are looked up server-side; clients send sku + quantity. */
export const CATALOG: Record<string, Omit<LineItem, "quantity">> = {
  "COF-BEANS-1LB": { sku: "COF-BEANS-1LB", name: "Single-origin coffee beans, 1 lb", unitAmount: "18.00", category: "PHYSICAL_GOODS" },
  "COF-FILTERS-100": { sku: "COF-FILTERS-100", name: "Paper filters, 100 pack", unitAmount: "6.50", category: "PHYSICAL_GOODS" },
  "COF-GRINDER": { sku: "COF-GRINDER", name: "Burr grinder", unitAmount: "79.00", category: "PHYSICAL_GOODS" },
  "EBOOK-BREW": { sku: "EBOOK-BREW", name: "Brewing guide (e-book)", unitAmount: "4.99", category: "DIGITAL_GOODS" },
};

export function priceCart(req: { sku: string; quantity: number }[]): LineItem[] {
  return req.map(({ sku, quantity }) => {
    const p = CATALOG[sku];
    if (!p) throw Object.assign(new Error(`unknown sku ${sku}`), { status: 400 });
    return { ...p, quantity };
  });
}
