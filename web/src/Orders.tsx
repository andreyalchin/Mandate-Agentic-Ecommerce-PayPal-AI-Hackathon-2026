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

function OrderDetail({ r, mandate, onClose, onUndo }: { r: Receipt; mandate?: Mandate; onClose: () => void; onUndo: () => Promise<void> }) {
  const [d, setD] = useState<Details | null>(null); const [err, setErr] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { setD(null); setErr(false); api<Details>(`/api/receipts/${r.id}/details`).then(setD).catch(() => setErr(true)); }, [r.id, r.status]);
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
        <p className="xs muted od-note">Address from your PayPal account, as recorded on the PayPal order. Sandbox order, so nothing actually ships.</p>
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
          <div><dt>Mandate</dt><dd>{mandate ? mandateTitle(mandate) : "—"}{mandate?.status === "revoked" && <span className="muted"> · archived</span>}</dd></div>
          <div><dt>Agent</dt><dd>{agentLabel(r.agentId)}</dd></div>
        </dl>
        {r.rationale && <p className="quote">“{r.rationale}”</p>}
      </section>

      {r.status === "captured" && <footer className="od-foot no-print">
        <div><b className="sm">Changed your mind?</b><p className="xs muted">Undo refunds the full amount through PayPal and gives the budget back.</p></div>
        <button className="btn sm" disabled={busy} onClick={async () => { setBusy(true); await onUndo(); setBusy(false); }}>{busy ? <Spinner /> : Icon.undo(15)} Undo purchase</button>
      </footer>}
    </article>
  );
}

export function Orders({ mandates }: { mandates: Mandate[] }) {
  const [rs, setRs] = useState<Receipt[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [mid, setMid] = useState("all");
  const [sel, setSel] = useState<string | null>(null);
  const load = useCallback(() => api<Receipt[]>("/api/receipts").then(setRs).catch(() => setRs([])), []);
  useEffect(() => { load(); }, [load]);
  const byId = useMemo(() => new Map(mandates.map((m) => [m.id, m])), [mandates]);
  const shown = (rs ?? []).filter((r) => (mid === "all" || r.mandateId === mid) && (filter === "all" || (filter === "paid" ? r.status !== "refunded" : r.status === "refunded")));
  const groups = useMemo(() => { const g = new Map<string, Receipt[]>(); for (const r of shown) { const k = monthOf(r.at); g.set(k, [...(g.get(k) ?? []), r]); } return [...g.entries()]; }, [shown]);
  const paid = shown.filter((r) => r.status !== "refunded").reduce((a, r) => a + r.totalCents, 0);
  const refunded = shown.filter((r) => r.status === "refunded").reduce((a, r) => a + r.totalCents, 0);
  const selected = shown.find((r) => r.id === sel) ?? null;
  useEffect(() => { if (!sel && shown.length && matchMedia("(min-width: 1100px)").matches) setSel(shown[0].id); }, [shown.length]);

  function exportCsv() {
    const head = ["Date", "Item", "Shop", "Amount", "Status", "Ships to", "Mandate", "Agent", "PayPal order", "Why allowed"];
    const rows = shown.map((r) => [new Date(r.at).toISOString(), title(r), r.lines[0]?.merchant ?? "", (r.totalCents / 100).toFixed(2), r.status === "refunded" ? "Refunded" : "Paid", shipLine(r.shipTo), byId.get(r.mandateId) ? mandateTitle(byId.get(r.mandateId)!) : "", agentLabel(r.agentId), r.orderId, r.allowedBy.startsWith("approval:") ? "Your approval" : r.reason]);
    const csv = [head, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `mandate-orders-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }

  return (
    <main className={`orders ${selected ? "has-sel" : ""}`}>
      <div className="page-head">
        <div><h1>Orders</h1><p className="muted sm">What your agents bought, where it ships, and the PayPal receipt for each.</p></div>
        <div className="row wrap">
          <button className="btn sm" onClick={exportCsv} disabled={!shown.length}>{Icon.download(15)} Export CSV</button>
        </div>
      </div>
      <div className="toolbar">
        <div className="seg" role="tablist" aria-label="Status">{(["all", "paid", "refunded"] as Filter[]).map((f) => <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{f === "all" ? "All" : f === "paid" ? "Paid" : "Refunded"}</button>)}</div>
        <label className="select"><span className="sr">Mandate</span>
          <select value={mid} onChange={(e) => setMid(e.target.value)}>
            <option value="all">All mandates</option>
            {mandates.map((m) => <option key={m.id} value={m.id}>{mandateTitle(m)}{m.status === "revoked" ? " (archived)" : ""}</option>)}
          </select>{Icon.chevron(14)}</label>
        <div className="toolbar-stats"><span><b className="num">{money(paid)}</b> paid</span>{refunded > 0 && <span><b className="num">{money(refunded)}</b> refunded</span>}<span><b className="num">{shown.length}</b> orders</span></div>
      </div>
      <div className="orders-body">
        <section className="orders-list card" aria-label="Orders">
          {rs === null ? <div style={{ padding: 20 }}><Skeleton lines={5} /></div>
            : shown.length === 0 ? <div className="empty"><span className="empty-icon">{Icon.receipt(22)}</span><p className="empty-title">No orders yet</p><p className="muted sm">When your agent buys something, the receipt, the shop and the delivery address show up here.</p><a className="btn sm primary" href="#/">Ask your agent</a></div>
            : groups.map(([month, list]) => (
              <div key={month} className="og">
                <h2 className="og-head"><span>{month}</span><span className="num">{money(list.filter((r) => r.status !== "refunded").reduce((a, r) => a + r.totalCents, 0))}</span></h2>
                <ul>{list.map((r) => (
                  <li key={r.id}><button className={`orow ${sel === r.id ? "on" : ""} ${r.status}`} onClick={() => setSel(r.id)}>
                    <Thumb r={r} />
                    <span className="orow-text"><b>{title(r)}</b><span>{r.lines[0]?.merchant} · {new Date(r.at).toLocaleDateString([], { month: "short", day: "numeric" })}{r.shipTo?.city ? ` · ships to ${r.shipTo.city}` : ""}</span></span>
                    <span className="orow-end"><span className="num orow-amt">{money(r.totalCents)}</span><Status r={r} /></span>
                  </button></li>))}
                </ul>
              </div>))}
        </section>
        {selected && <OrderDetail r={selected} mandate={byId.get(selected.mandateId)} onClose={() => setSel(null)} onUndo={async () => { await api(`/api/receipts/${selected.id}/undo`, {}); await load(); }} />}
      </div>
    </main>
  );
}
