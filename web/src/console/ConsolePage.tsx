import { useEffect, useMemo, useRef, useState } from "react";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { AgStudioAiModule, type AgStudioMode } from "ag-studio";
import { buildStudioData, type ConsoleData } from "./data";
import { pageRows, pageTitles, reportFor } from "./report";
import { consoleWidgets } from "./widgets";
import { mandateTheme } from "./theme";
import { buildAi } from "./ai";
import { aiToolDisplay } from "./toolDisplay";
import { Icon, Spinner } from "../ui";
import { api, mandateTitle, type Mandate } from "../api";
import { AttemptModal, type AttemptLite } from "../Receipt";
import { DrillModal, type DrillReq } from "./Drill";
import "./console.css";

type Period = "month" | "30" | "90" | "all";
type Source = "mine" | "sample";
const PERIODS: [Period, string][] = [["month", "This month"], ["30", "30 days"], ["90", "90 days"], ["all", "All time"]];
const fmtDay = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

function since(p: Period, now = new Date()) {
  if (p === "all") return null;
  if (p === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  return new Date(now.getTime() - Number(p) * 86400e3);
}

type Removal = { name: string; kind: "sample" | "builtin" | "key"; mandates: { id: string; title: string; keyId?: string }[] };

export default function ConsolePage({ licenseKey, mandates = [], onChanged }: { licenseKey?: string; mandates?: Mandate[]; onChanged?: () => void }) {
  const [data, setData] = useState<ConsoleData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<AgStudioMode>("view");
  const [page, setPage] = useState("overview");
  const [period, setPeriod] = useState<Period>("90");
  const [source, setSource] = useState<Source | null>(null);
  const [mid, setMid] = useState("all");
  const phoneQuery = "(max-width: 899px)";
  const [phone, setPhone] = useState(() => matchMedia(phoneQuery).matches);
  useEffect(() => { const mq = matchMedia(phoneQuery); const f = () => setPhone(mq.matches); mq.addEventListener("change", f); return () => mq.removeEventListener("change", f); }, []);
  useEffect(() => { if (phone && mode === "edit") setMode("view"); }, [phone]);
  const loadData = () => fetch("/api/console/data").then((r) => r.json()).then((d: ConsoleData) => {
      setData(d);
      const mine = d.attempts.filter((a) => a.source === "Live").length;
      setSource((s) => s ?? (mine > 0 ? "mine" : "sample"));
    }).catch(() => setErr("Couldn't load spending data."));
  useEffect(() => { loadData(); }, []);
  // Purchase history rows open a receipt; agent cards ask to remove an agent (both dispatched from AG Studio widgets).
  const [attempt, setAttempt] = useState<AttemptLite | null>(null); const [drill, setDrill] = useState<DrillReq | null>(null);
  const [removal, setRemoval] = useState<Removal | null>(null); const [rmBusy, setRmBusy] = useState(false); const [toast, setToast] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(JSON.parse(sessionStorage.getItem("mandate.hiddenSampleAgents") ?? "[]")));
  useEffect(() => { sessionStorage.setItem("mandate.hiddenSampleAgents", JSON.stringify([...hidden])); }, [hidden]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4200); return () => clearTimeout(t); }, [toast]);

  const src = source ?? "sample";
  const pool = useMemo(() => {
    if (!data) return null;
    const live = src === "mine" ? "Live" : "Simulated";
    return { mandates: data.mandates.filter((m) => m.source === live), attempts: data.attempts.filter((a) => a.source === live && !(live === "Simulated" && hidden.has(a.agent))) };
  }, [data, src, hidden]);
  const srcRef = useMemo(() => ({ src, pool, mandates }), [src, pool, mandates]);
  const ctx = useRef(srcRef); ctx.current = srcRef;
  useEffect(() => {
    const onAttempt = (e: Event) => setAttempt((e as CustomEvent).detail as AttemptLite);
    const onRemove = async (e: Event) => {
      const name = String((e as CustomEvent).detail?.name ?? ""); const { src, pool, mandates } = ctx.current;
      if (src === "sample") { const ids = [...new Set(pool?.attempts.filter((a) => a.agent === name).map((a) => a.mandateId))]; setRemoval({ name, kind: "sample", mandates: ids.map((id) => ({ id, title: pool?.mandates.find((m) => m.id === id)?.title ?? "" })) }); return; }
      const active = mandates.filter((m) => m.status === "active");
      if (name === "Shopping agent") { setRemoval({ name, kind: "builtin", mandates: active.map((m) => ({ id: m.id, title: mandateTitle(m) })) }); return; }
      const keys = (await Promise.all(active.map((m) => api<{ id: string; agentName: string; revoked?: boolean }[]>(`/api/mandates/${m.id}/agent-keys`).then((ks) => ks.filter((k) => !k.revoked && k.agentName === name).map((k) => ({ id: m.id, title: mandateTitle(m), keyId: k.id }))).catch(() => [])))).flat();
      setRemoval({ name, kind: "key", mandates: keys });
    };
    const onDrill = (e: Event) => setDrill((e as CustomEvent).detail as DrillReq);
    addEventListener("mandate:attempt", onAttempt); addEventListener("mandate:remove-agent", onRemove); addEventListener("mandate:drill", onDrill);
    return () => { removeEventListener("mandate:attempt", onAttempt); removeEventListener("mandate:remove-agent", onRemove); removeEventListener("mandate:drill", onDrill); };
  }, []);
  async function confirmRemove(redo = false) {
    if (!removal) return; setRmBusy(true);
    try {
      if (removal.kind === "sample") { setHidden((h) => new Set([...h, removal.name])); setToast(`${removal.name} removed from the sample household.`); }
      else if (removal.kind === "key") { for (const m of removal.mandates) await api(`/api/agent-keys/${m.keyId}/revoke`, {}); setToast(`${removal.name} can no longer spend. Its past purchases stay in your history.`); }
      else { for (const m of removal.mandates) await api(`/api/mandates/${m.id}/revoke`, {}); setToast("Mandate deleted. All spending under it has stopped."); }
      setRemoval(null); await loadData(); onChanged?.();
      if (redo) { location.hash = "#/"; dispatchEvent(new CustomEvent("mandate:new")); }
    } finally { setRmBusy(false); }
  }
  const view = useMemo(() => {
    if (!pool || !data) return null;
    const from = since(period);
    const attempts = pool.attempts.filter((a) => (mid === "all" || a.mandateId === mid) && (!from || new Date(a.at) >= from));
    const mandates = pool.mandates.filter((m) => mid === "all" || m.id === mid);
    return { asOf: data.asOf, attempts, mandates } as ConsoleData;
  }, [pool, data, period, mid]);
  const studioData = useMemo(() => (view ? buildStudioData(view) : undefined), [view]);
  const ai = useMemo(() => buildAi(), []);
  const counts = useMemo(() => { const a = view?.attempts ?? []; const u = (k: string) => new Set(a.map((x: any) => x[k])).size;
    return { agents: u("agent"), rules: u("rule"), mandates: view?.mandates.length ?? 1, groups: Math.max(u("category"), u("merchant")), rows: a.length }; }, [view]);
  const report = useMemo(() => reportFor(phone, page, counts), [phone, page, counts]);
  const rows = pageRows((report as any).pages.find((p: any) => p.id === page));
  const from = since(period); const first = view?.attempts[0]?.at;
  const rangeText = view ? `${fmtDay(from ?? (first ? new Date(first) : new Date()))} – ${fmtDay(new Date())}` : "";
  const studioKey = `${phone ? "p" : "d"}-${page}-${src}-${period}-${mid}`;

  function exportCsv() {
    if (!view) return;
    const head = ["Date", "Item", "Shop", "Category", "Outcome", "Rule", "Amount", "Spent", "Mandate", "Agent", "Ships to", "PayPal order"];
    const lines = view.attempts.map((a) => [a.at, a.item, a.merchant, a.category, a.outcome, a.rule, a.amount, a.spent, a.mandate, a.agent, a.shipTo ?? "", a.paypalOrderId]);
    const csv = [head, ...lines].map((r) => r.map((c: any) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const el = document.createElement("a"); el.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); el.download = `mandate-spending-${src}-${new Date().toISOString().slice(0, 10)}.csv`; el.click();
  }

  const mineCount = data?.attempts.filter((a) => a.source === "Live").length ?? 0;
  return (
    <main className={`console ${mode === "edit" ? "editing" : ""}`}>
      <div className="page-head">
        <div>
          <h1>Spending</h1>
          <p className="muted sm">{src === "sample" ? "Sample household" : "Your agents"} · {rangeText}{view ? ` · ${view.attempts.length} attempts` : ""}</p>
        </div>
        <div className="row wrap head-actions">
          <button className="btn sm" onClick={exportCsv} disabled={!view?.attempts.length}>{Icon.download(15)} Export CSV</button>
          {!phone && <button className={`btn sm ${mode === "edit" ? "" : "primary"}`} onClick={() => setMode(mode === "view" ? "edit" : "view")}>{mode === "view" ? <>{Icon.sparkle(15)} Ask AI about my spending</> : "Done"}</button>}
        </div>
      </div>

      <div className="toolbar console-toolbar">
        <nav className="utabs" aria-label="Report pages">{Object.entries(pageTitles).map(([id, t]) => <button key={id} className={page === id ? "on" : ""} aria-current={page === id ? "page" : undefined} onClick={() => setPage(id)}>{t}</button>)}</nav>
        <div className="filters">
          <div className="seg" role="radiogroup" aria-label="Period">{PERIODS.map(([p, l]) => <button key={p} role="radio" aria-checked={period === p} className={period === p ? "on" : ""} onClick={() => setPeriod(p)}>{l}</button>)}</div>
          <label className="select"><span className="sr">Mandate</span>
            <select value={mid} onChange={(e) => setMid(e.target.value)}>
              <option value="all">All mandates</option>
              {pool?.mandates.map((m) => <option key={m.id} value={m.id}>{m.title}{m.status === "revoked" ? " (archived)" : ""}</option>)}
            </select>{Icon.chevron(14)}</label>
          <div className="seg" role="radiogroup" aria-label="Data">
            <button role="radio" aria-checked={src === "mine"} className={src === "mine" ? "on" : ""} onClick={() => { setSource("mine"); setMid("all"); }}>Your data</button>
            <button role="radio" aria-checked={src === "sample"} className={src === "sample" ? "on" : ""} onClick={() => { setSource("sample"); setMid("all"); }}>Sample</button>
          </div>
        </div>
      </div>

      {src === "sample" && <div className="banner">{Icon.sparkle(15)}<span><b>You're viewing a sample household.</b> Twelve weeks of simulated purchases decided by the real policy engine; no PayPal calls. {mineCount ? <button className="link" onClick={() => setSource("mine")}>Switch to your data ({mineCount})</button> : "Your own purchases appear under Your data."}</span></div>}

      {err ? <p className="hint err">{err}</p>
        : !studioData ? <div className="skeleton" style={{ height: 520, borderRadius: 16 }} />
        : view && view.attempts.length === 0 ? <section className="card empty-report">
            <span className="empty-icon">{Icon.receipt(22)}</span>
            <p className="empty-title">No agent spending {period === "all" ? "yet" : "in this period"}</p>
            <p className="muted sm">{src === "mine" ? "Ask your agent to buy something and it shows up here with the rule that decided it." : "Try a longer period."}</p>
            <div className="row">{src === "mine" && <a className="btn sm primary" href="#/">Ask your agent</a>}<button className="btn sm" onClick={() => { setSource("sample"); setPeriod("90"); }}>Preview a sample household</button></div>
          </section>
        : <div className={`studio-host ${phone ? "phone" : ""}`} style={phone || mode === "view" ? { height: rows * 18 + 32, minHeight: 0 } : undefined}>
            <AgStudioProvider licenseKey={licenseKey} modules={[AgStudioAiModule]}>
              <AgStudio key={studioKey} style={{ height: "100%", width: "100%" }} theme={mandateTheme} layout={{ widgetBorderEnabled: true }}
                panels={{ edit: { left: ["data"], right: ["ai", "edit", "filters"] }, view: { right: [] } }} data={studioData} widgets={consoleWidgets} ai={ai} aiToolDisplay={aiToolDisplay} initialState={report} mode={mode}
                onStateUpdated={(e: any) => { const id = e.state?.selectedPageId; if (id && id !== page && pageTitles[id]) setPage(id); }} />
            </AgStudioProvider>
          </div>}
      {src === "sample" && hidden.size > 0 && page === "agents" && <p className="xs muted center restore">{hidden.size} sample agent{hidden.size === 1 ? "" : "s"} removed. <button className="link" onClick={() => setHidden(new Set())}>Bring them back</button></p>}
      {drill && view && <DrillModal req={drill} rows={view.attempts as any} blocked={!!attempt} onOpen={(a) => setAttempt(a)} onClose={() => setDrill(null)} />}
      {attempt && <AttemptModal a={attempt} onClose={() => setAttempt(null)} onChanged={() => { loadData(); onChanged?.(); }} />}
      {removal && <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setRemoval(null)}>
        <div className="modal confirm card" role="alertdialog" aria-modal="true" aria-labelledby="rm-t">
          <h2 id="rm-t">Remove {removal.name}?</h2>
          {removal.kind === "sample" ? <p className="sm muted">This hides {removal.name} and its purchases from the sample household. Sample data only, so nothing else changes.</p>
            : removal.kind === "key" ? (removal.mandates.length ? <p className="sm muted">{removal.name} loses its key for <b>{removal.mandates.map((m) => m.title).join(", ")}</b> and can't spend again. Its past purchases and receipts stay in your history.</p>
                : <p className="sm muted">{removal.name} is already disconnected. Its past purchases stay in your history.</p>)
            : removal.mandates.length ? <p className="sm muted">The built-in Shopping agent belongs to its mandate, so removing it deletes <b>{removal.mandates.map((m) => m.title).join(", ")}</b> and stops every agent under it. Orders and receipts stay in your history. Set a mistake right by creating a new budget.</p>
              : <p className="sm muted">There's no active mandate for the Shopping agent, so it can't spend.</p>}
          <div className="row end wrap">
            <button className="btn ghost sm" onClick={() => setRemoval(null)}>Cancel</button>
            {removal.kind === "builtin" && removal.mandates.length > 0 && <button className="btn sm" disabled={rmBusy} onClick={() => confirmRemove(true)}>Delete and set a new budget</button>}
            {(removal.kind === "sample" || removal.mandates.length > 0) && <button className="btn danger sm" disabled={rmBusy} onClick={() => confirmRemove()}>{rmBusy ? <Spinner /> : null} {removal.kind === "builtin" ? "Delete mandate" : "Remove agent"}</button>}
          </div>
        </div>
      </div>}
      {toast && <p className="toast" role="status">{toast}</p>}
    </main>
  );
}
