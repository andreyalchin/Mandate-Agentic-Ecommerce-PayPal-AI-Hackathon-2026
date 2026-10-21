import { useEffect, useMemo, useState } from "react";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { AgStudioAiModule, type AgStudioMode } from "ag-studio";
import { buildStudioData, type ConsoleData } from "./data";
import { consoleReport, mobileReport, pageRows, pageTitles } from "./report";
import { consoleWidgets } from "./widgets";
import { mandateTheme } from "./theme";
import { buildAi } from "./ai";
import { aiToolDisplay } from "./toolDisplay";
import "./console.css";

export default function ConsolePage({ licenseKey }: { licenseKey?: string }) {
  const [data, setData] = useState<ConsoleData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<AgStudioMode>("view");
  const [page, setPage] = useState(consoleReport.selectedPageId);
  const [api, setApi] = useState<any>(null);
  const phoneQuery = "(max-width: 899px)";
  const [phone, setPhone] = useState(() => matchMedia(phoneQuery).matches);
  useEffect(() => { const mq = matchMedia(phoneQuery); const f = () => setPhone(mq.matches); mq.addEventListener("change", f); return () => mq.removeEventListener("change", f); }, []);
  useEffect(() => { if (phone && mode === "edit") setMode("view"); }, [phone]);
  const report = phone ? mobileReport : consoleReport;
  const rows = pageRows((report as any).pages.find((p: any) => p.id === page) ?? (report as any).pages[0]);
  useEffect(() => { fetch("/api/console/data").then((r) => r.json()).then(setData).catch(() => setErr("Couldn't load spending data.")); }, []);
  const studioData = useMemo(() => (data ? buildStudioData(data) : undefined), [data]);
  const ai = useMemo(() => buildAi(), []);
  const live = data?.attempts.filter((a) => a.source === "Live").length ?? 0;
  return (
    <main className="console">
      <div className="console-bar">
        <div><h1>Spend console</h1><p className="muted sm sub">Every agent payment attempt and the rule that decided it.{data && <> <span className="num">{live}</span> live · <span className="num">{data.attempts.length - live}</span> simulated.</>}</p></div>
        <div className="console-actions">
          <nav className="seg" aria-label="Pages">{Object.entries(pageTitles).map(([id, t]) => <button key={id} className={page === id ? "on" : ""} aria-pressed={page === id} onClick={() => { setPage(id); api?.setSelectedPage?.(id); }}>{t}</button>)}</nav>
          {mode === "view" && <button className="btn sm primary desktop-only" onClick={() => setMode("edit")}>Ask the auditor</button>}
          <button className="btn sm desktop-only" onClick={() => setMode(mode === "view" ? "edit" : "view")}>{mode === "view" ? "Edit layout" : "Done"}</button>
        </div>
      </div>
      <div className={`studio-host ${phone ? "phone" : ""}`} style={phone ? { height: rows * 18 + 48 } : undefined}>
        {err ? <p className="hint err">{err}</p> : !studioData ? <div className="skeleton" style={{ height: 420, borderRadius: 14 }} /> : (
          <AgStudioProvider licenseKey={licenseKey} modules={[AgStudioAiModule]}>
            <AgStudio key={phone ? "phone" : "desk"} style={{ height: "100%", width: "100%" }} theme={mandateTheme} layout={{ widgetBorderEnabled: true }} panels={{ edit: { left: ["data"], right: ["ai", "edit", "filters"] }, view: { right: ["filters"] } }} data={studioData} widgets={consoleWidgets} ai={ai} aiToolDisplay={aiToolDisplay} initialState={report} mode={mode}
              onApiReady={(e: any) => setApi(e.api)} onStateUpdated={(e: any) => e.state?.selectedPageId && setPage(e.state.selectedPageId)} />
          </AgStudioProvider>
        )}
      </div>
    </main>
  );
}
