// Two custom AG Studio widgets built for agent spending:
//  - Mandate meter: spent vs budget per mandate, with the ask-above threshold marked.
//  - Decision flow: how attempts split into allowed, needed-you and blocked, and what happened next.
import { useEffect, useState } from "react";
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

const money = (n: number) => `$${(Number(n) || 0).toFixed(Number(n) % 1 ? 2 : 0)}`;

function MandateMeter(props: any) {
  const dm = props.dataMapping ?? {};
  const f = (dm2: any) => [dm2.mandate?.[0], dm2.spent?.[0], dm2.budget?.[0], dm2.askAbove?.[0]];
  const rows = useRows(props, f);
  if (!rows) return null;
  const [mf, sf, bf, af] = f(dm);
  return (
    <div className="mw-meter" role="list">
      {rows.map((r, i) => {
        const name = String(pick(r, mf, 0) ?? ""); const spent = Number(pick(r, sf, 1) ?? 0); const budget = Number(pick(r, bf, 2) ?? 0); const ask = Number(pick(r, af, 3) ?? 0);
        const pct = budget ? Math.min(100, (spent / budget) * 100) : 0; const over = budget && spent > budget;
        return (
          <div key={i} className="mw-row" role="listitem">
            <div className="mw-top"><span className="mw-name" title={name}>{name}</span><span className={`mw-num ${over ? "over" : ""}`}>{money(spent)} <span>of {money(budget)}</span></span></div>
            <div className="mw-bar"><span className={over ? "over" : pct > 85 ? "hot" : ""} style={{ width: `${pct}%` }} />{ask > 0 && budget > 0 && <i title={`Ask above ${money(ask)}`} style={{ left: `${Math.min(100, (ask / budget) * 100)}%` }} />}</div>
            {ask > 0 && <div className="mw-fine">Single purchases above {money(ask)} need a tap{over ? " · over budget by approval" : ""}</div>}
          </div>
        );
      })}
    </div>
  );
}

const GROUPS: { key: string; label: string; tone: string; outcomes: string[] }[] = [
  { key: "allow", label: "Allowed", tone: "ok", outcomes: ["Allowed", "Refunded"] },
  { key: "you", label: "Needed you", tone: "warn", outcomes: ["Approved by you", "Declined by you", "Waiting for you"] },
  { key: "deny", label: "Blocked", tone: "bad", outcomes: ["Blocked"] },
];

function DecisionFlow(props: any) {
  const dm = props.dataMapping ?? {};
  const f = (d: any) => [d.outcome?.[0], d.value?.[0]];
  const rows = useRows(props, f);
  if (!rows) return null;
  const [of, vf] = f(dm);
  const by = new Map<string, number>(); for (const r of rows) by.set(String(pick(r, of, 0)), Number(pick(r, vf, 1) ?? 0));
  const total = [...by.values()].reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="mw-flow">
      <div className="mw-total"><b>{[...by.values()].reduce((a, b) => a + b, 0).toLocaleString()}</b><span>agent attempts</span></div>
      <div className="mw-groups">
        {GROUPS.map((g) => { const n = g.outcomes.reduce((a, o) => a + (by.get(o) ?? 0), 0); return (
          <div key={g.key} className={`mw-group ${g.tone}`} style={{ flexGrow: Math.max(n, total * 0.12) }}>
            <div className="mw-ghead"><span>{g.label}</span><b>{n.toLocaleString()}</b><em>{Math.round((n / total) * 100)}%</em></div>
            <ul>{g.outcomes.filter((o) => (by.get(o) ?? 0) > 0).map((o) => <li key={o}><span>{o}</span><b>{(by.get(o) ?? 0).toLocaleString()}</b></li>)}</ul>
          </div>); })}
      </div>
    </div>
  );
}

export const consoleWidgets = createWidgets<any>({
  additionalTypes: [
    {
      id: "mandate-meter", label: "Mandate meter", icon: { url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%231F4D3F' stroke-width='2'%3E%3Crect x='3' y='9' width='18' height='6' rx='3'/%3E%3Cpath d='M3 12h10'/%3E%3C/svg%3E" },
      dataMapping: {
        mandate: { type: "field", supportedRoles: ["category"], requires: { cardinality: "one" }, required: true },
        spent: { type: "field", supportedRoles: ["numeric"], requires: { cardinality: "one" }, required: true },
        budget: { type: "field", supportedRoles: ["numeric"], requires: { cardinality: "one" }, required: true },
        askAbove: { type: "field", supportedRoles: ["numeric"], requires: { cardinality: "one" } },
      },
      form: (p: any) => p.createDefaults({ dataMappingItems: [{ key: "mandate", label: "Mandate" }, { key: "spent", label: "Spent" }, { key: "budget", label: "Budget" }, { key: "askAbove", label: "Ask above" }] }),
      comp: MandateMeter, defaultSize: { width: 480, height: 260 }, minSize: { width: 260, height: 140 },
      ai: { description: "Budget meter per spending mandate: map mandate = mandates.summary, spent = sum(attempts.spentThisMonth) (or sum(attempts.spent) for all time), budget = max(mandates.budget), askAbove = max(mandates.askAbove). Shows spent vs budget with the approval threshold marked." },
    },
    {
      id: "decision-flow", label: "Decision flow", icon: { url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%231F4D3F' stroke-width='2'%3E%3Cpath d='M4 12h5M9 12l5-6h6M9 12l5 0h6M9 12l5 6h6'/%3E%3C/svg%3E" },
      dataMapping: {
        outcome: { type: "field", supportedRoles: ["category"], requires: { cardinality: "one" }, required: true },
        value: { type: "field", supportedRoles: ["numeric"], requires: { cardinality: "one" }, required: true },
      },
      form: (p: any) => p.createDefaults({ dataMappingItems: [{ key: "outcome", label: "Outcome" }, { key: "value", label: "Value" }] }),
      comp: DecisionFlow, defaultSize: { width: 520, height: 260 }, minSize: { width: 300, height: 160 },
      ai: { description: "How agent payment attempts split by policy outcome: Allowed (and Refunded), Needed you (Approved / Declined / Waiting), Blocked. Map outcome = attempts.outcome and value = sum(attempts.attempts) for counts, or sum(attempts.amount) for value." },
    },
  ],
  // Mandate widgets first, then every built-in group (a custom menu replaces the default one).
  menu: [{ label: "Mandate", widgetIds: ["mandate-meter", "decision-flow"] }, ..._WIDGET_MENU],
} as any);
