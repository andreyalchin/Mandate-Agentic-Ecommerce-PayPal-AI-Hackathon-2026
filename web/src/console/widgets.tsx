// Custom AG Studio widgets for household agent spending. Each reads through AG Studio's data engine
// (widgetApi.getData), so filters, the AI auditor and layout tools all work on them like built-ins.
//  - Spend summary: four headline numbers a person actually asks about.
//  - Spend trend: spending over time with readable dates ("Oct 5"), blocked value alongside.
//  - Breakdown: where the money went, by category or shop.
//  - Mandate meter: spent vs budget per mandate, ask-above threshold marked.
//  - Decision flow: how attempts split into allowed, needed-you and blocked.
//  - Mandate cards: one card per active mandate with its parameters, spend, purchases, approvals and blocks.
//  - Rule list: which mandate rule decided attempts.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createWidgets } from "ag-studio-react";
import { _WIDGET_MENU } from "ag-studio";

/** Read a value from a result row whatever key style the engine used. */
function pick(row: Record<string, any>, field: { id: string; aggregation?: string } | undefined, index: number) {
  if (!field) return undefined;
  const keys = [field.id, field.aggregation ? `${field.aggregation}(${field.id})` : "", field.aggregation ? `${field.id}.${field.aggregation}` : ""].filter(Boolean);
  for (const k of keys) if (k in row) return row[k];
  return Object.values(row)[index];
}

function useRows(props: any, fieldsOf: (dm: any) => any[]) {
  const [rows, setRows] = useState<Record<string, any>[] | null>(null);
  useEffect(() => {
    let live = true; const api = props.widgetApi; const fields = fieldsOf(props.dataMapping ?? {}).filter(Boolean);
    if (fields.length === 0) { api.setDisplayState("incompleteDataMapping"); return; }
    api.setDisplayState("loading", { prominent: rows === null });
    api.getData({ kind: "flat", fields }).then((r: any) => {
      if (!live) return; const rs = r?.results?.rows ?? [];
      setRows(rs); api.setDisplayState(rs.length ? "displayed" : "noData");
    }).catch(() => live && api.setDisplayState("noData"));
    return () => { live = false; };
  }, [props]);
  return rows;
}

/** Rows as plain objects keyed by mapping slot. */
function useMapped(props: any, slots: string[]) {
  const f = (dm: any) => slots.map((s) => dm[s]?.[0]);
  const rows = useRows(props, f);
  if (!rows) return null;
  const fs = f(props.dataMapping ?? {});
  return rows.map((r) => Object.fromEntries(slots.map((s, i) => [s, pick(r, fs[i], i)])));
}

/** Content-box size of an element that may mount after data arrives (pass a value that flips then). */
function useSize<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T>(null); const [s, setS] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(([e]) => setS({ w: e.contentRect.width, h: e.contentRect.height })); ro.observe(el); const r = el.getBoundingClientRect(); setS({ w: r.width, h: r.height }); return () => ro.disconnect(); }, [dep]);
  return [ref, s] as const;
}

const usd = (n: number, cents = true) => `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: cents && Number(n) % 1 ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;
const short = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`);
const num = (n: number) => (Number(n) || 0).toLocaleString("en-US");
const PURCHASED = new Set(["Allowed", "Approved by you"]);
const asDate = (v: any) => (v instanceof Date ? v : new Date(typeof v === "number" ? v : String(v).length <= 10 ? `${v}T12:00:00` : v));

/* ---------- Spend summary ---------- */
/** Ask the page to open a drill-down of the attempts behind a chart element. */
export type DrillWhere = { from?: number; to?: number; category?: string; merchant?: string; mandate?: string; agent?: string; outcomes?: string[]; rule?: string };
const drill = (title: string, where: DrillWhere, sub?: string) => window.dispatchEvent(new CustomEvent("mandate:drill", { detail: { title, sub, where } }));
const PURCHASE_OUTCOMES = ["Allowed", "Approved by you", "Refunded"];
const onKey = (f: () => void) => (e: { key: string; preventDefault(): void }) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); f(); } };

function SpendSummary(props: any) {
  const rows = useMapped(props, ["outcome", "count", "spent", "amount"]);
  if (!rows) return null;
  const by = (o: string) => rows.filter((r) => r.outcome === o);
  const sum = (rs: any[], k: string) => rs.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const spent = sum(rows, "spent"); const purchases = sum(rows.filter((r) => PURCHASED.has(r.outcome)), "count");
  const blocked = by("Blocked"); const approved = sum(by("Approved by you"), "count"); const declined = sum(by("Declined by you"), "count"); const waiting = sum(by("Waiting for you"), "count");
  const refunded = by("Refunded");
  const tiles = [
    { label: "Spent", value: usd(spent), sub: `${num(purchases)} purchase${purchases === 1 ? "" : "s"}${purchases ? ` · avg ${usd(spent / Math.max(1, purchases))}` : ""}`, tone: "ink", outcomes: PURCHASE_OUTCOMES },
    { label: "Stopped by your rules", value: usd(sum(blocked, "amount")), sub: `${num(sum(blocked, "count"))} attempt${sum(blocked, "count") === 1 ? "" : "s"} blocked, no money moved`, tone: "bad", outcomes: ["Blocked"] },
    { label: "Asked for your OK", value: num(approved + declined + waiting), sub: `${num(approved)} approved · ${num(declined)} declined${waiting ? ` · ${num(waiting)} waiting` : ""}`, tone: "warn", outcomes: ["Approved by you", "Declined by you", "Waiting for you"] },
    { label: "Refunded with Undo", value: usd(sum(refunded, "amount")), sub: `${num(sum(refunded, "count"))} purchase${sum(refunded, "count") === 1 ? "" : "s"} undone`, tone: "muted", outcomes: ["Refunded"] },
  ];
  return <div className="w-summary">{tiles.map((t) => { const go = () => drill(t.label, { outcomes: t.outcomes });
    return <div key={t.label} className={`w-tile ${t.tone} drillable`} role="button" tabIndex={0} onClick={go} onKeyDown={onKey(go)} title="See the details"><span className="w-label"><i />{t.label}</span><span className="w-value num">{t.value}</span><span className="w-sub">{t.sub}</span></div>; })}</div>;
}

/* ---------- Spend trend ---------- */
function SpendTrend(props: any) {
  const rows = useMapped(props, ["date", "spent", "blocked"]);
  const [hover, setHover] = useState<number | null>(null);
  const [hRef, { w, h }] = useSize<HTMLDivElement>(rows === null);
  if (!rows) return null;
  const pts = rows.map((r) => ({ d: asDate(r.date), spent: Number(r.spent) || 0, blocked: Number(r.blocked) || 0 })).filter((p) => !isNaN(p.d.getTime())).sort((a, b) => +a.d - +b.d);
  if (!pts.length) return null;
  const span = (+pts.at(-1)!.d - +pts[0].d) / 86400e3;
  const weekly = span > 35;
  const keyOf = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); if (weekly) x.setDate(x.getDate() - x.getDay()); return +x; };
  const bins = new Map<number, { spent: number; blocked: number }>();
  // Fill every bucket in range so gaps show as zero instead of disappearing.
  for (let t = keyOf(pts[0].d); t <= keyOf(pts.at(-1)!.d); t = keyOf(new Date(t + (weekly ? 7 : 1) * 86400e3 + 3600e3))) bins.set(t, { spent: 0, blocked: 0 });
  for (const p of pts) { const b = bins.get(keyOf(p.d)) ?? { spent: 0, blocked: 0 }; b.spent += p.spent; b.blocked += p.blocked; bins.set(keyOf(p.d), b); }
  const data = [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t, ...v }));
  const max = Math.max(1, ...data.map((d) => d.spent + d.blocked));
  const nice = (() => { const p = 10 ** Math.floor(Math.log10(max)); const m = max / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; })();
  const padL = 44, padB = 26, padT = 8; const cw = Math.max(0, w - padL); const ch = Math.max(60, h - padB - padT);
  const bw = cw / data.length; const barW = Math.max(4, Math.min(28, bw * 0.56));
  const y = (v: number) => padT + ch - (v / nice) * ch;
  const label = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const every = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(cw / 64))));
  const total = data.reduce((a, d) => a + d.spent, 0);
  const hv = hover !== null ? data[hover] : null;
  return (
    <div className="w-trend">
      <div className="w-trend-head">
        <div><span className="w-value sm num">{usd(total)}</span><span className="w-sub"> spent · by {weekly ? "week" : "day"}</span></div>
        <div className="w-legend"><span><i className="spent" />Spent</span><span><i className="blocked" />Blocked</span></div>
      </div>
      <div className="w-trend-plot" ref={hRef} onMouseLeave={() => setHover(null)}>
        {w > 0 && <svg width={w} height={h} role="img" aria-label={`Spending by ${weekly ? "week" : "day"}`}>
          {[0, 0.5, 1].map((f) => <g key={f}><line x1={padL} x2={w} y1={y(nice * f)} y2={y(nice * f)} className="grid" /><text x={padL - 10} y={y(nice * f) + 4} textAnchor="end" className="axis">{short(nice * f)}</text></g>)}
          {data.map((d, i) => { const x = padL + i * bw + (bw - barW) / 2; const hs = (d.spent / nice) * ch; const hb = (d.blocked / nice) * ch;
            return <g key={d.t} onMouseEnter={() => setHover(i)} className={hover === i ? "on" : ""}>
              <rect x={padL + i * bw} y={padT} width={bw} height={ch} className="hit" onClick={() => drill(weekly ? `Week of ${label(d.t)}` : label(d.t), { from: d.t, to: d.t + (weekly ? 7 : 1) * 86400e3 }, `${usd(d.spent)} spent${d.blocked ? ` · ${usd(d.blocked)} blocked` : ""}`)} />
              {d.blocked > 0 && <rect x={x} y={y(d.spent + d.blocked)} width={barW} height={Math.max(2, hb)} rx={Math.min(4, barW / 2)} className="bar-blocked" />}
              {d.spent > 0 && <rect x={x} y={y(d.spent)} width={barW} height={Math.max(2, hs)} rx={Math.min(4, barW / 2)} className="bar-spent" />}
              {i % every === 0 && <text x={padL + i * bw + bw / 2} y={h - 6} textAnchor="middle" className="axis">{label(d.t)}</text>}
            </g>; })}
        </svg>}
        {hv && <div className="w-tip" style={{ left: Math.min(Math.max(padL + hover! * bw + bw / 2, 80), w - 80) }}>
          <b>{weekly ? `Week of ${label(hv.t)}` : label(hv.t)}</b><span><i className="spent" />{usd(hv.spent)} spent</span>{hv.blocked > 0 && <span><i className="blocked" />{usd(hv.blocked)} blocked</span>}<em>Click for details</em>
        </div>}
      </div>
    </div>
  );
}

/* ---------- Breakdown ---------- */
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "Other");
function Breakdown(props: any) {
  const rows = useMapped(props, ["category", "shop", "spent"]);
  const [by, setBy] = useState<"category" | "shop">("category");
  if (!rows) return null;
  const m = new Map<string, number>(); const raw = new Map<string, string>();
  for (const r of rows) { const rk = by === "category" ? String(r.category ?? "") : String(r.shop || ""); const k = by === "category" ? cap(rk) : rk || "Other"; raw.set(k, rk); m.set(k, (m.get(k) ?? 0) + (Number(r.spent) || 0)); }
  const list = [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const total = list.reduce((a, [, v]) => a + v, 0);
  const top = list.slice(0, 6); const rest = list.slice(6).reduce((a, [, v]) => a + v, 0);
  if (rest > 0) top.push(["Everything else", rest]);
  return (
    <div className="w-break">
      <div className="seg tiny" role="tablist">{(["category", "shop"] as const).map((k) => <button key={k} role="tab" aria-selected={by === k} className={by === k ? "on" : ""} onClick={() => setBy(k)}>{k === "category" ? "Category" : "Shop"}</button>)}</div>
      {top.length === 0 ? <p className="w-sub">No spending in this view.</p> :
        <ul>{top.map(([k, v], i) => { const go = () => k !== "Everything else" && drill(k, by === "category" ? { category: raw.get(k) ?? k } : { merchant: raw.get(k) ?? k }, `${usd(v)} spent`);
          return <li key={k} className={k !== "Everything else" ? "drillable" : ""} role={k !== "Everything else" ? "button" : undefined} tabIndex={k !== "Everything else" ? 0 : undefined} onClick={go} onKeyDown={onKey(go)}>
          <div className="w-break-top"><span className="w-break-name"><i style={{ background: `var(--c${i})` }} />{k}</span><span className="num"><b>{usd(v)}</b><span className="w-sub"> {Math.round((v / total) * 100)}%</span></span></div>
          <div className="w-bar"><span style={{ width: `${(v / top[0][1]) * 100}%`, background: `var(--c${i})` }} /></div>
        </li>; })}</ul>}
    </div>
  );
}

/* ---------- Mandate meter ---------- */
function MandateMeter(props: any) {
  const rows = useMapped(props, ["mandate", "spent", "budget", "askAbove"]);
  if (!rows) return null;
  if (!rows.length) return <p className="w-sub">No budgets in this view.</p>;
  return (
    <div className="mw-meter" role="list">
      {rows.map((r, i) => {
        const name = String(r.mandate ?? ""); const spent = Number(r.spent ?? 0); const budget = Number(r.budget ?? 0); const ask = Number(r.askAbove ?? 0);
        const pct = budget ? Math.min(100, (spent / budget) * 100) : 0; const over = budget > 0 && spent > budget; const left = Math.max(0, budget - spent);
        const [title] = name.split(" · "); const c2 = (n: number) => `$${n.toFixed(2)}`;
        const state = over ? "over" : pct >= 85 ? "hot" : "ok";
        const go = () => drill(title, { mandate: name, outcomes: PURCHASE_OUTCOMES }, `${usd(spent)} of ${usd(budget)} spent this month`);
        return (
          <div key={i} className={`mw-card ${state} drillable`} role="listitem" tabIndex={0} onClick={go} onKeyDown={onKey(go)} title="See what was bought">
            <div className="mw-top"><span className="mw-name">{title}</span><span className={`mw-left ${state}`}>{over ? `${c2(spent - budget)} over` : `${c2(left)} left`}</span></div>
            <div className="mw-bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${title}: ${Math.round(pct)}% of budget used`}><span className={state} style={{ width: `${Math.max(pct, spent > 0 ? 2 : 0)}%` }} /></div>
            <div className="mw-foot"><span><b className="num">{c2(spent)}</b> spent of {c2(budget)}</span><span className="num">{budget ? Math.round((spent / budget) * 100) : 0}% used</span></div>
            {ask > 0 && <p className="mw-ask">Asks you first above {usd(ask)}</p>}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Decision flow ---------- */
const GROUPS: { key: string; label: string; tone: string; outcomes: string[]; note: string }[] = [
  { key: "allow", label: "Bought on its own", tone: "ok", outcomes: ["Allowed", "Refunded"], note: "inside your rules" },
  { key: "you", label: "Asked you first", tone: "warn", outcomes: ["Approved by you", "Declined by you", "Waiting for you"], note: "over your ask-above or budget" },
  { key: "deny", label: "Blocked", tone: "bad", outcomes: ["Blocked"], note: "outside your rules" },
];
function DecisionFlow(props: any) {
  const rows = useMapped(props, ["outcome", "value"]);
  if (!rows) return null;
  const by = new Map<string, number>(); for (const r of rows) by.set(String(r.outcome), (by.get(String(r.outcome)) ?? 0) + (Number(r.value) || 0));
  const total = [...by.values()].reduce((a, b) => a + b, 0);
  const groups = GROUPS.map((g) => ({ ...g, n: g.outcomes.reduce((a, o) => a + (by.get(o) ?? 0), 0) }));
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const subs = (g: (typeof GROUPS)[number]) => g.outcomes.filter((o) => (by.get(o) ?? 0) > 0 && g.key !== "deny" && o !== "Allowed").map((o) => `${num(by.get(o) ?? 0)} ${o.replace(" by you", "").toLowerCase()}`).join(" · ");
  return (
    <div className="mw-flow">
      <div className="mw-stack" aria-hidden>{groups.map((g) => g.n > 0 && <span key={g.key} className={g.tone} style={{ flexGrow: g.n }} />)}</div>
      <ul className="mw-groups">
        {groups.map((g) => (
          <li key={g.key} className={`mw-group ${g.tone} drillable`} role="button" tabIndex={0} onClick={() => drill(g.label, { outcomes: g.outcomes })} onKeyDown={onKey(() => drill(g.label, { outcomes: g.outcomes }))}>
            <span className="mw-gdot" />
            <span className="mw-gtext"><b>{g.label}</b><span>{subs(g) || g.note}</span></span>
            <span className="mw-gnum"><b className="num">{num(g.n)}</b><span className="num">{pct(g.n)}%</span></span>
          </li>))}
      </ul>
      <p className="w-sub mw-total">{num(total)} agent payment attempts</p>
    </div>
  );
}

/* ---------- Agent cards ---------- */
const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const PERIOD: Record<string, string> = { month: "a month", week: "a week", once: "total" };
const endDate = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
/** One card per active mandate: its signed parameters and what the agent did under it. */
function MandateCards(props: any) {
  const rows = useMapped(props, ["mandate", "outcome", "count", "spent", "amount"]);
  if (!rows) return null;
  type M = { spent: number; bought: number; asked: number; blocked: number; blockedValue: number; total: number; period: string; budget: number; askAbove: number; categories: string; expiresAt: string };
  // Signed parameters come straight from the page's mandate list; the data engine supplies the totals.
  const meta: any[] = ((window as any).__mandateMeta ?? []).filter((m: any) => m.status === "active");
  const ms = new Map<string, M>(meta.map((m) => [m.title, { spent: 0, bought: 0, asked: 0, blocked: 0, blockedValue: 0, total: 0, period: m.period, budget: m.budget, askAbove: m.askAbove, categories: m.categories ?? "", expiresAt: m.expiresAt ?? "" }]));
  for (const r of rows) {
    const a = ms.get(String(r.mandate)); if (!a) continue;
    const c = Number(r.count) || 0; a.spent += Number(r.spent) || 0; a.total += c;
    if (PURCHASED.has(r.outcome)) a.bought += c;
    if (["Approved by you", "Declined by you", "Waiting for you"].includes(r.outcome)) a.asked += c;
    if (r.outcome === "Blocked") { a.blocked += c; a.blockedValue += Number(r.amount) || 0; }
  }
  const list = [...ms.entries()].sort((a, b) => b[1].spent - a[1].spent);
  if (!list.length) return <p className="w-sub w-empty">No active mandates.</p>;
  return (
    <div className="w-agents">
      {list.map(([name, a], i) => (
        <article key={name} className="w-agent w-mandate drillable" tabIndex={0} onClick={(e) => { if (!(e.target as HTMLElement).closest(".w-agent-rm")) drill(name.split(" · ")[0], { mandate: name }); }} onKeyDown={(e) => { if (e.target === e.currentTarget) onKey(() => drill(name.split(" · ")[0], { mandate: name }))(e); }}>
          <header><span className="w-avatar" style={{ background: `var(--c${i % 6}-soft)`, color: `var(--c${i % 6})` }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg></span>
            <span className="w-agent-name"><b>{name.split(" · ")[0]}</b><span>{a.expiresAt ? `Active until ${endDate(a.expiresAt)}` : "Active"}</span></span>
            <button className="w-agent-rm" onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent("mandate:remove-mandate", { detail: { name } })); }} aria-label={`Revoke ${name}`} title="Revoke mandate"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg></button></header>
          <ul className="w-params">
            <li><span>Budget</span><b className="num">{usd(a.budget)} {PERIOD[a.period] ?? ""}</b></li>
            <li><span>Asks first above</span><b className="num">{usd(a.askAbove)}</b></li>
            <li><span>Can buy</span><b>{a.categories || "—"}</b></li>
          </ul>
          <div className="w-agent-big"><span className="w-value num">{usd(a.spent)}</span><span className="w-sub">spent</span></div>
          <dl>
            <div><dt>Bought</dt><dd className="num">{num(a.bought)}</dd></div>
            <div><dt>Asked</dt><dd className="num">{num(a.asked)}</dd></div>
            <div><dt>Blocked</dt><dd className="num">{num(a.blocked)}</dd></div>
          </dl>
          <div className="w-agent-bar" aria-label="Outcome mix"><span className="ok" style={{ flexGrow: a.bought }} /><span className="warn" style={{ flexGrow: a.asked }} /><span className="bad" style={{ flexGrow: a.blocked }} /></div>
          <p className="w-sub">{a.total ? `${Math.round((a.bought / a.total) * 100)}% bought without asking` : "No purchases yet"}{a.blockedValue ? ` · ${usd(a.blockedValue)} stopped` : ""}</p>
        </article>))}
    </div>
  );
}

/* ---------- Rule list ---------- */
const RULE_HELP: Record<string, string> = {
  "Within mandate": "Inside every rule, paid automatically", "Your approval": "You tapped approve", "Over ask-above": "Pricier than your ask-above limit",
  "Over budget": "Would exceed the budget", "Category not allowed": "Not a category you allowed", "Shop not allowed": "Not one of your shops",
  "Over per-purchase max": "Above the hard per-purchase cap", "Mandate expired": "Mandate had expired", "Mandate revoked": "Mandate was revoked", "Agent not allowed": "Agent wasn't allowed",
};
function RuleList(props: any) {
  const rows = useMapped(props, ["rule", "count"]);
  if (!rows) return null;
  const m = new Map<string, number>(); for (const r of rows) m.set(String(r.rule), (m.get(String(r.rule)) ?? 0) + (Number(r.count) || 0));
  const list = [...m.entries()].sort((a, b) => b[1] - a[1]); const max = list[0]?.[1] ?? 1;
  const tone = (r: string) => (r === "Within mandate" ? "ok" : r === "Your approval" || r.startsWith("Over ask") || r === "Over budget" ? "warn" : "bad");
  return (
    <ul className="w-rules">{list.map(([r, n]) => <li key={r} className={`${tone(r)} drillable`} role="button" tabIndex={0} onClick={() => drill(r, { rule: r })} onKeyDown={onKey(() => drill(r, { rule: r }))}>
      <div className="w-rule-top"><span><b>{r}</b><span className="w-sub">{RULE_HELP[r] ?? ""}</span></span><b className="num">{num(n)}</b></div>
      <div className="w-bar"><span style={{ width: `${(n / max) * 100}%` }} /></div>
    </li>)}</ul>
  );
}


/* ---------- Purchase history ---------- */
const PH_SLOTS = ["id", "at", "item", "merchant", "outcome", "amount", "image", "mandate", "mandateId", "rule", "reason", "rationale", "source"];
const PH_FILTERS: [string, string, (o: string) => boolean][] = [
  ["all", "All", () => true], ["bought", "Bought", (o) => o === "Allowed"], ["approved", "Approved by you", (o) => o === "Approved by you"],
  ["declined", "Declined by you", (o) => o === "Declined by you"], ["blocked", "Blocked", (o) => o === "Blocked"], ["refunded", "Refunded", (o) => o === "Refunded"], ["waiting", "Waiting for you", (o) => o === "Waiting for you"],
];
export const PH_PAGE = 10;
const PH_TONE: Record<string, string> = { Allowed: "ok", "Approved by you": "ok", Refunded: "muted", "Declined by you": "bad", Blocked: "bad", "Waiting for you": "warn" };
const PH_LABEL: Record<string, string> = { Allowed: "Bought", "Approved by you": "Approved", "Declined by you": "Declined", Blocked: "Blocked", Refunded: "Refunded", "Waiting for you": "Waiting" };
type PhSort = "new" | "old" | "high" | "low";
function PurchaseHistory(props: any) {
  const rows = useMapped(props, PH_SLOTS);
  const [f, setF] = useState("all"); const [sort, setSort] = useState<PhSort>("new"); const [pg, setPg] = useState(0);
  const [ref, { w }] = useSize<HTMLDivElement>(rows === null);
  if (!rows) return null;
  const list0: any[] = rows.map((r: any) => ({ ...r, amount: Number(r.amount) || 0, t: +new Date(String(r.at)) }));
  const counts = Object.fromEntries(PH_FILTERS.map(([k, , m]) => [k, list0.filter((r) => m(String(r.outcome))).length]));
  const match = PH_FILTERS.find(([k]) => k === f)?.[2] ?? (() => true);
  const list = list0.filter((r) => match(String(r.outcome))).sort((a, b) => sort === "new" ? b.t - a.t : sort === "old" ? a.t - b.t : sort === "high" ? b.amount - a.amount || b.t - a.t : a.amount - b.amount || b.t - a.t);
  const narrow = w > 0 && w < 620;
  const pages = Math.max(1, Math.ceil(list.length / PH_PAGE)); const cur = Math.min(pg, pages - 1); const shown = list.slice(cur * PH_PAGE, cur * PH_PAGE + PH_PAGE);
  const money2 = (n: number) => `$${n.toFixed(2)}`;
  const open = (r: any) => window.dispatchEvent(new CustomEvent("mandate:attempt", { detail: r }));
  const head = (key: "date" | "amount", label: string) => { const on = key === "date" ? sort === "new" || sort === "old" : sort === "high" || sort === "low";
    const next: PhSort = key === "date" ? (sort === "new" ? "old" : "new") : (sort === "high" ? "low" : "high");
    const arrow = !on ? "" : sort === "new" || sort === "high" ? " ↓" : " ↑";
    return <button className={`ph-sort ${on ? "on" : ""}`} onClick={() => { setSort(next); setPg(0); }} aria-label={`Sort by ${label}`}>{label}{arrow}</button>; };
  return (
    <div className="w-ph" ref={ref}>
      <div className="ph-bar">
        <div className="ph-chips" role="group" aria-label="Filter by outcome">{PH_FILTERS.filter(([k]) => k === "all" || counts[k] > 0).map(([k, l]) =>
          <button key={k} className={`ph-chip ${f === k ? "on" : ""} ${k}`} aria-pressed={f === k} onClick={() => { setF(k); setPg(0); }}>{l}<span>{counts[k]}</span></button>)}</div>
        <label className="ph-select"><span className="sr">Sort</span><select value={sort} onChange={(e) => { setSort(e.target.value as PhSort); setPg(0); }}>
          <option value="new">Newest first</option><option value="old">Oldest first</option><option value="high">Highest amount</option><option value="low">Lowest amount</option></select></label>
      </div>
      {!narrow && <div className="ph-row ph-head" aria-hidden><span /><span>Item</span><span>Shop</span><span>Outcome</span>{head("date", "Date")}<span className="r">{head("amount", "Amount")}</span></div>}
      <div className="ph-list" role="list">
        {list.length === 0 ? <p className="w-sub ph-empty">Nothing here for this filter.</p> : shown.map((r) => {
          const tone = PH_TONE[String(r.outcome)] ?? "muted"; const date = new Date(r.t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
          return <button key={String(r.id)} role="listitem" className={`ph-row ${narrow ? "narrow" : ""}`} onClick={() => open(r)} title="Open receipt">
            <span className="ph-thumb">{r.image ? <img src={String(r.image)} alt="" loading="lazy" /> : <i>{String(r.merchant || r.item || "?").charAt(0).toUpperCase()}</i>}</span>
            <span className="ph-item"><b>{String(r.item)}</b><span>{narrow ? `${r.merchant || "—"} · ${date}` : String(r.mandate ?? "").split(" · ")[0]}</span></span>
            {!narrow && <span className="ph-agent">{String(r.merchant || "—")}</span>}
            {!narrow && <span><span className={`ph-out ${tone}`}>{PH_LABEL[String(r.outcome)] ?? String(r.outcome)}</span></span>}
            {!narrow && <span className="ph-date">{date}</span>}
            <span className="ph-amt r"><b className={`num ${tone === "bad" ? "strike" : ""}`}>{money2(r.amount)}</b>{narrow && <span className={`ph-out ${tone}`}>{PH_LABEL[String(r.outcome)] ?? String(r.outcome)}</span>}</span>
          </button>; })}
      </div>
      {list.length > PH_PAGE && <div className="ph-pager"><span className="w-sub">{cur * PH_PAGE + 1}–{Math.min(list.length, (cur + 1) * PH_PAGE)} of {list.length}</span>
        <div className="row"><button className="ph-pg" disabled={cur === 0} onClick={() => setPg(cur - 1)} aria-label="Previous page">‹ Prev</button><button className="ph-pg" disabled={cur >= pages - 1} onClick={() => setPg(cur + 1)} aria-label="Next page">Next ›</button></div></div>}
    </div>
  );
}

/* ---------- Registry ---------- */
const icon = (d: string) => ({ url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#1d4f3f' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${d}</svg>`)}` });
const field = (roles: string[], required = true) => ({ type: "field", supportedRoles: roles, requires: { cardinality: "one" }, required });
const def = (id: string, label: string, d: string, slots: [string, string, string[], boolean?][], comp: any, size: [number, number], ai: string) => ({
  id, label, icon: icon(d), comp, defaultSize: { width: size[0], height: size[1] }, minSize: { width: 240, height: 120 }, ai: { description: ai },
  dataMapping: Object.fromEntries(slots.map(([k, , roles, req]) => [k, field(roles, req ?? true)])),
  form: (p: any) => p.createDefaults({ dataMappingItems: slots.map(([key, l]) => ({ key, label: l })) }),
});
const CAT = ["category"], NUM = ["numeric"];

export const consoleWidgets = createWidgets<any>({
  additionalTypes: [
    def("spend-summary", "Spend summary", "<rect x='3' y='5' width='18' height='14' rx='3'/><path d='M8 9v6M12 11v4M16 8v7'/>", [["outcome", "Outcome", CAT], ["count", "Attempts", NUM], ["spent", "Spent", NUM], ["amount", "Attempted", NUM]], SpendSummary, [960, 120],
      "Four headline numbers: spent (and purchase count), value stopped by rules, how often the agent asked the person, and refunds. Map outcome = attempts.outcome, count = sum(attempts.attempts), spent = sum(attempts.spent), amount = sum(attempts.amount)."),
    def("spend-trend", "Spending over time", "<path d='M4 19V9M10 19V5M16 19v-7M22 19H2'/>", [["date", "Date", ["category", "date"]], ["spent", "Spent", NUM], ["blocked", "Blocked", NUM, false]], SpendTrend, [640, 300],
      "Spending by day (or by week when the range is over five weeks), with blocked value stacked on top; dates read like 'Oct 5'. Map date = attempts.day, spent = sum(attempts.spent), blocked = sum(attempts.blockedAmount)."),
    def("spend-breakdown", "Where it went", "<circle cx='12' cy='12' r='8'/><path d='M12 4v8l6 5'/>", [["category", "Category", CAT], ["shop", "Shop", CAT], ["spent", "Spent", NUM]], Breakdown, [360, 300],
      "Spent amount ranked by category or by shop, with a toggle. Map category = attempts.category, shop = attempts.merchant, spent = sum(attempts.spent)."),
    def("mandate-meter", "Budget meters", "<rect x='3' y='9' width='18' height='6' rx='3'/><path d='M3 12h10'/>", [["mandate", "Mandate", CAT], ["spent", "Spent", NUM], ["budget", "Budget", NUM], ["askAbove", "Ask above", NUM, false]], MandateMeter, [480, 260],
      "Budget meter per spending mandate: map mandate = mandates.title, spent = sum(attempts.spentThisMonth) (or sum(attempts.spent) for all time), budget = max(mandates.budget), askAbove = max(mandates.askAbove)."),
    def("decision-flow", "How rules decided", "<path d='M4 12h5M9 12l5-6h6M9 12h11M9 12l5 6h6'/>", [["outcome", "Outcome", CAT], ["value", "Value", NUM]], DecisionFlow, [520, 260],
      "How agent payment attempts split: bought on its own (Allowed, Refunded), asked you first (Approved / Declined / Waiting), Blocked. Map outcome = attempts.outcome and value = sum(attempts.attempts) for counts, or sum(attempts.amount) for value."),
    def("mandate-cards", "Mandate cards", "<path d='M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z'/>", [["mandate", "Mandate", CAT], ["outcome", "Outcome", CAT], ["count", "Attempts", NUM], ["spent", "Spent", NUM], ["amount", "Attempted", NUM]], MandateCards, [960, 280],
      "One card per active spending mandate: its budget, ask-above limit, categories and end date, plus what the agent spent, bought, asked and was blocked on. Map mandate = attempts.mandate, outcome = attempts.outcome, count = sum(attempts.attempts), spent = sum(attempts.spent), amount = sum(attempts.amount)."),
    def("purchase-history", "Purchase history", "<path d='M4 6h16M4 12h16M4 18h10'/>", PH_SLOTS.map((k) => [k, k, k === "amount" ? NUM : CAT, ["id", "item", "outcome", "amount"].includes(k)] as [string, string, string[], boolean]), PurchaseHistory, [960, 420],
      "Every purchase the agent made or tried, newest first, with outcome filters (bought, approved by you, declined by you, blocked, refunded) and sorting by date or amount; clicking a row opens its receipt. Map each slot to the attempts field of the same name, with amount = sum(attempts.amount)."),
    def("rule-list", "Which rule decided", "<path d='M5 6h14M5 12h10M5 18h6'/>", [["rule", "Rule", CAT], ["count", "Attempts", NUM]], RuleList, [400, 300],
      "Mandate rules ranked by how many attempts they decided, with a plain-language explanation of each. Map rule = attempts.rule, count = sum(attempts.attempts)."),
  ],
  // Mandate widgets first, then every built-in group (a custom menu replaces the default one).
  menu: [{ label: "Mandate", widgetIds: ["spend-summary", "spend-trend", "spend-breakdown", "mandate-meter", "decision-flow", "mandate-cards", "rule-list", "purchase-history"] }, ..._WIDGET_MENU],
} as any);
