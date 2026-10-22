import { useCallback, useEffect, useMemo, useState } from "react";
import { agentLabel, api, mandateTitle, money, shipLine, type Mandate, type Receipt } from "./api";
import { Icon, Skeleton } from "./ui";
import { AgentAvatar, Modal, ReceiptView, Status, orderTitle as title, type MandateLite } from "./Receipt";

export { AgentAvatar };
type Filter = "all" | "paid" | "refunded";
type How = "any" | "auto" | "you";
const monthOf = (iso: string) => new Date(iso).toLocaleDateString([], { month: "long", year: "numeric" });
const byYou = (r: Receipt) => r.allowedBy.startsWith("approval:");

function Thumb({ r, size = 44 }: { r: Receipt; size?: number }) {
  const img = r.lines.find((l) => l.image)?.image;
  return <span className="thumb" style={{ width: size, height: size }}>{img ? <img src={img} alt="" loading="lazy" /> : <span className="thumb-initial">{(r.lines[0]?.merchant ?? "?").charAt(0).toUpperCase()}</span>}</span>;
}

type Source = "mine" | "sample";
type Period = "all" | "month" | "30" | "90";
const PERIODS: [Period, string][] = [["all", "All time"], ["month", "This month"], ["30", "Last 30 days"], ["90", "Last 90 days"]];
const since = (p: Period) => { const n = new Date(); if (p === "month") return new Date(n.getFullYear(), n.getMonth(), 1).getTime(); if (p === "all") return 0; return n.getTime() - Number(p) * 86400e3; };

export function Orders({ mandates }: { mandates: Mandate[] }) {
  const [mine, setMine] = useState<Receipt[] | null>(null);
  const [sample, setSample] = useState<{ orders: Receipt[]; mandates: MandateLite[] } | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [filter, setFilter] = useState<Filter>("all"); const [how, setHow] = useState<How>("any");
  const [mid, setMid] = useState("all"); const [agent, setAgent] = useState("all"); const [period, setPeriod] = useState<Period>("all"); const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const load = useCallback(() => api<Receipt[]>("/api/receipts").then((r) => { setMine(r); setSource((s) => s ?? (r.length ? "mine" : "sample")); }).catch(() => { setMine([]); setSource((s) => s ?? "sample"); }), []);
  useEffect(() => { load(); api<{ orders: Receipt[]; mandates: MandateLite[] }>("/api/sample/orders").then(setSample).catch(() => {}); }, [load]);
  const src: Source = source ?? "mine";
  const isSample = src === "sample";
  const all = (isSample ? sample?.orders : mine) ?? null;
  const mlist: MandateLite[] = isSample ? sample?.mandates ?? [] : mandates.map((m) => ({ id: m.id, title: mandateTitle(m), status: m.status }));
  const byId = useMemo(() => new Map(mlist.map((m) => [m.id, m])), [mlist]);
  function switchSource(s: Source) { setSource(s); setMid("all"); setAgent("all"); setFilter("all"); setHow("any"); setQ(""); setSel(null); }

  // Filters apply in order; each control's counts reflect the others, so numbers never contradict the list.
  const t0 = since(period); const needle = q.trim().toLowerCase();
  const howOk = (r: Receipt) => how === "any" || (how === "you" ? byYou(r) : !byYou(r));
  const base = (all ?? []).filter((r) => new Date(r.at).getTime() >= t0 && (mid === "all" || r.mandateId === mid) && howOk(r)
    && (!needle || title(r).toLowerCase().includes(needle) || (r.lines[0]?.merchant ?? "").toLowerCase().includes(needle) || agentLabel(r.agentId).toLowerCase().includes(needle)));
  const statusOk = (r: Receipt) => filter === "all" || (filter === "paid" ? r.status !== "refunded" : r.status === "refunded");
  const agents = useMemo(() => { const m = new Map<string, number>(); for (const r of base.filter(statusOk)) m.set(agentLabel(r.agentId), (m.get(agentLabel(r.agentId)) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [base, filter, how]);
  const byAgent = base.filter((r) => agent === "all" || agentLabel(r.agentId) === agent);
  const counts = { all: byAgent.length, paid: byAgent.filter((r) => r.status !== "refunded").length, refunded: byAgent.filter((r) => r.status === "refunded").length };
  const shown = byAgent.filter(statusOk);
  const groups = useMemo(() => { const g = new Map<string, Receipt[]>(); for (const r of shown) { const k = monthOf(r.at); g.set(k, [...(g.get(k) ?? []), r]); } return [...g.entries()]; }, [shown]);
  const paid = shown.filter((r) => r.status !== "refunded").reduce((a, r) => a + r.totalCents, 0);
  const refunded = shown.filter((r) => r.status === "refunded").reduce((a, r) => a + r.totalCents, 0);
  const selected = shown.find((r) => r.id === sel) ?? null;
  const filtered = filter !== "all" || how !== "any" || mid !== "all" || agent !== "all" || period !== "all" || !!needle;

  function exportCsv() {
    const head = ["Date", "Item", "Shop", "Agent", "Amount", "Status", "Ships to", "Mandate", "PayPal order", "Why allowed"];
    const rows = shown.map((r) => [new Date(r.at).toISOString(), title(r), r.lines[0]?.merchant ?? "", agentLabel(r.agentId), (r.totalCents / 100).toFixed(2), r.status === "refunded" ? "Refunded" : "Paid", shipLine(r.shipTo), byId.get(r.mandateId)?.title ?? "", r.orderId, r.allowedBy.startsWith("approval:") ? "Your approval" : r.reason]);
    const csv = [head, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `mandate-orders-${isSample ? "sample-" : ""}${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }
  const clear = () => { setFilter("all"); setHow("any"); setMid("all"); setAgent("all"); setPeriod("all"); setQ(""); };

  return (
    <main className="orders">
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
          <div className="seg" role="radiogroup" aria-label="Approval">{([["any", "Any approval"], ["auto", "Automatic"], ["you", "Approved by you"]] as [How, string][]).map(([h, l]) =>
            <button key={h} role="radio" aria-checked={how === h} className={how === h ? "on" : ""} onClick={() => setHow(h)}>{l}</button>)}</div>
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
        <div className="ostats"><span><b className="num">{money(paid)}</b> paid</span>{refunded > 0 && <span><b className="num">{money(refunded)}</b> refunded</span>}<span><b className="num">{shown.length}</b> order{shown.length === 1 ? "" : "s"}</span>{filtered && <button className="link" onClick={clear}>Clear filters</button>}<a className="link ostats-more" href="#/spending">Declined and blocked attempts are in Spending → Purchase history</a></div>
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
        {selected && <Modal label={`Receipt for ${title(selected)}`} onClose={() => setSel(null)}><ReceiptView key={selected.id} r={selected} sample={isSample} mandate={byId.get(selected.mandateId)} compact onClose={() => setSel(null)} closeLabel={<>{Icon.x(15)} Close</>} onUndo={async () => { await api(`/api/receipts/${selected.id}/undo`, {}); await load(); }} /></Modal>}
      </div>
    </main>
  );
}
