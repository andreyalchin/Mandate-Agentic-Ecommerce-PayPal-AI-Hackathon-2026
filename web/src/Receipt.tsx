// One receipt, three places: the Orders detail pane, the Spending purchase-history pop-up, and a clean
// one-page printout (Mandate letterhead, items, delivery, PayPal IDs, why it was allowed; no app chrome).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { agentLabel, api, money, type Receipt, type ShipTo } from "./api";
import { Icon, Skeleton, Spinner } from "./ui";

export type Details = { orderId: string; status?: string; shipTo?: ShipTo; payer?: { name?: string; email?: string }; capture?: { id: string; status: string; amount?: string; at?: string } };
export type MandateLite = { id: string; title: string; status: string };

export const fullDate = (iso: string) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
export const orderTitle = (r: Receipt) => r.lines.map((l) => `${l.quantity > 1 ? `${l.quantity} × ` : ""}${l.name}`).join(", ");
const nice = (s?: string) => (s ?? "").replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

const PALETTE = ["#1d4f3f", "#9a5a07", "#2f5d8a", "#7a3e8f", "#a3402f", "#3d6b2a", "#5b5f66", "#8a6d1f"];
const hue = (name: string) => PALETTE[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
export function AgentAvatar({ name, size = 22 }: { name: string; size?: number }) {
  const c = hue(name);
  return <span className="agav" style={{ width: size, height: size, color: c, background: `${c}1a`, fontSize: size * 0.42 }} aria-hidden>{initials(name)}</span>;
}

export function Status({ r }: { r: Receipt }) {
  return r.status === "refunded" ? <span className="chip-s refunded">Refunded</span> : r.status === "pending" ? <span className="chip-s pending">Processing</span> : <span className="chip-s paid">Paid</span>;
}

function Copy({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  return <button className="copy no-print" onClick={() => navigator.clipboard?.writeText(value).then(() => { setOk(true); setTimeout(() => setOk(false), 1400); })} aria-label={`Copy ${value}`}>{ok ? Icon.check(13) : <span>Copy</span>}</button>;
}

export function ItemThumb({ image, merchant, size = 40 }: { image?: string; merchant?: string; size?: number }) {
  return <span className="thumb" style={{ width: size, height: size }}>{image ? <img src={image} alt="" loading="lazy" /> : <span className="thumb-initial">{(merchant ?? "?").charAt(0).toUpperCase()}</span>}</span>;
}

/** PayPal order details for a live receipt; sample receipts are filled in locally. */
export function useDetails(r: Receipt, sample: boolean) {
  const [d, setD] = useState<Details | null>(null); const [err, setErr] = useState(false);
  useEffect(() => {
    setD(null); setErr(false);
    if (sample) { setD({ orderId: r.orderId, status: r.status === "refunded" ? "REFUNDED" : "COMPLETED", shipTo: r.shipTo, payer: { name: r.shipTo?.name ?? "Sample buyer" }, capture: { id: r.captureId ?? "", status: r.status === "refunded" ? "REFUNDED" : "COMPLETED" } }); return; }
    api<Details>(`/api/receipts/${r.id}/details`).then(setD).catch(() => setErr(true));
  }, [r.id, r.status, sample]);
  return { d, err };
}

/* ---------- Print ---------- */
const LOGO = <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden><rect width="32" height="32" rx="8" fill="#1d4f3f" /><path d="M9 22V10l7 7 7-7v12" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;

function PrintSheet({ r, d, mandate, sample }: { r: Receipt; d: Details | null; mandate?: MandateLite; sample: boolean }) {
  const ship = d?.shipTo ?? r.shipTo; const approved = r.allowedBy.startsWith("approval:"); const agent = agentLabel(r.agentId);
  return createPortal(
    <div className="print-sheet">
      <header className="ps-head">
        <div className="ps-brand">{LOGO}<div><b>Mandate</b><span>Agent payments on PayPal</span></div></div>
        <div className="ps-meta"><b>Receipt</b><span>{fullDate(r.at)}</span><span>Order {r.orderId}</span></div>
      </header>
      <section className="ps-summary">
        <div><span className="ps-k">{r.status === "refunded" ? "Refunded" : "Amount paid"}</span><b className="ps-amt">{money(r.totalCents)}</b><span>{r.status === "refunded" && r.refundedAt ? `Refunded ${fullDate(r.refundedAt)}` : "Paid with PayPal"}</span></div>
        <div><span className="ps-k">Bought by</span><b>{agent}</b><span>{mandate?.title ?? ""}</span></div>
        <div><span className="ps-k">Paid by</span><b>{d?.payer?.name ?? "PayPal account holder"}</b><span>{d?.payer?.email ?? ""}</span></div>
      </section>
      <table className="ps-items">
        <thead><tr><th colSpan={2}>Item</th><th>Shop</th><th className="r">Qty</th><th className="r">Price</th><th className="r">Total</th></tr></thead>
        <tbody>{r.lines.map((l) => <tr key={l.sku}>
          <td className="ps-img">{l.image ? <img src={l.image} alt="" /> : null}</td><td><b>{l.name}</b></td><td>{l.merchant}</td>
          <td className="r">{l.quantity}</td><td className="r">${Number(l.unitAmount).toFixed(2)}</td><td className="r">${(Number(l.unitAmount) * l.quantity).toFixed(2)}</td></tr>)}</tbody>
        <tfoot>
          <tr><td colSpan={5}>Total paid with PayPal</td><td className="r"><b>{money(r.totalCents)}</b></td></tr>
          {r.status === "refunded" && <tr><td colSpan={5}>Refunded to your PayPal account</td><td className="r">−{money(r.totalCents)}</td></tr>}
        </tfoot>
      </table>
      <section className="ps-grid">
        <div><h3>Delivery</h3>{ship ? <p><b>{ship.name}</b><br />{ship.line1}<br />{[ship.city, ship.region].filter(Boolean).join(", ")} {ship.postalCode}<br />{ship.country === "US" ? "United States" : ship.country}</p> : <p>Ships to the address on your PayPal account.</p>}</div>
        <div><h3>PayPal</h3><dl><dt>Order ID</dt><dd>{r.orderId}</dd>{(d?.capture?.id || r.captureId) && <><dt>Capture ID</dt><dd>{d?.capture?.id || r.captureId}</dd></>}<dt>Status</dt><dd>{nice(d?.capture?.status ?? d?.status ?? (r.status === "refunded" ? "REFUNDED" : "COMPLETED"))}</dd></dl></div>
        <div><h3>Why it was allowed</h3><p>{approved ? "You approved this one purchase." : r.reason}</p>{r.rationale && <p className="ps-quote">“{r.rationale}”</p>}</div>
      </section>
      <footer className="ps-foot"><span>{sample ? "Sample receipt from a simulated household. Nothing was charged." : "PayPal sandbox receipt. No real money moved."}</span><span>Printed {fullDate(new Date().toISOString())}</span></footer>
    </div>,
    document.body,
  );
}

/** Print only the receipt: mount the print sheet, wait for its images, print, then clean up. */
function usePrint() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return;
    document.body.classList.add("printing-receipt");
    let done = false;
    const end = () => { if (done) return; done = true; document.body.classList.remove("printing-receipt"); setOn(false); };
    const imgs = [...document.querySelectorAll<HTMLImageElement>(".print-sheet img")];
    const ready = Promise.race([Promise.all(imgs.map((i) => (i.complete ? null : new Promise((ok) => { i.onload = i.onerror = ok; })))), new Promise((ok) => setTimeout(ok, 1500))]);
    // Clean up on afterprint; if a browser never fires it, the next tap or key press clears the sheet.
    const later = () => setTimeout(() => { addEventListener("pointerdown", end, { once: true }); addEventListener("keydown", end, { once: true }); }, 300);
    ready.then(() => { addEventListener("afterprint", end, { once: true }); print(); later(); });
    return () => { removeEventListener("afterprint", end); removeEventListener("pointerdown", end); removeEventListener("keydown", end); };
  }, [on]);
  return [on, () => setOn(true)] as const;
}

/* ---------- Receipt view ---------- */
export function ReceiptView({ r, mandate, sample, onClose, closeLabel = "← Orders", onUndo, compact }: {
  r: Receipt; mandate?: MandateLite; sample: boolean; onClose?: () => void; closeLabel?: ReactNode; onUndo?: () => Promise<void>; compact?: boolean;
}) {
  const { d, err } = useDetails(r, sample); const [busy, setBusy] = useState(false); const [printing, startPrint] = usePrint();
  const ship = d?.shipTo ?? r.shipTo; const approved = r.allowedBy.startsWith("approval:"); const agent = agentLabel(r.agentId);
  return (
    <article className={`order-detail card ${compact ? "in-modal" : ""}`} aria-label="Receipt">
      <header className="od-head">
        {onClose ? <button className="btn ghost xs od-close" onClick={onClose} aria-label="Close receipt">{closeLabel}</button> : <span />}
        <button className="btn sm" onClick={startPrint}>{Icon.printer(15)} Print receipt</button>
      </header>
      <div className="od-hero">
        <Status r={r} />
        <p className="od-amount num">{money(r.totalCents)}</p>
        <p className="od-title">{orderTitle(r)}</p>
        <p className="sm muted">{fullDate(r.at)}{r.refundedAt ? ` · refunded ${fullDate(r.refundedAt)}` : ""}</p>
        <p className="od-by"><AgentAvatar name={agent} size={24} /> Bought by <b>{agent}</b></p>
      </div>
      <section className="od-sec">
        <h3>{Icon.store(15)} Items</h3>
        <ul className="od-items">{r.lines.map((l) => (
          <li key={l.sku}>
            <ItemThumb image={l.image} merchant={l.merchant} size={48} />
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
          {(d?.capture?.id || r.captureId) && <div><dt>Capture ID</dt><dd><code>{d?.capture?.id || r.captureId}</code><Copy value={(d?.capture?.id || r.captureId)!} /></dd></div>}
          <div><dt>PayPal status</dt><dd>{d ? nice(d.capture?.status ?? d.status) || "—" : err ? "Unavailable" : <Spinner />}</dd></div>
          {d?.payer?.name && <div><dt>Paid by</dt><dd>{d.payer.name}{sample ? " (sample)" : ""}{d.payer.email ? <span className="muted od-email">{d.payer.email}</span> : null}</dd></div>}
        </dl>
      </section>
      <section className="od-sec">
        <h3>{Icon.shield(15)} Why it was allowed</h3>
        <dl className="od-dl">
          <div><dt>Decision</dt><dd>{approved ? "You approved this one purchase" : r.reason}</dd></div>
          <div><dt>Mandate</dt><dd>{mandate ? mandate.title : "—"}{mandate?.status === "revoked" && <span className="muted"> · archived</span>}</dd></div>
          <div><dt>Agent</dt><dd>{agent}</dd></div>
        </dl>
        {r.rationale && <p className="quote">“{r.rationale}”</p>}
      </section>
      {r.status === "captured" && sample && <footer className="od-foot no-print"><div><b className="sm">Sample order</b><p className="xs muted">On your own orders, Undo refunds the full amount through PayPal and gives the budget back.</p></div></footer>}
      {r.status === "captured" && !sample && onUndo && <footer className="od-foot no-print">
        <div><b className="sm">Changed your mind?</b><p className="xs muted">Undo refunds the full amount through PayPal and gives the budget back.</p></div>
        <button className="btn sm" disabled={busy} onClick={async () => { setBusy(true); try { await onUndo(); } finally { setBusy(false); } }}>{busy ? <Spinner /> : Icon.undo(15)} Undo purchase</button>
      </footer>}
      {printing && <PrintSheet r={r} d={d} mandate={mandate} sample={sample} />}
    </article>
  );
}

/* ---------- Attempt pop-up (Spending → Purchase history) ---------- */
export interface AttemptLite { id: string; at: string; source: "Live" | "Simulated"; mandateId: string; mandate: string; agent: string; merchant: string; item: string; amount: number; outcome: string; rule: string; reason: string; rationale: string; image?: string }

let sampleCache: Promise<{ orders: Receipt[]; mandates: MandateLite[] }> | null = null;
const sampleOrders = () => (sampleCache ??= api<{ orders: Receipt[]; mandates: MandateLite[] }>("/api/sample/orders").catch((e) => { sampleCache = null; throw e; }));

const NOT_CHARGED: Record<string, { tone: string; title: string; note: string }> = {
  Blocked: { tone: "bad", title: "Blocked by your rules", note: "No money moved. The attempt is kept so you can see what your agent tried." },
  "Declined by you": { tone: "bad", title: "You declined it", note: "The agent asked first and you said no, so nothing was charged." },
  "Waiting for you": { tone: "warn", title: "Waiting for your OK", note: "Approve or decline it from the Agent tab. Nothing is charged until you approve." },
};

export function AttemptModal({ a, onClose, onChanged }: { a: AttemptLite; onClose: () => void; onChanged?: () => void }) {
  const sample = a.source === "Simulated";
  const [r, setR] = useState<Receipt | null | undefined>(undefined); const [m, setM] = useState<MandateLite | undefined>();
  const box = useRef<HTMLDivElement>(null);
  const load = () => (sample ? sampleOrders().then((s) => { setM(s.mandates.find((x) => x.id === a.mandateId)); return s.orders; }) : api<Receipt[]>("/api/receipts"))
    .then((list) => setR(list.find((x) => x.id === a.id) ?? null)).catch(() => setR(null));
  useEffect(() => { setR(undefined); load(); }, [a.id]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); addEventListener("keydown", k);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; box.current?.focus();
    return () => { removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, []);
  const mandate = m ?? { id: a.mandateId, title: a.mandate, status: "" };
  const nc = NOT_CHARGED[a.outcome];
  return createPortal(
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Receipt for ${a.item}`} tabIndex={-1} ref={box}>
        {r === undefined ? <div className="card" style={{ padding: 24 }}><Skeleton lines={6} /></div>
          : r ? <ReceiptView r={r} sample={sample} mandate={mandate} compact onClose={onClose} closeLabel={<>{Icon.x(15)} Close</>}
              onUndo={sample ? undefined : async () => { await api(`/api/receipts/${r.id}/undo`, {}); await load(); onChanged?.(); }} />
          : <article className="order-detail card in-modal" aria-label="Attempt">
              <header className="od-head"><button className="btn ghost xs od-close" onClick={onClose}>{Icon.x(15)} Close</button><span className="xs muted">Not charged</span></header>
              <div className="od-hero">
                <span className={`chip-s ${nc?.tone ?? "pending"}`}>{a.outcome}</span>
                <p className="od-amount num muted-amt">${a.amount.toFixed(2)}</p>
                <p className="od-title">{a.item}</p>
                <p className="sm muted">{fullDate(a.at)}</p>
                <p className="od-by"><AgentAvatar name={a.agent} size={24} /> Tried by <b>{a.agent}</b></p>
              </div>
              <section className="od-sec">
                <h3>{Icon.store(15)} Item</h3>
                <ul className="od-items"><li><ItemThumb image={a.image} merchant={a.merchant} size={48} /><span className="od-item"><b>{a.item}</b><span className="xs muted">{a.merchant ? `from ${a.merchant}` : "Shop not recorded"}</span></span><span className="num od-line">${a.amount.toFixed(2)}</span></li></ul>
              </section>
              <section className="od-sec">
                <h3>{Icon.shield(15)} {nc?.title ?? "What happened"}</h3>
                <dl className="od-dl">
                  <div><dt>Rule</dt><dd>{a.rule}</dd></div>
                  <div><dt>Reason</dt><dd>{a.reason}</dd></div>
                  <div><dt>Mandate</dt><dd>{a.mandate || "—"}</dd></div>
                </dl>
                {a.rationale && <p className="quote">“{a.rationale}”</p>}
                <p className="xs muted">{nc?.note ?? "Nothing was charged."}</p>
              </section>
            </article>}
      </div>
    </div>,
    document.body,
  );
}
