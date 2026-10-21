import { useEffect, useMemo, useState } from "react";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { AgStudioAiModule, type AgStudioMode } from "ag-studio";
import { buildStudioData, type ConsoleData } from "./data";
import { pageRows, pageTitles, reportFor } from "./report";
import { consoleWidgets } from "./widgets";
import { mandateTheme } from "./theme";
import { buildAi } from "./ai";
import { aiToolDisplay } from "./toolDisplay";
import { Icon } from "../ui";
import type { Mandate } from "../api";
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

export default function ConsolePage({ licenseKey, mandates: _m }: { licenseKey?: string; mandates?: Mandate[] }) {
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
  useEffect(() => {
    fetch("/api/console/data").then((r) => r.json()).then((d: ConsoleData) => {
      setData(d);
      const mine = d.attempts.filter((a) => a.source === "Live").length;
      setSource((s) => s ?? (mine > 0 ? "mine" : "sample"));
    }).catch(() => setErr("Couldn't load spending data."));
  }, []);

  const src = source ?? "sample";
  const pool = useMemo(() => {
    if (!data) return null;
    const live = src === "mine" ? "Live" : "Simulated";
    return { mandates: data.mandates.filter((m) => m.source === live), attempts: data.attempts.filter((a) => a.source === live) };
  }, [data, src]);
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
        : <div className={`studio-host ${phone ? "phone" : ""}`} style={phone ? { height: rows * 18 + 32 } : undefined}>
            <AgStudioProvider licenseKey={licenseKey} modules={[AgStudioAiModule]}>
              <AgStudio key={studioKey} style={{ height: "100%", width: "100%" }} theme={mandateTheme} layout={{ widgetBorderEnabled: true }}
                panels={{ edit: { left: ["data"], right: ["ai", "edit", "filters"] }, view: { right: [] } }} data={studioData} widgets={consoleWidgets} ai={ai} aiToolDisplay={aiToolDisplay} initialState={report} mode={mode}
                onStateUpdated={(e: any) => { const id = e.state?.selectedPageId; if (id && id !== page && pageTitles[id]) setPage(id); }} />
            </AgStudioProvider>
          </div>}
    </main>
  );
}
