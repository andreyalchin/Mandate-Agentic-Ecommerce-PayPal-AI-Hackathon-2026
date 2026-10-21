import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Agent, fetch as undiciFetch } from "undici";
import type { Category } from "../mandate/types.js";

// Channel3 is a public endpoint: connect directly, bypassing any dev proxy, unless CHANNEL3_VIA_PROXY
// is set (local dev where the proxy injects the X-API-Key header).
const direct = new Agent();
const directFetch = ((url: any, init: any) => undiciFetch(url, { ...init, dispatcher: direct })) as any;

/** A real product found through Channel3, reduced to what the policy engine and PayPal need. */
export interface WebProduct {
  sku: string; productId: string; name: string; brand?: string; image?: string;
  unitAmount: string; merchant: string; url: string; offers: number; priceRange?: { min: number; max: number };
  mandateCategory: Category | "other"; categorySource: "rules" | "classifier" | "unknown";
}

/**
 * Category is assigned server-side, never by the shopping agent: keyword rules first, then (optionally)
 * an isolated classifier that sees only title and brand. Unknown stays "other", which no mandate allows.
 */
const RULES: [Category, RegExp][] = [
  ["coffee", /\b(coffee|espresso|grinder|burr|beans?|pour[- ]?over|aeropress|french press|moka|chemex|v60|cold brew|filters?)\b/i],
  ["electronics", /\b(headphones?|earbuds?|speaker|tv|television|laptop|tablet|phone|smartwatch|camera|monitor|console|charger|bluetooth)\b/i],
  ["household", /\b(soap|detergent|paper towels?|toilet paper|trash bags?|sponges?|cleaner|bleach|dishwasher|laundry|tissues?)\b/i],
  ["kitchen", /\b(kettle|pan|pot|skillet|knife|cutting board|blender|toaster|mixing bowl|utensils?|cookware|mug)\b/i],
  ["books", /\b(book|novel|paperback|hardcover)\b/i],
];
export function ruleCategory(text: string): Category | undefined {
  for (const [c, re] of RULES) if (re.test(text)) return c;
  return undefined;
}

export type Classify = (title: string, brand?: string) => Promise<Category | "other">;

const TTL = 2 * 3600e3;
const cache = new Map<string, { p: WebProduct; at: number }>();
export function getWebProduct(sku: string): WebProduct | undefined {
  const hit = cache.get(sku); if (!hit) return undefined;
  if (Date.now() - hit.at > TTL) { cache.delete(sku); return undefined; }
  return hit.p;
}
/** For tests and restores. */
export function rememberWebProduct(p: WebProduct) {
  cache.set(p.sku, { p, at: Date.now() });
  if (cache.size > 1000) cache.delete(cache.keys().next().value!);
}

interface C3Offer { url: string; domain: string; price?: { price: number; currency: string }; availability?: string; condition?: string }
interface C3Product { id: string; title: string; brands?: { name: string }[]; images?: { url: string; is_main_image?: boolean }[]; offers?: C3Offer[] }

/** Cheapest in-stock new USD offer. */
export function bestOffer(offers: C3Offer[] = []) {
  const ok = offers.filter((o) => o.price?.currency === "USD" && (o.availability ?? "InStock") === "InStock" && (o.condition ?? "new") === "new");
  return ok.sort((a, b) => a.price!.price - b.price!.price)[0];
}

export async function toWebProduct(p: C3Product, classify?: Classify): Promise<WebProduct | undefined> {
  const o = bestOffer(p.offers); if (!o?.price) return undefined;
  const brand = p.brands?.[0]?.name; const name = p.title.slice(0, 120);
  let cat: WebProduct["mandateCategory"] | undefined = ruleCategory(`${p.title} ${brand ?? ""}`); let src: WebProduct["categorySource"] = cat ? "rules" : "unknown";
  if (!cat && classify) { try { cat = await classify(name, brand); src = "classifier"; } catch { /* stays other */ } }
  const prices = (p.offers ?? []).filter((x) => x.price?.currency === "USD").map((x) => x.price!.price);
  const wp: WebProduct = {
    sku: `C3-${p.id}`, productId: p.id, name, brand, image: (p.images?.find((i) => i.is_main_image) ?? p.images?.[0])?.url,
    unitAmount: o.price.price.toFixed(2), merchant: o.domain, url: o.url, offers: p.offers?.length ?? 0,
    priceRange: prices.length > 1 ? { min: Math.min(...prices), max: Math.max(...prices) } : undefined,
    mandateCategory: cat ?? "other", categorySource: src,
  };
  rememberWebProduct(wp);
  return wp;
}

/**
 * Channel3 product search over its MCP server (free tier needs no key; CHANNEL3_API_KEY is sent when set).
 * One client per process; reconnects after errors.
 */
export class Channel3 {
  private client?: Promise<Client>;
  constructor(private opts: { url?: string; apiKey?: string; classify?: Classify; timeoutMs?: number } = {}) {}
  private connect() {
    if (!this.client) {
      this.client = (async () => {
        const c = new Client({ name: "mandate", version: "0.1.0" });
        const headers: Record<string, string> = this.opts.apiKey ? { "X-API-Key": this.opts.apiKey } : {};
        await c.connect(new StreamableHTTPClientTransport(new URL(this.opts.url ?? "https://mcp.trychannel3.com/"), { requestInit: { headers }, ...(process.env.CHANNEL3_VIA_PROXY ? {} : { fetch: directFetch }) }));
        return c;
      })();
      this.client.catch(() => { this.client = undefined; });
    }
    return this.client;
  }
  async search(query: string, limit = 5): Promise<WebProduct[]> {
    try {
      const c = await this.connect();
      const r: any = await c.callTool({ name: "search_products", arguments: { query } }, undefined, { timeout: this.opts.timeoutMs ?? 20_000 });
      const products: C3Product[] = r?.structuredContent?.products ?? [];
      const out = await Promise.all(products.slice(0, limit * 2).map((p) => toWebProduct(p, this.opts.classify)));
      return out.filter((x): x is WebProduct => !!x).slice(0, limit);
    } catch (e) { this.client = undefined; throw e; }
  }
}
