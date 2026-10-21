import type { LineItem } from "../paypal/index.js";
import type { CartLine, Category } from "../mandate/types.js";
import { getWebProduct, type Channel3 } from "../catalog/channel3.js";

type Product = Omit<LineItem, "quantity"> & { category: LineItem["category"]; mandateCategory: Category | "other"; merchant: string };

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

const lookup = (sku: string): Product => {
  const w = sku.startsWith("C3-") ? getWebProduct(sku) : undefined;
  if (w) return { sku: w.sku, name: w.name, unitAmount: w.unitAmount, category: "PHYSICAL_GOODS", mandateCategory: w.mandateCategory, merchant: w.merchant };
  if (sku.startsWith("C3-")) throw Object.assign(new Error(`product ${sku} expired; search again`), { status: 400 });
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

let web: Channel3 | undefined;
/** Enable live product discovery through Channel3 (set at startup; tests leave it off). */
export function setWebCatalog(c?: Channel3) { web = c; }
export const webCatalogEnabled = () => !!web;

/**
 * Agent-facing search: the demo shops plus, when enabled, real products from Channel3 with live
 * prices from the cheapest in-stock retailer. Prices and categories are fixed server-side by sku;
 * the agent only ever sends sku + quantity back.
 */
export async function findProducts(q: string, limit = 5) {
  const demo = searchProducts(q).map((p) => ({ ...p, source: "demo shop" }));
  if (!web) return { products: demo };
  try {
    const live = (await web.search(q, limit)).map((p) => ({
      sku: p.sku, name: p.name, brand: p.brand, price: p.unitAmount, category: p.mandateCategory, merchant: p.merchant,
      source: "Channel3 live price", offers: p.offers, priceRange: p.priceRange, image: p.image,
    }));
    return { products: [...demo, ...live], note: "Channel3 items are real products with live prices; checkout runs in PayPal sandbox, so nothing ships." };
  } catch (e) {
    return { products: demo, note: `Live product search unavailable (${(e as Error).message.slice(0, 80)}); showing demo shops only.` };
  }
}
