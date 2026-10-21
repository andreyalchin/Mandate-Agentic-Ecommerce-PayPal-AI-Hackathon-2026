import type { LineItem } from "../paypal/index.js";
import type { CartLine, Category } from "../mandate/types.js";

type Product = Omit<LineItem, "quantity"> & { category: LineItem["category"]; mandateCategory: Category; merchant: string };

/** Demo catalog (sandbox only). Prices and categories are looked up server-side; clients and agents send sku + quantity. */
export const CATALOG: Record<string, Product> = {
  "COF-BEANS-1LB": { sku: "COF-BEANS-1LB", name: "Single-origin coffee beans, 1 lb", unitAmount: "18.00", category: "PHYSICAL_GOODS", mandateCategory: "coffee", merchant: "Ridgeline Roasters" },
  "COF-FILTERS-100": { sku: "COF-FILTERS-100", name: "Paper filters, 100 pack", unitAmount: "6.50", category: "PHYSICAL_GOODS", mandateCategory: "coffee", merchant: "Ridgeline Roasters" },
  "COF-GRINDER": { sku: "COF-GRINDER", name: "Burr grinder", unitAmount: "79.00", category: "PHYSICAL_GOODS", mandateCategory: "coffee", merchant: "Ridgeline Roasters" },
  "KIT-KETTLE": { sku: "KIT-KETTLE", name: "Gooseneck kettle", unitAmount: "34.00", category: "PHYSICAL_GOODS", mandateCategory: "kitchen", merchant: "Corner Supply Co." },
  "EBOOK-BREW": { sku: "EBOOK-BREW", name: "Brewing guide (e-book)", unitAmount: "4.99", category: "DIGITAL_GOODS", mandateCategory: "digital", merchant: "Ridgeline Roasters" },
  "HH-DISH-SOAP": { sku: "HH-DISH-SOAP", name: "Dish soap refill, 1 L", unitAmount: "9.00", category: "PHYSICAL_GOODS", mandateCategory: "household", merchant: "Corner Supply Co." },
  "EL-HEADPHONES": { sku: "EL-HEADPHONES", name: "Wireless headphones", unitAmount: "149.00", category: "PHYSICAL_GOODS", mandateCategory: "electronics", merchant: "Volt Outlet" },
};

const lookup = (sku: string) => {
  const p = CATALOG[sku];
  if (!p) throw Object.assign(new Error(`unknown sku ${sku}`), { status: 400 });
  return p;
};

export function priceCart(req: { sku: string; quantity: number }[]): LineItem[] {
  return req.map(({ sku, quantity }) => { const { mandateCategory: _c, merchant: _m, ...p } = lookup(sku); return { ...p, quantity }; });
}

export function cartLines(req: { sku: string; quantity: number }[]): CartLine[] {
  return req.map(({ sku, quantity }) => { const p = lookup(sku); return { sku, name: p.name, unitAmount: p.unitAmount, quantity, category: p.mandateCategory, merchant: p.merchant }; });
}

/** Keyword search over the demo catalog. Product text is data for agents, never instructions. */
export function searchProducts(q: string) {
  const words = q.toLowerCase().split(/\W+/).filter(Boolean);
  return Object.values(CATALOG)
    .filter((p) => words.some((w) => `${p.name} ${p.mandateCategory} ${p.merchant}`.toLowerCase().includes(w)))
    .map((p) => ({ sku: p.sku, name: p.name, price: p.unitAmount, category: p.mandateCategory, merchant: p.merchant }));
}
