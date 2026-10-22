// Drill-down: click any number, bar, row or card on the Spending page to see the purchases behind it.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../ui";
import type { AttemptLite } from "../Receipt";

export type DrillWhere = { from?: number; to?: number; category?: string; merchant?: string; mandate?: string; agent?: string; outcomes?: string[]; rule?: string };
export type DrillReq = { title: string; sub?: string; where: DrillWhere };
type Row = AttemptLite & { category?: string; spent?: number };

const usd = (n: number) => `$${n.toFixed(2)}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const TONE: Record<string, string> = { Allowed: "ok", "Approved by you": "ok", Refunded: "muted", "Declined by you": "bad", Blocked: "bad", "Waiting for you": "warn" };
const LABEL: Record<string, string> = { Allowed: "Bought", "Approved by you": "Approved", "Declined by you": "Declined", Blocked: "Blocked", Refunded: "Refunded", "Waiting for you": "Waiting" };
const BOUGHT = new Set(["Allowed", "Approved by you", "Refunded"]);
const ASKED = new Set(["Approved by you", "Declined by you", "Waiting for you"]);

export function matches(a: Row, w: DrillWhere) {
  const t = +new Date(a.at); const low = (s?: string) => (s ?? "").toLowerCase();
  return (w.from === undefined || t >= w.from) && (w.to === undefined || t < w.to)
    && (!w.category || low(a.category) === low(w.category)) && (!w.merchant || low(a.merchant) === low(w.merchant))
    && (!w.mandate || a.mandate === w.mandate) && (!w.agent || a.agent === w.agent) && (!w.rule || a.rule === w.rule)
    && (!w.outcomes || w.outcomes.includes(a.outcome));
}

export function DrillModal({ req, rows, onOpen, onClose, blocked }: { req: DrillReq; rows: Row[]; onOpen: (a: Row) => void; onClose: () => void; blocked: boolean }) {
  const all = useMemo(() => rows.filter((a) => matches(a, req.where)), [rows, req]);
  const [f, setF] = useState<string>("all"); const [sort, setSort] = useState<"new" | "high">("new");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !blocked) onClose(); }; addEventListener("keydown", k);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; box.current?.focus();
    return () => { removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [blocked]);
  const spent = all.filter((a) => BOUGHT.has(a.outcome) && a.outcome !== "Refunded").reduce((s, a) => s + a.amount, 0);
  const bought = all.filter((a) => BOUGHT.has(a.outcome)).length;
  const asked = all.filter((a) => ASKED.has(a.outcome)).length;
  const stopped = all.filter((a) => a.outcome === "Blocked" || a.outcome === "Declined by you");
  const refunded = all.filter((a) => a.outcome === "Refunded");
  const shops = useMemo(() => { const m = new Map<string, number>(); for (const a of all) if (BOUGHT.has(a.outcome) && a.outcome !== "Refunded") m.set(a.merchant || "Other", (m.get(a.merchant || "Other") ?? 0) + a.amount); return [...m].sort((x, y) => y[1] - x[1]).slice(0, 3); }, [all]);
  const outs = [...new Set(all.map((a) => a.outcome))];
  const list = all.filter((a) => f === "all" || a.outcome === f).sort((a, b) => (sort === "high" ? b.amount - a.amount : 0) || +new Date(b.at) - +new Date(a.at));
  const first = all.length ? all.reduce((m, a) => (a.at < m ? a.at : m), all[0].at) : ""; const last = all.length ? all.reduce((m, a) => (a.at > m ? a.at : m), all[0].at) : "";
  return createPortal(
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && !blocked && onClose()}>
      <div className="modal drill card" role="dialog" aria-modal="true" aria-label={req.title} tabIndex={-1} ref={box}>
        <header className="dr-head">
          <div><p className="eyebrow">Details</p><h2>{req.title}</h2><p className="sm muted">{req.sub ? `${req.sub} · ` : ""}{all.length} {all.length === 1 ? "attempt" : "attempts"}{first ? ` · ${day(first)}${first.slice(0, 10) !== last.slice(0, 10) ? ` – ${day(last)}` : ""}` : ""}</p></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close details">{Icon.x(16)}</button>
        </header>
        <div className="dr-tiles">
          <div><span>Spent</span><b className="num">{usd(spent)}</b><em>{bought} purchase{bought === 1 ? "" : "s"}</em></div>
          <div><span>Asked you</span><b className="num">{asked}</b><em>{all.filter((a) => a.outcome === "Approved by you").length} approved · {all.filter((a) => a.outcome === "Declined by you").length} declined</em></div>
          <div><span>Not charged</span><b className="num">{usd(stopped.reduce((s, a) => s + a.amount, 0))}</b><em>{stopped.length} blocked or declined</em></div>
          <div><span>Refunded</span><b className="num">{usd(refunded.reduce((s, a) => s + a.amount, 0))}</b><em>{refunded.length} undone</em></div>
        </div>
        {shops.length > 0 && <p className="dr-shops xs muted">Top shops: {shops.map(([k, v]) => <span key={k}><b>{k}</b> {usd(v)}</span>)}</p>}
        <div className="dr-bar">
          <div className="ph-chips">{["all", ...outs].map((o) => <button key={o} className={`ph-chip ${f === o ? "on" : ""}`} aria-pressed={f === o} onClick={() => setF(o)}>{o === "all" ? "All" : LABEL[o] ?? o}<span>{o === "all" ? all.length : all.filter((a) => a.outcome === o).length}</span></button>)}</div>
          <div className="seg tiny">{(["new", "high"] as const).map((s) => <button key={s} className={sort === s ? "on" : ""} onClick={() => setSort(s)}>{s === "new" ? "Newest" : "Highest"}</button>)}</div>
        </div>
        <ul className="dr-list">
          {list.length === 0 ? <li className="dr-empty sm muted">Nothing here.</li> : list.map((a) => <li key={a.id}>
            <button className="dr-row" onClick={() => onOpen(a)} title="Open receipt">
              <span className="ph-thumb">{a.image ? <img src={a.image} alt="" loading="lazy" /> : <i>{(a.merchant || a.item || "?").charAt(0).toUpperCase()}</i>}</span>
              <span className="ph-item"><b>{a.item}</b><span>{a.agent} · {a.merchant || "—"} · {day(a.at)}</span></span>
              <span className="ph-amt"><b className={`num ${TONE[a.outcome] === "bad" ? "strike" : ""}`}>{usd(a.amount)}</b><span className={`ph-out ${TONE[a.outcome] ?? "muted"}`}>{LABEL[a.outcome] ?? a.outcome}</span></span>
            </button></li>)}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
