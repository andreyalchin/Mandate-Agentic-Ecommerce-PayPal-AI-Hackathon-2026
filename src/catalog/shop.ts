import type { Category } from "../mandate/types.js";

/**
 * Sample storefront the agent actually buys from: products with brand / size / pack variants, each
 * sold by several stores at different prices and delivery times. Brands and stores are fictional.
 * Prices are fixed here (server-side); a checkout sku is `SH-<variant>@<store>`, so agents never set prices.
 */
export interface Offer { store: string; price: string; days: number; stock: boolean }
export interface Variant { id: string; brand: string; size: string; pack: string; qty: number; unit: string; offers: Offer[] }
export interface ShopProduct { id: string; name: string; category: Category; image: string; blurb: string; every: number; variants: Variant[]; similar?: string[] }
export interface Store { name: string; kind: string; blurb: string; days: number; initial: string }

export const STORES: Store[] = [
  { name: "Ridgeline Roasters", kind: "Coffee roaster", blurb: "Small-batch beans roasted to order", days: 3, initial: "R" },
  { name: "Corner Supply Co.", kind: "Home & kitchen", blurb: "Everyday home and kitchen basics", days: 2, initial: "C" },
  { name: "Harbor Market", kind: "Grocery", blurb: "Neighborhood grocery, next-day delivery", days: 1, initial: "H" },
  { name: "QuickMart", kind: "Convenience", blurb: "Fast delivery, slightly higher prices", days: 1, initial: "Q" },
  { name: "Parcel & Pantry", kind: "Bulk warehouse", blurb: "Big packs, lowest unit prices, slower shipping", days: 5, initial: "P" },
  { name: "Pageturner Books", kind: "Books & audio", blurb: "Paperbacks, e-books and audiobook credits", days: 2, initial: "B" },
  { name: "Bloom & Co.", kind: "Gifts & flowers", blurb: "Same-day flowers, cards and treats", days: 1, initial: "F" },
  { name: "Volt Outlet", kind: "Electronics", blurb: "Cables, chargers and accessories", days: 2, initial: "V" },
];

const o = (store: string, price: string, days?: number, stock = true): Offer => ({ store, price, days: days ?? STORES.find((s) => s.name === store)!.days, stock });
const v = (id: string, brand: string, size: string, pack: string, qty: number, unit: string, offers: Offer[]): Variant => ({ id, brand, size, pack, qty, unit, offers });

export const PRODUCTS: ShopProduct[] = [
  { id: "coffee-beans", name: "Whole-bean coffee", category: "coffee", image: "/sample/single-origin-coffee-beans-1-lb.webp", blurb: "Roasted beans for the daily pour-over.", every: 30, similar: ["paper-filters", "oat-milk"], variants: [
    v("beans-house-12", "Ridgeline House Blend", "12 oz", "1 bag", 12, "oz", [o("Ridgeline Roasters", "14.00"), o("Harbor Market", "14.50"), o("QuickMart", "15.49")]),
    v("beans-house-16", "Ridgeline House Blend", "1 lb", "1 bag", 16, "oz", [o("Ridgeline Roasters", "18.00"), o("Harbor Market", "18.75"), o("QuickMart", "19.99")]),
    v("beans-house-32", "Ridgeline House Blend", "1 lb", "2 bags", 32, "oz", [o("Ridgeline Roasters", "34.00"), o("Parcel & Pantry", "31.50")]),
    v("beans-summit-32", "Summit Peak Dark Roast", "2 lb", "1 bag", 32, "oz", [o("Harbor Market", "29.00"), o("Parcel & Pantry", "27.40"), o("QuickMart", "31.00")]),
    v("beans-fern-12", "Field & Fern Decaf", "12 oz", "1 bag", 12, "oz", [o("Ridgeline Roasters", "15.00"), o("Harbor Market", "15.50", 1, false)]),
  ] },
  { id: "paper-filters", name: "Paper coffee filters", category: "coffee", image: "/sample/paper-filters-100-pack.webp", blurb: "Cone filters for pour-over brewers.", every: 60, similar: ["coffee-beans"], variants: [
    v("filters-brew-100", "Brewline", "#4 cone", "100 ct", 100, "filter", [o("Ridgeline Roasters", "6.50"), o("QuickMart", "5.99"), o("Corner Supply Co.", "6.25")]),
    v("filters-brew-200", "Brewline", "#4 cone", "200 ct", 200, "filter", [o("Ridgeline Roasters", "11.00"), o("Parcel & Pantry", "9.80")]),
    v("filters-plain-100", "Plainly Unbleached", "#4 cone", "100 ct", 100, "filter", [o("Harbor Market", "7.25"), o("Corner Supply Co.", "7.50")]),
  ] },
  { id: "oat-milk", name: "Oat milk", category: "kitchen", image: "/sample/oat-milk-6-pack.webp", blurb: "Barista oat milk that foams for lattes.", every: 14, similar: ["coffee-beans"], variants: [
    v("oat-barista-6", "Oatfield Barista", "32 oz", "6 pack", 192, "oz", [o("Harbor Market", "19.80"), o("Corner Supply Co.", "21.00"), o("QuickMart", "22.50")]),
    v("oat-barista-12", "Oatfield Barista", "32 oz", "12 pack", 384, "oz", [o("Parcel & Pantry", "35.40"), o("Harbor Market", "37.00")]),
    v("oat-meadow-6", "Meadow Oat Original", "32 oz", "6 pack", 192, "oz", [o("QuickMart", "18.00"), o("Corner Supply Co.", "18.50")]),
  ] },
  { id: "kettle", name: "Gooseneck kettle", category: "kitchen", image: "/sample/gooseneck-kettle.webp", blurb: "Precise pour for pour-over coffee.", every: 0, similar: ["burr-grinder"], variants: [
    v("kettle-stove", "Pourwell", "1 L stovetop", "1 kettle", 1, "item", [o("Corner Supply Co.", "34.00"), o("Harbor Market", "35.50")]),
    v("kettle-electric", "Pourwell", "0.9 L electric", "1 kettle", 1, "item", [o("Corner Supply Co.", "59.00"), o("Volt Outlet", "57.00")]),
  ] },
  { id: "burr-grinder", name: "Burr grinder", category: "coffee", image: "/sample/burr-grinder.webp", blurb: "Even grind size, 40 settings.", every: 0, similar: ["kettle"], variants: [
    v("grinder-ridge", "Ridgeline", "40 settings", "1 grinder", 1, "item", [o("Ridgeline Roasters", "79.00"), o("Volt Outlet", "84.00")]),
  ] },
  { id: "dish-soap", name: "Dish soap", category: "household", image: "/sample/dish-soap-refill-1-l.webp", blurb: "Plant-based refill for the counter bottle.", every: 30, similar: ["paper-towels"], variants: [
    v("soap-clear-1", "Clearbrook", "1 L refill", "1 bottle", 1, "L", [o("Corner Supply Co.", "9.00"), o("Harbor Market", "8.50"), o("QuickMart", "9.49")]),
    v("soap-clear-2", "Clearbrook", "2 L refill", "1 bottle", 2, "L", [o("Corner Supply Co.", "15.50"), o("Parcel & Pantry", "14.20")]),
    v("soap-plain-1", "Plainly Unscented", "1 L refill", "1 bottle", 1, "L", [o("Harbor Market", "7.99")]),
  ] },
  { id: "paper-towels", name: "Paper towels", category: "household", image: "/sample/paper-towels-6-rolls.webp", blurb: "Select-a-size rolls.", every: 30, similar: ["dish-soap", "trash-bags"], variants: [
    v("towels-soft-6", "Softroll", "Select-a-size", "6 rolls", 6, "roll", [o("Corner Supply Co.", "14.00"), o("QuickMart", "13.49")]),
    v("towels-soft-12", "Softroll", "Select-a-size", "12 rolls", 12, "roll", [o("Parcel & Pantry", "24.00"), o("Corner Supply Co.", "26.00")]),
    v("towels-plain-6", "Plainly Recycled", "Full sheet", "6 rolls", 6, "roll", [o("Harbor Market", "12.50")]),
  ] },
  { id: "laundry-pods", name: "Laundry pods", category: "household", image: "/sample/laundry-pods-42-ct.webp", blurb: "Free & clear detergent pods.", every: 60, similar: ["dish-soap"], variants: [
    v("pods-fresh-42", "Fresh Day", "Free & clear", "42 ct", 42, "pod", [o("Corner Supply Co.", "19.00"), o("QuickMart", "18.49"), o("Parcel & Pantry", "17.80")]),
    v("pods-fresh-81", "Fresh Day", "Free & clear", "81 ct", 81, "pod", [o("Parcel & Pantry", "31.00"), o("Corner Supply Co.", "33.00")]),
  ] },
  { id: "trash-bags", name: "Trash bags", category: "household", image: "/sample/trash-bags-50-ct.webp", blurb: "13 gallon drawstring kitchen bags.", every: 60, similar: ["paper-towels"], variants: [
    v("bags-strong-50", "Stronghold", "13 gal", "50 ct", 50, "bag", [o("Corner Supply Co.", "12.00"), o("QuickMart", "11.49")]),
    v("bags-strong-90", "Stronghold", "13 gal", "90 ct", 90, "bag", [o("Parcel & Pantry", "18.90")]),
  ] },
  { id: "novel", name: "Book club pick", category: "books", image: "/sample/paperback-novel.webp", blurb: "This month's book club novel.", every: 30, similar: ["audiobook", "ebook"], variants: [
    v("novel-paper", "Pageturner Picks", "Paperback", "1 book", 1, "book", [o("Pageturner Books", "16.00"), o("Harbor Market", "17.50", 2)]),
    v("novel-hard", "Pageturner Picks", "Hardcover", "1 book", 1, "book", [o("Pageturner Books", "28.00")]),
  ] },
  { id: "audiobook", name: "Audiobook credits", category: "digital", image: "/sample/audiobook-credit.webp", blurb: "One credit = one audiobook, any length.", every: 30, similar: ["novel", "ebook"], variants: [
    v("audio-1", "Listenwell", "Any title", "1 credit", 1, "credit", [o("Pageturner Books", "14.95", 0)]),
    v("audio-3", "Listenwell", "Any title", "3 credits", 3, "credit", [o("Pageturner Books", "39.95", 0)]),
  ] },
  { id: "ebook", name: "E-book", category: "digital", image: "/sample/e-book-field-guide.webp", blurb: "Instant download to your reader.", every: 0, similar: ["novel", "audiobook"], variants: [
    v("ebook-guide", "Field Guides", "Nature guide", "1 e-book", 1, "e-book", [o("Pageturner Books", "9.99", 0)]),
  ] },
  { id: "bouquet", name: "Flower bouquet", category: "gifts", image: "/sample/flower-bouquet.webp", blurb: "Seasonal stems, delivered the same day.", every: 0, similar: ["chocolates", "card"], variants: [
    v("bouquet-s", "Bloom Seasonal", "Small", "1 bouquet", 1, "bouquet", [o("Bloom & Co.", "35.00")]),
    v("bouquet-l", "Bloom Seasonal", "Large", "1 bouquet", 1, "bouquet", [o("Bloom & Co.", "55.00"), o("Harbor Market", "49.00")]),
  ] },
  { id: "chocolates", name: "Chocolate box", category: "gifts", image: "/sample/chocolate-box.webp", blurb: "Assorted truffles in a gift box.", every: 0, similar: ["bouquet", "card"], variants: [
    v("choc-9", "Cocoa Lane", "Assorted", "9 pc", 9, "pc", [o("Bloom & Co.", "18.00"), o("Harbor Market", "17.00")]),
    v("choc-16", "Cocoa Lane", "Assorted", "16 pc", 16, "pc", [o("Bloom & Co.", "29.00"), o("Harbor Market", "28.00")]),
  ] },
  { id: "card", name: "Greeting card", category: "gifts", image: "/sample/greeting-card.webp", blurb: "Blank inside, recycled paper.", every: 0, similar: ["bouquet"], variants: [
    v("card-1", "Paper & Pine", "5 × 7 in", "1 card", 1, "card", [o("Bloom & Co.", "6.00"), o("Pageturner Books", "5.50")]),
    v("card-6", "Paper & Pine", "5 × 7 in", "6 cards", 6, "card", [o("Pageturner Books", "18.00")]),
  ] },
  { id: "candles", name: "Candle set", category: "gifts", image: "/sample/candle-set.webp", blurb: "Soy candles, three scents.", every: 0, similar: ["chocolates"], variants: [
    v("candles-3", "Hearth & Wick", "8 oz each", "3 pack", 3, "candle", [o("Bloom & Co.", "24.00"), o("Corner Supply Co.", "26.00")]),
  ] },
  { id: "usb-c", name: "USB-C cable", category: "electronics", image: "/sample/usb-c-cable-2-m.webp", blurb: "Braided, 100 W charging.", every: 0, similar: ["charger"], variants: [
    v("usbc-1m", "Voltline", "1 m", "1 cable", 1, "cable", [o("Volt Outlet", "9.00"), o("QuickMart", "10.99")]),
    v("usbc-2m", "Voltline", "2 m", "1 cable", 1, "cable", [o("Volt Outlet", "12.00"), o("QuickMart", "13.49")]),
    v("usbc-2m-2", "Voltline", "2 m", "2 pack", 2, "cable", [o("Volt Outlet", "19.00")]),
  ] },
  { id: "charger", name: "Wall charger", category: "electronics", image: "/sample/65-w-charger.webp", blurb: "Compact GaN charger for laptop and phone.", every: 0, similar: ["usb-c"], variants: [
    v("charger-65", "Voltline", "65 W", "1 charger", 1, "item", [o("Volt Outlet", "39.00"), o("QuickMart", "42.00")]),
  ] },
  { id: "mouse", name: "Wireless mouse", category: "electronics", image: "/sample/wireless-mouse.webp", blurb: "Quiet clicks, USB-C rechargeable.", every: 0, similar: ["usb-c"], variants: [
    v("mouse-quiet", "Voltline", "Quiet", "1 mouse", 1, "item", [o("Volt Outlet", "25.00"), o("Corner Supply Co.", "27.00")]),
  ] },
];

const VARIANT = new Map(PRODUCTS.flatMap((p) => p.variants.map((x) => [x.id, { p, v: x }] as const)));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const STORE_BY_SLUG = new Map(STORES.map((s) => [slug(s.name), s.name]));

export const variantName = (p: ShopProduct, x: Variant) => `${x.brand} ${p.name.toLowerCase()}, ${x.size}${x.pack.startsWith("1 ") ? "" : `, ${x.pack}`}`;
export const shopSku = (variantId: string, store: string) => `SH-${variantId}@${slug(store)}`;
export const findVariant = (id: string) => VARIANT.get(id);

/** Resolve a shop sku to its server-side price and store. Throws on unknown or out-of-stock offers. */
export function shopLookup(sku: string) {
  const m = /^SH-([a-z0-9-]+)@([a-z0-9-]+)$/.exec(sku);
  const hit = m && VARIANT.get(m[1]); const store = m && STORE_BY_SLUG.get(m[2]);
  const offer = hit && store ? hit.v.offers.find((x) => x.store === store) : undefined;
  if (!hit || !offer) throw Object.assign(new Error(`unknown sku ${sku}`), { status: 400 });
  if (!offer.stock) throw Object.assign(new Error(`${variantName(hit.p, hit.v)} is out of stock at ${offer.store}`), { status: 409 });
  return { sku, name: variantName(hit.p, hit.v), unitAmount: offer.price, digital: hit.p.category === "digital", mandateCategory: hit.p.category, merchant: offer.store, image: hit.p.image, days: offer.days };
}

/** Cheapest in-stock offer, optionally limited to the stores a mandate allows. */
export function bestOffer(x: Variant, allowed?: string[]) {
  const ok = x.offers.filter((f) => f.stock && (!allowed || allowed.includes(f.store)));
  return (ok.length ? ok : x.offers.filter((f) => f.stock)).sort((a, b) => Number(a.price) - Number(b.price))[0] ?? x.offers[0];
}

/** Keyword search across products, brands, sizes and stores. One row per variant at its best price. */
export function searchShop(q: string) {
  const words = q.toLowerCase().split(/\W+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  return PRODUCTS.flatMap((p) => p.variants.map((x) => ({ p, x })))
    .filter(({ p, x }) => { const t = `${p.name} ${p.category} ${x.brand} ${x.size} ${x.pack} ${x.offers.map((f) => f.store).join(" ")}`.toLowerCase(); return words.some((w) => t.includes(w.replace(/s$/, ""))); })
    .slice(0, 8)
    .map(({ p, x }) => { const b = bestOffer(x); return { sku: shopSku(x.id, b.store), name: variantName(p, x), brand: x.brand, price: b.price, category: p.category, merchant: b.store, deliveryDays: b.days, otherStores: x.offers.filter((f) => f !== b && f.stock).map((f) => ({ sku: shopSku(x.id, f.store), store: f.store, price: f.price, deliveryDays: f.days })) }; });
}

/* ---------- Repeat list ("shelf") per mandate: preferences, not rules. The signed mandate still decides. ---------- */
export const Cadences = [7, 14, 30, 60, 90] as const;
export interface ShelfItem { variantId: string; store: string; qty: number; every: number }

export class ShelfStore {
  private m = new Map<string, ShelfItem[]>();
  get(mandateId: string) { return this.m.get(mandateId); }
  set(mandateId: string, items: ShelfItem[]) { this.m.set(mandateId, items); }
  dump() { return [...this.m.entries()]; }
  restore(rows: [string, ShelfItem[]][]) { for (const [k, x] of rows ?? []) this.m.set(k, x); }
}
export const shelves = new ShelfStore();

const DEFAULTS: Partial<Record<Category, [string, number, number][]>> = {
  coffee: [["beans-house-16", 1, 30], ["filters-brew-100", 1, 60]],
  kitchen: [["oat-barista-6", 1, 14]],
  household: [["soap-clear-1", 1, 30], ["towels-soft-6", 1, 30], ["pods-fresh-42", 1, 60], ["bags-strong-50", 1, 60]],
  books: [["novel-paper", 1, 30]],
  digital: [["audio-1", 1, 30]],
};
/** Sensible repeat items for a mandate's categories, used until the person saves their own list. */
export function suggestedShelf(categories: Category[]): ShelfItem[] {
  return categories.flatMap((c) => DEFAULTS[c] ?? []).map(([variantId, qty, every]) => ({ variantId, store: "best", qty, every }));
}
