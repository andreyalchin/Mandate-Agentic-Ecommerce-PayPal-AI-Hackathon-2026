// Shop: the products, brands, sizes and stores the agent buys from, and the repeat list it restocks.
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, mandateTitle, money, type Category, type Mandate } from "./api";
import { Icon } from "./ui";
import { Modal } from "./Receipt";
import { PENDING } from "./Dashboard";

type Verdict = { decision: "allow" | "needs_approval" | "deny"; rule: string; reason: string };
type Offer = { store: string; price: string; days: number; stock: boolean; sku: string; verdict?: Verdict };
type Variant = { id: string; brand: string; size: string; pack: string; qty: number; unit: string; name: string; offers: Offer[] };
type Product = { id: string; name: string; category: Category; image: string; blurb: string; every: number; variants: Variant[]; similar?: string[] };
type Store = { name: string; kind: string; blurb: string; days: number; initial: string };
type Catalog = { products: Product[]; stores: Store[]; cadences: number[] };
type Item = { variantId: string; store: string; qty: number; every: number; productId: string; name: string; product: string; brand: string; size: string; pack: string; image: string; category: Category;
  sku: string; storeChosen: string; price: string; days: number; isBest: boolean; bestStore: string; bestPrice: string; monthlyCents: number; verdict: Verdict };
type Shelf = { mandateId: string; suggested: boolean; items: Item[]; monthlyCents: number; budgetMonthlyCents: number | null; cartCents: number; restock: Verdict | null; stores: string[] };
type Tab = "list" | "browse" | "stores";

const CAT: Record<Category, string> = { coffee: "Coffee", kitchen: "Kitchen", household: "Household", books: "Books", electronics: "Electronics", gifts: "Gifts", digital: "Digital" };
const CAT_ICON: Record<Category, (s?: number) => JSX.Element> = { coffee: Icon.coffee, kitchen: Icon.pot, household: Icon.home, books: Icon.book, electronics: Icon.chip, gifts: Icon.gift, digital: Icon.cloud };
const EVERY: Record<number, string> = { 7: "Every week", 14: "Every 2 weeks", 30: "Every month", 60: "Every 2 months", 90: "Every 3 months" };
const V: Record<Verdict["decision"], [string, string]> = { allow: ["Buys it", "ok"], needs_approval: ["Asks you first", "warn"], deny: ["Won't buy", "bad"] };
const usd = (s: string | number) => `$${Number(s).toFixed(2)}`;
const when = (d: number) => (d === 0 ? "Instant" : d === 1 ? "Tomorrow" : `In ${d} days`);
const unitPrice = (price: string, v: Pick<Variant, "qty" | "unit">) => { if (v.qty <= 1 && v.unit !== "L") return ""; const u = Number(price) / v.qty; return `${u < 0.1 ? `${(u * 100).toFixed(1)}¢` : `$${u.toFixed(2)}`}/${v.unit}`; };
const hand = (text: string) => { sessionStorage.setItem(PENDING, text); location.hash = "#/"; };

function VerdictPill({ v, short }: { v?: Verdict; short?: boolean }) {
  if (!v) return null; const [label, tone] = V[v.decision];
  return <span className={`vpill ${tone}`} title={v.reason}>{v.decision === "allow" ? Icon.check(12) : v.decision === "deny" ? Icon.x(12) : Icon.hand(12)}{short && v.decision === "needs_approval" ? "Asks first" : label}</span>;
}
function Stepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return <div className="stepper" role="group" aria-label={label}>
    <button type="button" aria-label="Fewer" disabled={value <= 1} onClick={() => onChange(value - 1)}>−</button>
    <span className="num" aria-live="polite">{value}</span>
    <button type="button" aria-label="More" disabled={value >= 12} onClick={() => onChange(value + 1)}>+</button>
  </div>;
}

export function Shop({ mandates, onPick }: { mandates: Mandate[]; onPick: (id: string) => void }) {
  const active = mandates.filter((m) => m.status === "active");
  const [mid, setMid] = useState<string | null>(() => { const c = localStorage.getItem("mandate.current"); return active.find((m) => m.id === c)?.id ?? active[0]?.id ?? null; });
  const m = active.find((x) => x.id === mid) ?? active[0] ?? null;
  const [cat, setCat] = useState<Catalog | null>(null); const [shelf, setShelf] = useState<Shelf | null>(null);
  const [tab, setTab] = useState<Tab>(m ? "list" : "browse");
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<{ cat: Category | "all"; q: string; store: string | null }>({ cat: "all", q: "", store: null });
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    const [c, s] = await Promise.all([api<Catalog>(`/api/shop/catalog${m ? `?mandateId=${m.id}` : ""}`), m ? api<Shelf>(`/api/mandates/${m.id}/shelf`) : Promise.resolve(null)]);
    setCat(c); setShelf(s);
  }, [m?.id]);
  useEffect(() => { load().catch(() => {}); }, [load]);
  const save = async (items: Pick<Item, "variantId" | "store" | "qty" | "every">[]) => {
    if (!m) return; setSaving(true);
    try { setShelf(await api<Shelf>(`/api/mandates/${m.id}/shelf`, { items: items.map(({ variantId, store, qty, every }) => ({ variantId, store, qty, every })) }, "PUT")); } finally { setSaving(false); }
  };
  const edit = (i: number, patch: Partial<Item>) => shelf && save(shelf.items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const remove = (i: number) => shelf && save(shelf.items.filter((_, j) => j !== i));
  const add = (variantId: string, store: string, qty: number, every: number) => {
    if (!shelf) return; const i = shelf.items.findIndex((x) => x.variantId === variantId);
    save(i >= 0 ? shelf.items.map((x, j) => (j === i ? { ...x, store, qty, every } : x)) : [...shelf.items, { variantId, store, qty, every }]);
  };
  const product = cat?.products.find((p) => p.id === open) ?? null;
  const covered = (c: Category) => !m || m.categories.includes(c);
  const counts = useMemo(() => { const r: Partial<Record<Category, number>> = {}; for (const p of cat?.products ?? []) r[p.category] = (r[p.category] ?? 0) + 1; return r; }, [cat]);
  const shown = (cat?.products ?? []).filter((p) => (filter.cat === "all" || p.category === filter.cat) && (!filter.store || p.variants.some((v) => v.offers.some((o) => o.store === filter.store)))
    && (!filter.q.trim() || `${p.name} ${p.variants.map((v) => `${v.brand} ${v.size} ${v.pack}`).join(" ")}`.toLowerCase().includes(filter.q.trim().toLowerCase())))
    .sort((a, b) => Number(covered(b.category)) - Number(covered(a.category)));
  const pct = shelf?.budgetMonthlyCents ? Math.min(100, (shelf.monthlyCents / shelf.budgetMonthlyCents) * 100) : 0;
  const fits = shelf?.budgetMonthlyCents == null || shelf.monthlyCents <= shelf.budgetMonthlyCents;
  const onList = new Set(shelf?.items.map((x) => x.productId));

  return (
    <main className="shop">
      <header className="shop-head">
        <p className="eyebrow">{Icon.store(13)} Shop</p>
        <h1>What your agent buys</h1>
        <p className="muted">Pick the brands, sizes and stores. Your agent restocks your list on schedule, and your mandate still decides every purchase.</p>
        {active.length > 1 && <label className="shop-pick"><span className="sr">Mandate</span>
          <select value={m?.id} onChange={(e) => { setMid(e.target.value); onPick(e.target.value); }}>{active.map((x) => <option key={x.id} value={x.id}>{mandateTitle(x)}</option>)}</select></label>}
      </header>

      {m && shelf && <section className="card shop-sum" aria-label="Repeat list summary">
        <div className="ss-tile"><span>On repeat</span><b className="num">{shelf.items.length} {shelf.items.length === 1 ? "item" : "items"}</b><em>from {shelf.stores.length} {shelf.stores.length === 1 ? "store" : "stores"}</em></div>
        <div className="ss-tile"><span>About</span><b className="num">{money(shelf.monthlyCents)}<small>/mo</small></b><em>at your chosen stores</em></div>
        <div className="ss-tile ss-budget"><span>Budget</span>
          {shelf.budgetMonthlyCents == null ? <><b className="num">{usd(m.budget.amount)}</b><em>one-time total</em></>
            : <><b className="num">{money(shelf.budgetMonthlyCents)}<small>/mo</small></b>
              <div className="ss-bar" role="img" aria-label={`${Math.round(pct)}% of the monthly budget`}><span className={fits ? "" : "over"} style={{ width: `${pct}%` }} /></div>
              <em className={fits ? "ok" : "bad"}>{fits ? `${money(shelf.budgetMonthlyCents - shelf.monthlyCents)} left for one-offs` : `${money(shelf.monthlyCents - shelf.budgetMonthlyCents)} over. Your agent will ask first.`}</em></>}
        </div>
        <div className="ss-cta">
          <button className="btn primary" disabled={!shelf.items.length} onClick={() => { onPick(m.id); hand("Restock my repeat list."); }}>{Icon.cart(16)} Restock now</button>
          {shelf.restock && <p className="xs muted">{money(shelf.cartCents)} today · <VerdictPill v={shelf.restock} short /></p>}
        </div>
      </section>}

      <nav className="seg shop-tabs" aria-label="Shop sections">
        {m && <button className={tab === "list" ? "on" : ""} aria-pressed={tab === "list"} onClick={() => setTab("list")}>On repeat{shelf && <span className="count">{shelf.items.length}</span>}</button>}
        <button className={tab === "browse" ? "on" : ""} aria-pressed={tab === "browse"} onClick={() => setTab("browse")}>Products{cat && <span className="count">{cat.products.length}</span>}</button>
        <button className={tab === "stores" ? "on" : ""} aria-pressed={tab === "stores"} onClick={() => setTab("stores")}>Stores{cat && <span className="count">{cat.stores.length}</span>}</button>
      </nav>

      {!m && <section className="card shop-empty"><p><b>No active mandate yet.</b> Browse what the agent can buy, then set the rules it shops under.</p><button className="btn primary sm" onClick={() => { location.hash = "#/"; dispatchEvent(new Event("mandate:new")); }}>{Icon.plus(15)} New mandate</button></section>}

      {tab === "list" && m && shelf && <section className="card shelf" aria-label="On repeat">
        {shelf.suggested && shelf.items.length > 0 && <p className="shelf-note">{Icon.sparkle(14)} Suggested from this mandate's categories. Change anything and it's saved.</p>}
        {shelf.items.length === 0 ? <div className="shelf-zero"><p className="muted">Nothing on repeat yet.</p><button className="btn sm" onClick={() => setTab("browse")}>Browse products</button></div>
          : <ul className="shelf-list">{shelf.items.map((x, i) => {
            const p = cat?.products.find((q) => q.id === x.productId); const v = p?.variants.find((q) => q.id === x.variantId);
            return <li key={x.variantId} className="shelf-row">
              <button className="sr-thumb" onClick={() => setOpen(x.productId)} aria-label={`Change ${x.product}`}><img src={x.image} alt="" loading="lazy" /></button>
              <div className="sr-info">
                <button className="sr-name" onClick={() => setOpen(x.productId)}>{x.product}</button>
                <p className="sm muted">{x.brand} · {x.size} · {x.pack}</p>
                <p className="sr-v"><VerdictPill v={x.verdict} />{x.verdict.decision !== "allow" && <span className="xs muted">{x.verdict.reason}</span>}</p>
              </div>
              <div className="sr-ctl">
                <label className="field-s"><span>Store</span>
                  <select value={x.store === "best" ? "best" : x.storeChosen} onChange={(e) => edit(i, { store: e.target.value })}>
                    <option value="best">Best price, {usd(x.bestPrice)}</option>
                    {v?.offers.filter((o) => o.stock).map((o) => <option key={o.store} value={o.store}>{o.store}, {usd(o.price)}</option>)}
                  </select></label>
                <label className="field-s"><span>How often</span>
                  <select value={x.every} onChange={(e) => edit(i, { every: Number(e.target.value) })}>{(cat?.cadences ?? [7, 14, 30, 60, 90]).map((c) => <option key={c} value={c}>{EVERY[c]}</option>)}</select></label>
                <div className="field-s"><span>Qty</span><Stepper value={x.qty} label={`Quantity of ${x.product}`} onChange={(n) => edit(i, { qty: n })} /></div>
              </div>
              <div className="sr-end">
                <b className="num">{money(x.monthlyCents)}<small>/mo</small></b>
                <span className="xs muted">{usd(x.price)} at {x.storeChosen}</span>
                {!x.isBest && <span className="xs sr-save">{usd(Number(x.price) - Number(x.bestPrice))} more than {x.bestStore}</span>}
                <button className="icon-btn sm" aria-label={`Remove ${x.product}`} title="Remove" onClick={() => remove(i)}>{Icon.x(14)}</button>
              </div>
            </li>;
          })}</ul>}
        {shelf.items.length > 0 && <Breakdown items={shelf.items} total={shelf.monthlyCents} />}
        {saving && <span className="sr" aria-live="polite">Saving</span>}
      </section>}

      {tab === "browse" && cat && <section className="browse" aria-label="Products">
        <div className="browse-bar">
          <div className="cat-chips" role="group" aria-label="Category">
            <button className={`chip ${filter.cat === "all" ? "on" : ""}`} aria-pressed={filter.cat === "all"} onClick={() => setFilter({ ...filter, cat: "all" })}>All <span>{cat.products.length}</span></button>
            {(Object.keys(CAT) as Category[]).map((c) => <button key={c} className={`chip ${filter.cat === c ? "on" : ""} ${covered(c) ? "" : "off"}`} aria-pressed={filter.cat === c} title={covered(c) ? "" : "Not covered by this mandate"} onClick={() => setFilter({ ...filter, cat: c })}>{CAT_ICON[c](14)} {CAT[c]} <span>{counts[c] ?? 0}</span></button>)}
          </div>
          <label className="browse-q">{Icon.search(15)}<input placeholder="Search products, brands, sizes" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} aria-label="Search products" /></label>
        </div>
        {filter.store && <p className="browse-store sm">Sold at <b>{filter.store}</b> <button className="btn ghost xs" onClick={() => setFilter({ ...filter, store: null })}>{Icon.x(12)} Clear</button></p>}
        {shown.length === 0 ? <p className="card shelf-zero muted">No products match.</p>
          : <ul className="pgrid">{shown.map((p) => <li key={p.id}><ProductCard p={p} covered={covered(p.category)} onList={onList.has(p.id)} hasMandate={!!m} onOpen={() => setOpen(p.id)} /></li>)}</ul>}
      </section>}

      {tab === "stores" && cat && <ul className="sgrid" aria-label="Stores">{cat.stores.map((s) => {
        const items = cat.products.filter((p) => p.variants.some((v) => v.offers.some((o) => o.store === s.name)));
        const cats = [...new Set(items.map((p) => p.category))]; const usable = items.filter((p) => covered(p.category)).length;
        const allowed = !m?.merchants || m.merchants.includes(s.name); const mine = shelf?.items.filter((x) => x.storeChosen === s.name) ?? [];
        return <li key={s.name} className="card store">
          <div className="st-top"><span className="st-logo" aria-hidden>{s.initial}</span><div><h3>{s.name}</h3><p className="xs muted">{s.kind} · {when(s.days).toLowerCase()} delivery</p></div></div>
          <p className="sm muted">{s.blurb}</p>
          <div className="st-cats">{cats.map((c) => <span key={c} className={`tag ${covered(c) ? "" : "off"}`}>{CAT[c]}</span>)}</div>
          <dl className="st-dl"><div><dt>Products</dt><dd className="num">{items.length}</dd></div><div><dt>On your list</dt><dd className="num">{mine.length}</dd></div><div><dt>Monthly</dt><dd className="num">{money(mine.reduce((a, x) => a + x.monthlyCents, 0))}</dd></div></dl>
          <div className="st-foot">
            {m ? (!allowed ? <span className="vpill bad">{Icon.x(12)} Not an allowed shop</span> : usable ? <span className="vpill ok">{Icon.check(12)} {usable} {usable === 1 ? "product" : "products"} in your mandate</span> : <span className="vpill muted">Nothing this mandate covers</span>) : <span />}
            <button className="btn sm" onClick={() => { setFilter({ cat: "all", q: "", store: s.name }); setTab("browse"); }}>See products {Icon.arrowRight(14)}</button>
          </div>
        </li>;
      })}</ul>}

      {product && cat && <ProductSheet key={product.id} p={product} cat={cat} m={m} item={shelf?.items.find((x) => x.productId === product.id)} onClose={() => setOpen(null)} onOpen={setOpen}
        onAdd={(vid, store, qty, every) => { add(vid, store, qty, every); setOpen(null); if (m) setTab("list"); }} />}
    </main>
  );
}

function Breakdown({ items, total }: { items: Item[]; total: number }) {
  const by = (k: (x: Item) => string) => { const r = new Map<string, number>(); for (const x of items) r.set(k(x), (r.get(k(x)) ?? 0) + x.monthlyCents); return [...r].sort((a, b) => b[1] - a[1]); };
  const Col = ({ title, rows }: { title: string; rows: [string, number][] }) => <div className="bd-col"><h3>{title}</h3><ul>{rows.map(([k, c]) => <li key={k}><span>{k}</span><i><b style={{ width: `${total ? (c / total) * 100 : 0}%` }} /></i><span className="num">{money(c)}</span></li>)}</ul></div>;
  return <div className="breakdown"><Col title="Per month by store" rows={by((x) => x.storeChosen)} /><Col title="Per month by category" rows={by((x) => CAT[x.category])} /></div>;
}

function ProductCard({ p, covered, onList, hasMandate, onOpen }: { p: Product; covered: boolean; onList: boolean; hasMandate: boolean; onOpen: () => void }) {
  const offers = p.variants.flatMap((v) => v.offers.filter((o) => o.stock));
  const from = Math.min(...offers.map((o) => Number(o.price))); const brands = new Set(p.variants.map((v) => v.brand)).size; const stores = new Set(offers.map((o) => o.store)).size;
  const opts = new Set(p.variants.map((v) => `${v.size} ${v.pack}`)).size;
  return <button className={`pcard ${covered ? "" : "off"}`} onClick={onOpen}>
    <span className="pc-img"><img src={p.image} alt="" loading="lazy" />{onList && <span className="pc-on">{Icon.check(12)} On your list</span>}</span>
    <span className="pc-body">
      <b>{p.name}</b>
      <span className="xs muted">{brands} {brands === 1 ? "brand" : "brands"} · {opts} {opts === 1 ? "option" : "options"} · {stores} {stores === 1 ? "store" : "stores"}</span>
      <span className="pc-foot"><span className="sm">from <b className="num">{usd(from)}</b></span>{hasMandate && !covered && <span className="xs pc-off">Not in mandate</span>}</span>
    </span>
  </button>;
}

function ProductSheet({ p, cat, m, item, onClose, onOpen, onAdd }: { p: Product; cat: Catalog; m: Mandate | null; item?: Item; onClose: () => void; onOpen: (id: string) => void; onAdd: (variantId: string, store: string, qty: number, every: number) => void }) {
  const start = p.variants.find((v) => v.id === item?.variantId) ?? p.variants[0];
  const [vid, setVid] = useState(start.id); const v = p.variants.find((x) => x.id === vid) ?? start;
  const [store, setStore] = useState<string>(item?.store ?? "best"); const [qty, setQty] = useState(item?.qty ?? 1); const [every, setEvery] = useState(item?.every ?? (p.every || 30));
  const brands = [...new Set(p.variants.map((x) => x.brand))]; const sizes = [...new Set(p.variants.filter((x) => x.brand === v.brand).map((x) => x.size))];
  const packs = p.variants.filter((x) => x.brand === v.brand && x.size === v.size);
  const pick = (f: (x: Variant) => boolean) => { const n = p.variants.find(f); if (n) { setVid(n.id); if (store !== "best" && !n.offers.some((o) => o.store === store && o.stock)) setStore("best"); } };
  const inStock = v.offers.filter((o) => o.stock); const allowedOk = (o: Offer) => !m?.merchants || m.merchants.includes(o.store);
  const best = [...inStock].filter(allowedOk).sort((a, b) => Number(a.price) - Number(b.price))[0] ?? inStock[0]; const fastest = Math.min(...inStock.map((o) => o.days));
  const chosen = store === "best" ? best : v.offers.find((o) => o.store === store) ?? best;
  const covered = !m || m.categories.includes(p.category);
  const similar = (p.similar ?? []).map((id) => cat.products.find((x) => x.id === id)).filter(Boolean) as Product[];
  return <Modal label={p.name} onClose={onClose} className="psheet">
    <header className="ps-head">
      <span className="ps-img"><img src={p.image} alt="" /></span>
      <div className="ps-t"><p className="eyebrow">{CAT[p.category]}</p><h2>{p.name}</h2><p className="sm muted">{p.blurb}</p>{m && !covered && <p className="xs ps-warn">{Icon.x(12)} This mandate doesn't cover {CAT[p.category].toLowerCase()}, so the agent won't buy it.</p>}</div>
      <button className="icon-btn" onClick={onClose} aria-label="Close">{Icon.x(16)}</button>
    </header>
    <div className="ps-opts">
      {brands.length > 1 && <Opt label="Brand" items={brands} on={v.brand} pick={(b) => pick((x) => x.brand === b)} />}
      {(sizes.length > 1 || brands.length > 1) && <Opt label="Size" items={sizes} on={v.size} pick={(s) => pick((x) => x.brand === v.brand && x.size === s)} />}
      <Opt label="Pack" items={packs.map((x) => x.pack)} on={v.pack} pick={(k) => pick((x) => x.brand === v.brand && x.size === v.size && x.pack === k)} />
    </div>
    <div className="ps-offers" role="radiogroup" aria-label="Where to buy">
      <p className="ps-l">Where to buy <span className="xs muted">{v.offers.length} {v.offers.length === 1 ? "store" : "stores"}</span></p>
      {v.offers.map((o) => {
        const on = chosen === o; const isBest = o === best;
        return <button key={o.store} role="radio" aria-checked={on} disabled={!o.stock} className={`offer ${on ? "on" : ""}`} onClick={() => setStore(isBest ? "best" : o.store)}>
          <span className="of-radio" aria-hidden />
          <span className="of-store"><b>{o.store}</b><span className="xs muted">{o.stock ? when(o.days) : "Out of stock"}{unitPrice(o.price, v) && ` · ${unitPrice(o.price, v)}`}</span></span>
          <span className="of-tags">{isBest && o.stock && <span className="tag ok">Best price</span>}{o.stock && o.days === fastest && inStock.length > 1 && <span className="tag">Fastest</span>}{m && o.verdict && <VerdictPill v={o.verdict} short />}</span>
          <b className="of-price num">{usd(o.price)}</b>
        </button>;
      })}
    </div>
    <footer className="ps-foot">
      {m ? <>
        <div className="ps-set">
          <div className="field-s"><span>Qty</span><Stepper value={qty} onChange={setQty} label="Quantity" /></div>
          <label className="field-s"><span>How often</span><select value={every} onChange={(e) => setEvery(Number(e.target.value))}>{cat.cadences.map((c) => <option key={c} value={c}>{EVERY[c]}</option>)}</select></label>
          <p className="ps-est sm"><b className="num">{usd((Number(chosen.price) * qty * 30) / every)}</b><span className="muted">/mo</span></p>
        </div>
        <div className="ps-btns">
          <button className="btn" disabled={!covered || !chosen.stock} onClick={() => hand(`Buy ${qty} × ${v.name} from ${chosen.store} (sku ${chosen.sku}).`)}>Buy once now</button>
          <button className="btn primary" disabled={!covered || !chosen.stock} onClick={() => onAdd(v.id, store, qty, every)}>{Icon.refresh(15)} {item ? "Update list" : "Add to repeat"}</button>
        </div>
      </> : <p className="sm muted ps-nom">Create a mandate to put this on repeat.</p>}
    </footer>
    {similar.length > 0 && <div className="ps-sim"><p className="ps-l">Similar items</p><ul>{similar.map((s) => { const from = Math.min(...s.variants.flatMap((x) => x.offers.filter((o) => o.stock).map((o) => Number(o.price)))); return <li key={s.id}><button onClick={() => onOpen(s.id)}><img src={s.image} alt="" loading="lazy" /><span><b>{s.name}</b><span className="xs muted">from {usd(from)}</span></span></button></li>; })}</ul></div>}
  </Modal>;
}

function Opt({ label, items, on, pick }: { label: string; items: string[]; on: string; pick: (s: string) => void }) {
  return <div className="opt"><span className="ps-l">{label}</span><div className="opt-chips" role="radiogroup" aria-label={label}>{items.map((x) => <button key={x} role="radio" aria-checked={x === on} className={`ochip ${x === on ? "on" : ""}`} onClick={() => pick(x)}>{x}</button>)}</div></div>;
}
