import { useEffect, useMemo, useState } from "react";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { AgStudioAiModule, type AgStudioMode } from "ag-studio";
import { buildStudioData, type ConsoleData } from "./data";
import { consoleReport, pageTitles } from "./report";
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
  useEffect(() => { fetch("/api/console/data").then((r) => r.json()).then(setData).catch(() => setErr("Couldn't load spending data.")); }, []);
  const studioData = useMemo(() => (data ? buildStudioData(data) : undefined), [data]);
  const ai = useMemo(() => buildAi(), []);
  const live = data?.attempts.filter((a) => a.source === "Live").length ?? 0;
  return (
    <main className="console">
      <div className="console-bar">
        <div><h1>Spend console</h1><p className="muted sm">Every agent payment attempt, the rule that decided it, and what moved through PayPal. {data && <>{live} live · {data.attempts.length - live} simulated</>}</p></div>
        <div className="row">
          <nav className="seg" aria-label="Pages">{Object.entries(pageTitles).map(([id, t]) => <button key={id} className={page === id ? "on" : ""} onClick={() => { setPage(id); api?.setSelectedPage?.(id); }}>{t}</button>)}</nav>
          {mode === "view" && <button className="btn sm primary" onClick={() => setMode("edit")}>Ask the auditor</button>}
          <button className="btn sm" onClick={() => setMode(mode === "view" ? "edit" : "view")}>{mode === "view" ? "Edit layout" : "Done"}</button>
        </div>
      </div>
      <div className="studio-host">
        {err ? <p className="hint err">{err}</p> : !studioData ? <div className="skeleton" style={{ height: 420, borderRadius: 14 }} /> : (
          <AgStudioProvider licenseKey={licenseKey} modules={[AgStudioAiModule]}>
            <AgStudio style={{ height: "100%", width: "100%" }} theme={mandateTheme} layout={{ widgetBorderEnabled: true }} panels={{ edit: { left: ["data"], right: ["ai", "edit", "filters"] }, view: { right: ["filters"] } }} data={studioData} widgets={consoleWidgets} ai={ai} aiToolDisplay={aiToolDisplay} initialState={consoleReport} mode={mode}
              onApiReady={(e: any) => setApi(e.api)} onStateUpdated={(e: any) => e.state?.selectedPageId && setPage(e.state.selectedPageId)} />
          </AgStudioProvider>
        )}
      </div>
    </main>
  );
}
