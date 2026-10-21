import { useCallback, useEffect, useMemo, useState } from "react";
import { agentLabel, api, mandateTitle, money, shipLine, type Mandate, type Receipt, type ShipTo } from "./api";
import { Icon, Skeleton, Spinner } from "./ui";

type Details = { orderId: string; status?: string; shipTo?: ShipTo; payer?: { name?: string; email?: string }; capture?: { id: string; status: string; amount?: string; at?: string } };
type Filter = "all" | "paid" | "refunded";

const fullDate = (iso: string) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const monthOf = (iso: string) => new Date(iso).toLocaleDateString([], { month: "long", year: "numeric" });
const title = (r: Receipt) => r.lines.map((l) => `${l.quantity > 1 ? `${l.quantity} × ` : ""}${l.name}`).join(", ");

function Thumb({ r, size = 44 }: { r: Receipt; size?: number }) {
  const img = r.lines.find((l) => l.image)?.image;
  return <span className="thumb" style={{ width: size, height: size }}>{img ? <img src={img} alt="" loading="lazy" /> : <span className="thumb-initial">{(r.lines[0]?.merchant ?? "?").charAt(0).toUpperCase()}</span>}</span>;
}

function Status({ r }: { r: Receipt }) {
  return r.status === "refunded" ? <span className="chip-s refunded">Refunded</span> : r.status === "pending" ? <span className="chip-s pending">Processing</span> : <span className="chip-s paid">Paid</span>;
}

function Copy({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  return <button className="copy" onClick={() => navigator.clipboard?.writeText(value).then(() => { setOk(true); setTimeout(() => setOk(false), 1400); })} aria-label={`Copy ${value}`}>{ok ? Icon.check(13) : <span>Copy</span>}</button>;
}

type MandateLite = { id: string; title: string; status: string };
const PALETTE = ["#1d4f3f", "#9a5a07", "#2f5d8a", "#7a3e8f", "#a3402f", "#3d6b2a", "#5b5f66", "#8a6d1f"];
const hue = (name: string) => PALETTE[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
export function AgentAvatar({ name, size = 22 }: { name: string; size?: number }) {
  const c = hue(name);
  return <span className="agav" style={{ width: size, height: size, color: c, background: `${c}1a`, fontSize: size * 0.42 }} aria-hidden>{initials(name)}</span>;
}

function OrderDetail({ r, mandate, sample, onClose, onUndo }: { r: Receipt; mandate?: MandateLite; sample: boolean; onClose: () => void; onUndo: () => Promise<void> }) {
  const [d, setD] = useState<Details | null>(null); const [err, setErr] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => {
    setD(null); setErr(false);
    if (sample) { setD({ orderId: r.orderId, status: r.status === "refunded" ? "REFUNDED" : "COMPLETED", shipTo: r.shipTo, payer: { name: `${r.shipTo?.name ?? "Sample buyer"} (sample)` }, capture: { id: r.captureId ?? "", status: r.status === "refunded" ? "REFUNDED" : "COMPLETED" } }); return; }
    api<Details>(`/api/receipts/${r.id}/details`).then(setD).catch(() => setErr(true));
  }, [r.id, r.status, sample]);
  const ship = d?.shipTo ?? r.shipTo;
  const approved = r.allowedBy.startsWith("approval:");
  return (
    <article className="order-detail card" aria-label="Order details">
      <header className="od-head">
        <button className="btn ghost xs od-close" onClick={onClose} aria-label="Close details">← Orders</button>
        <div className="row"><button className="btn sm" onClick={() => print()}>{Icon.printer(15)} Print receipt</button></div>
      </header>
      <div className="od-hero">
        <Status r={r} />
        <p className="od-amount num">{money(r.totalCents)}</p>
        <p className="od-title">{title(r)}</p>
        <p className="sm muted">{fullDate(r.at)}{r.refundedAt ? ` · refunded ${fullDate(r.refundedAt)}` : ""}</p>
        <p className="od-by"><AgentAvatar name={agentLabel(r.agentId)} size={24} /> Bought by <b>{agentLabel(r.agentId)}</b></p>
      </div>

      <section className="od-sec">
        <h3>{Icon.store(15)} Items</h3>
        <ul className="od-items">{r.lines.map((l) => (
          <li key={l.sku}>
            <span className="thumb sm">{l.image ? <img src={l.image} alt="" /> : <span className="thumb-initial">{l.merchant.charAt(0).toUpperCase()}</span>}</span>
            <span className="od-item"><b>{l.name}</b><span className="xs muted">{l.quantity} × ${Number(l.unitAmount).toFixed(2)} · sold by {l.url ? <a href={l.url} target="_blank" rel="noreferrer">{l.merchant}</a> : l.merchant}</span></span>
            <span className="num od-line">${(Number(l.unitAmount) * l.quantity).toFixed(2)}</span>
          </li>))}
        </ul>
        <div className="od-total"><span>Total paid with PayPal</span><b className="num">{money(r.totalCents)}</b></div>
      </section>

      <section className="od-sec">
        <h3>{Icon.truck(15)} Delivery</h3>
        {ship ? <div className="od-addr"><b>{ship.name}</b><span>{ship.line1}</span><span>{[ship.city, ship.region].filter(Boolean).join(", ")} {ship.postalCode}</span><span>{ship.country === "US" ? "United States" : ship.country}</span></div>
          : d || err ? <p className="sm muted">Ships to the address on your PayPal account.</p> : <Skeleton lines={2} />}
        <p className="xs muted od-note">{sample ? "Sample order: a made-up household address. Nothing ships." : "Address from your PayPal account, as recorded on the PayPal order. Sandbox order, so nothing actually ships."}</p>
      </section>

      <section className="od-sec">
        <h3>{Icon.receipt(15)} PayPal receipt</h3>
        <dl className="od-dl">
          <div><dt>Order ID</dt><dd><code>{r.orderId}</code><Copy value={r.orderId} /></dd></div>
          {(d?.capture?.id ?? r.captureId) && <div><dt>Capture ID</dt><dd><code>{d?.capture?.id ?? r.captureId}</code><Copy value={(d?.capture?.id ?? r.captureId)!} /></dd></div>}
          <div><dt>PayPal status</dt><dd>{d ? (d.capture?.status ?? d.status ?? "—").replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : err ? "Unavailable" : <Spinner />}</dd></div>
          {d?.payer?.name && <div><dt>Paid by</dt><dd>{d.payer.name}{d.payer.email ? <span className="muted od-email">{d.payer.email}</span> : null}</dd></div>}
        </dl>
      </section>

      <section className="od-sec">
        <h3>{Icon.shield(15)} Why it was allowed</h3>
        <dl className="od-dl">
          <div><dt>Decision</dt><dd>{approved ? "You approved this one purchase" : r.reason}</dd></div>
          <div><dt>Mandate</dt><dd>{mandate ? mandate.title : "—"}{mandate?.status === "revoked" && <span className="muted"> · archived</span>}</dd></div>
          <div><dt>Agent</dt><dd>{agentLabel(r.agentId)}</dd></div>
        </dl>
        {r.rationale && <p className="quote">“{r.rationale}”</p>}
      </section>

      {r.status === "captured" && sample && <footer className="od-foot no-print"><div><b className="sm">Sample order</b><p className="xs muted">On your own orders, Undo refunds the full amount through PayPal and gives the budget back.</p></div></footer>}
      {r.status === "captured" && !sample && <footer className="od-foot no-print">
        <div><b className="sm">Changed your mind?</b><p className="xs muted">Undo refunds the full amount through PayPal and gives the budget back.</p></div>
        <button className="btn sm" disabled={busy} onClick={async () => { setBusy(true); await onUndo(); setBusy(false); }}>{busy ? <Spinner /> : Icon.undo(15)} Undo purchase</button>
      </footer>}
    </article>
  );
}

type Source = "mine" | "sample";
type Period = "all" | "month" | "30" | "90";
const PERIODS: [Period, string][] = [["all", "All time"], ["month", "This month"], ["30", "Last 30 days"], ["90", "Last 90 days"]];
const since = (p: Period) => { const n = new Date(); if (p === "month") return new Date(n.getFullYear(), n.getMonth(), 1).getTime(); if (p === "all") return 0; return n.getTime() - Number(p) * 86400e3; };

export function Orders({ mandates }: { mandates: Mandate[] }) {
  const [mine, setMine] = useState<Receipt[] | null>(null);
  const [sample, setSample] = useState<{ orders: Receipt[]; mandates: MandateLite[] } | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [mid, setMid] = useState("all"); const [agent, setAgent] = useState("all"); const [period, setPeriod] = useState<Period>("all"); const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const load = useCallback(() => api<Receipt[]>("/api/receipts").then((r) => { setMine(r); setSource((s) => s ?? (r.length ? "mine" : "sample")); }).catch(() => { setMine([]); setSource((s) => s ?? "sample"); }), []);
  useEffect(() => { load(); api<{ orders: Receipt[]; mandates: MandateLite[] }>("/api/sample/orders").then(setSample).catch(() => {}); }, [load]);
  const src: Source = source ?? "mine";
  const isSample = src === "sample";
  const all = (isSample ? sample?.orders : mine) ?? null;
  const mlist: MandateLite[] = isSample ? sample?.mandates ?? [] : mandates.map((m) => ({ id: m.id, title: mandateTitle(m), status: m.status }));
  const byId = useMemo(() => new Map(mlist.map((m) => [m.id, m])), [mlist]);
  function switchSource(s: Source) { setSource(s); setMid("all"); setAgent("all"); setFilter("all"); setQ(""); setSel(null); }

  // Filters apply in order; each control's counts reflect the others, so numbers never contradict the list.
  const t0 = since(period); const needle = q.trim().toLowerCase();
  const base = (all ?? []).filter((r) => new Date(r.at).getTime() >= t0 && (mid === "all" || r.mandateId === mid)
    && (!needle || title(r).toLowerCase().includes(needle) || (r.lines[0]?.merchant ?? "").toLowerCase().includes(needle) || agentLabel(r.agentId).toLowerCase().includes(needle)));
  const statusOk = (r: Receipt) => filter === "all" || (filter === "paid" ? r.status !== "refunded" : r.status === "refunded");
  const agents = useMemo(() => { const m = new Map<string, number>(); for (const r of base.filter(statusOk)) m.set(agentLabel(r.agentId), (m.get(agentLabel(r.agentId)) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [base, filter]);
  const byAgent = base.filter((r) => agent === "all" || agentLabel(r.agentId) === agent);
  const counts = { all: byAgent.length, paid: byAgent.filter((r) => r.status !== "refunded").length, refunded: byAgent.filter((r) => r.status === "refunded").length };
  const shown = byAgent.filter(statusOk);
  const groups = useMemo(() => { const g = new Map<string, Receipt[]>(); for (const r of shown) { const k = monthOf(r.at); g.set(k, [...(g.get(k) ?? []), r]); } return [...g.entries()]; }, [shown]);
  const paid = shown.filter((r) => r.status !== "refunded").reduce((a, r) => a + r.totalCents, 0);
  const refunded = shown.filter((r) => r.status === "refunded").reduce((a, r) => a + r.totalCents, 0);
  const selected = shown.find((r) => r.id === sel) ?? null;
  const filtered = filter !== "all" || mid !== "all" || agent !== "all" || period !== "all" || !!needle;
  useEffect(() => { if ((!sel || !selected) && shown.length && matchMedia("(min-width: 1100px)").matches) setSel(shown[0].id); }, [shown.length, src, selected]);

  function exportCsv() {
    const head = ["Date", "Item", "Shop", "Agent", "Amount", "Status", "Ships to", "Mandate", "PayPal order", "Why allowed"];
    const rows = shown.map((r) => [new Date(r.at).toISOString(), title(r), r.lines[0]?.merchant ?? "", agentLabel(r.agentId), (r.totalCents / 100).toFixed(2), r.status === "refunded" ? "Refunded" : "Paid", shipLine(r.shipTo), byId.get(r.mandateId)?.title ?? "", r.orderId, r.allowedBy.startsWith("approval:") ? "Your approval" : r.reason]);
    const csv = [head, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `mandate-orders-${isSample ? "sample-" : ""}${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }
  const clear = () => { setFilter("all"); setMid("all"); setAgent("all"); setPeriod("all"); setQ(""); };

  return (
    <main className={`orders ${selected ? "has-sel" : ""}`}>
      <div className="page-head">
        <div><h1>Orders</h1><p className="muted sm">{isSample ? "Sample household" : "Your agents"} · what was bought, by which agent, where it ships, and the PayPal receipt.</p></div>
        <div className="row wrap">
          <div className="seg" role="radiogroup" aria-label="Data">
            <button role="radio" aria-checked={!isSample} className={!isSample ? "on" : ""} onClick={() => switchSource("mine")}>Your orders{mine?.length ? ` (${mine.length})` : ""}</button>
            <button role="radio" aria-checked={isSample} className={isSample ? "on" : ""} onClick={() => switchSource("sample")}>Sample</button>
          </div>
          <button className="btn sm" onClick={exportCsv} disabled={!shown.length}>{Icon.download(15)} Export CSV</button>
        </div>
      </div>
      {isSample && <div className="banner">{Icon.sparkle(15)}<span><b>Sample orders.</b> A simulated household with seven agents, decided by the real rules engine. Nothing was charged.{mine?.length ? <> <button className="link" onClick={() => switchSource("mine")}>Back to your orders ({mine.length})</button></> : null}</span></div>}

      <div className="ofilters">
        <div className="ofilters-row">
          <div className="seg" role="tablist" aria-label="Status">{([["all", "All"], ["paid", "Paid"], ["refunded", "Refunded"]] as [Filter, string][]).map(([f, l]) =>
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{l}<span className="seg-n">{counts[f]}</span></button>)}</div>
          <label className="search"><span className="sr">Search orders</span>{Icon.search(15)}<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search item, shop or agent" />{q && <button className="search-x" aria-label="Clear search" onClick={() => setQ("")}>{Icon.x(13)}</button>}</label>
          <label className="select"><span className="sr">Period</span><select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>{PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>{Icon.chevron(14)}</label>
          <label className="select"><span className="sr">Mandate</span>
            <select value={mid} onChange={(e) => setMid(e.target.value)}>
              <option value="all">All mandates</option>
              {mlist.map((m) => <option key={m.id} value={m.id}>{m.title}{m.status === "revoked" ? " (archived)" : ""}</option>)}
            </select>{Icon.chevron(14)}</label>
        </div>
        <div className="achips" role="group" aria-label="Filter by agent">
          <span className="achips-l">Agent</span>
          <button className={`achip ${agent === "all" ? "on" : ""}`} aria-pressed={agent === "all"} onClick={() => setAgent("all")}>All agents</button>
          {agents.map(([name, n]) => <button key={name} className={`achip ${agent === name ? "on" : ""}`} aria-pressed={agent === name} onClick={() => setAgent(agent === name ? "all" : name)}><AgentAvatar name={name} size={20} />{name}<span className="achip-n">{n}</span></button>)}
        </div>
        <div className="ostats"><span><b className="num">{money(paid)}</b> paid</span>{refunded > 0 && <span><b className="num">{money(refunded)}</b> refunded</span>}<span><b className="num">{shown.length}</b> order{shown.length === 1 ? "" : "s"}</span>{filtered && <button className="link" onClick={clear}>Clear filters</button>}</div>
      </div>

      <div className="orders-body">
        <section className="orders-list card" aria-label="Orders">
          {all === null ? <div style={{ padding: 20 }}><Skeleton lines={5} /></div>
            : shown.length === 0 ? <div className="empty"><span className="empty-icon">{Icon.receipt(22)}</span>
                {filtered ? <><p className="empty-title">No orders match</p><p className="muted sm">Try another agent, status or period.</p><button className="btn sm" onClick={clear}>Clear filters</button></>
                  : <><p className="empty-title">No orders yet</p><p className="muted sm">When your agent buys something, the receipt, the shop and the delivery address show up here.</p><div className="row center wrap"><a className="btn sm primary" href="#/">Ask your agent</a><button className="btn sm" onClick={() => switchSource("sample")}>See sample orders</button></div></>}</div>
            : groups.map(([month, list]) => (
              <div key={month} className="og">
                <h2 className="og-head"><span>{month}</span><span className="num">{money(list.filter((r) => r.status !== "refunded").reduce((a, r) => a + r.totalCents, 0))}</span></h2>
                <ul>{list.map((r) => (
                  <li key={r.id}><button className={`orow ${sel === r.id ? "on" : ""} ${r.status}`} onClick={() => setSel(r.id)}>
                    <Thumb r={r} />
                    <span className="orow-text"><b>{title(r)}</b><span className="orow-sub"><span className="orow-agent"><AgentAvatar name={agentLabel(r.agentId)} size={16} />{agentLabel(r.agentId)}</span><span className="orow-where">{r.lines[0]?.merchant} · {new Date(r.at).toLocaleDateString([], { month: "short", day: "numeric" })}</span></span></span>
                    <span className="orow-end"><span className="num orow-amt">{money(r.totalCents)}</span><Status r={r} /></span>
                  </button></li>))}
                </ul>
              </div>))}
        </section>
        {selected && <OrderDetail r={selected} sample={isSample} mandate={byId.get(selected.mandateId)} onClose={() => setSel(null)} onUndo={async () => { await api(`/api/receipts/${selected.id}/undo`, {}); await load(); }} />}
      </div>
    </main>
  );
}
