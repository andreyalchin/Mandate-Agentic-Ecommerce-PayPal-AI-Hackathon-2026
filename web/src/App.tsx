import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { api, USER_ID, type Mandate, type Wallet } from "./api";
import { Dashboard } from "./Dashboard";
import { Setup } from "./Setup";
import { Orders } from "./Orders";
import { Shop } from "./Shop";
import { CreatedBy } from "./CreatedBy";
import { Icon, Skeleton, Spinner, Wordmark, useDismiss } from "./ui";

// AG Studio is large, so the spending report loads only when opened.
const ConsolePage = lazy(() => import("./console/ConsolePage"));
const useHash = () => { const [h, setH] = useState(location.hash); useEffect(() => { const f = () => setH(location.hash); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []); return h; };
const CURRENT = "mandate.current";

type Route = "agent" | "shop" | "orders" | "spending";
const routeOf = (h: string): Route => (h.startsWith("#/shop") ? "shop" : h.startsWith("#/orders") ? "orders" : h.startsWith("#/spending") || h.startsWith("#/console") ? "spending" : "agent");

function AccountMenu({ wallet, onReset }: { wallet: Wallet | null; onReset: (mode: "fresh" | "new") => Promise<void> }) {
  const [open, setOpen] = useState(false); const [confirm, setConfirm] = useState<"fresh" | "new" | null>(null); const [busy, setBusy] = useState(false);
  const ref = useDismiss(open, () => { setOpen(false); setConfirm(null); });
  const run = async (m: "fresh" | "new") => { setBusy(true); try { await onReset(m); } finally { setBusy(false); setOpen(false); setConfirm(null); } };
  return (
    <div className="acct" ref={ref}>
      <button className="acct-btn" aria-haspopup="menu" aria-expanded={open} aria-label="Account" onClick={() => setOpen(!open)}>{Icon.user(18)}</button>
      {open && <div className="menu" role="menu">
        <div className="menu-head">
          <span className="menu-avatar">{Icon.user(18)}</span>
          <div><b>This browser's session</b><span className="xs muted">{wallet ? "PayPal sandbox linked" : "PayPal not linked"} · private to you</span></div>
        </div>
        {confirm ? <div className="menu-confirm">
          <p className="sm"><b>{confirm === "fresh" ? "Start fresh?" : "Start as a new tester?"}</b></p>
          <p className="xs muted">{confirm === "fresh" ? "Your mandates, orders and history here are cleared. PayPal stays linked, so you go straight to describing a new mandate." : "Everything is cleared and PayPal is unlinked, as if someone else opened the app. You'll link PayPal again with the sandbox buyer."} PayPal keeps its own sandbox records.</p>
          <div className="row"><button className="btn sm danger" disabled={busy} onClick={() => run(confirm)}>{busy ? <Spinner /> : null}{confirm === "fresh" ? "Clear and start fresh" : "Start as new tester"}</button><button className="btn sm ghost" onClick={() => setConfirm(null)}>Cancel</button></div>
        </div> : <>
          <button role="menuitem" className="menu-item" onClick={() => setConfirm("fresh")}>{Icon.refresh(16)}<span><b>Start fresh</b><span>Clear mandates, orders and history. Keep PayPal linked.</span></span></button>
          <button role="menuitem" className="menu-item" onClick={() => setConfirm("new")}>{Icon.logout(16)}<span><b>New tester</b><span>Clear everything and unlink PayPal for the next person.</span></span></button>
          <div className="menu-sep" /><CreatedBy menuItem />
        </>}
      </div>}
    </div>
  );
}

export function App() {
  const [boot, setBoot] = useState(true);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [mandates, setMandates] = useState<Mandate[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(() => localStorage.getItem(CURRENT));
  const [creating, setCreating] = useState(false);
  const [license, setLicense] = useState<string | undefined>();
  const route = routeOf(useHash());
  const [harness, setHarness] = useState(false);
  useEffect(() => { api<{ agStudioLicense?: string; harness?: boolean }>("/api/config").then((c) => { setLicense(c.agStudioLicense); setHarness(!!c.harness); }).catch(() => {}); }, []);
  const load = useCallback(() => Promise.all([api<Wallet[]>("/api/wallets"), api<Mandate[]>(`/api/mandates?userId=${USER_ID}`)])
    .then(([w, m]) => { setWallet(w[0] ?? null); setMandates(m); }).catch(() => {}).finally(() => setBoot(false)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const f = () => setCreating(true); addEventListener("mandate:new", f); return () => removeEventListener("mandate:new", f); }, []);
  const current = mandates.find((m) => m.id === currentId) ?? mandates.find((m) => m.status === "active") ?? mandates[0] ?? null;
  const select = (id: string) => { setCurrentId(id); localStorage.setItem(CURRENT, id); setCreating(false); };
  async function reset(mode: "fresh" | "new") {
    await api("/api/session/reset", { mode });
    localStorage.removeItem(CURRENT); setCurrentId(null); setMandates([]); setCreating(false);
    if (mode === "new") setWallet(null);
    location.hash = "#/"; await load();
  }
  const page = route === "spending" ? <Suspense fallback={<main className="setup"><section className="card"><Skeleton lines={5} /></section></main>}><ConsolePage licenseKey={license} mandates={mandates} onChanged={load} /></Suspense>
    : route === "orders" ? <Orders mandates={mandates} />
    : route === "shop" ? (boot ? <main className="setup"><section className="card"><Skeleton lines={5} /></section></main> : <Shop mandates={mandates} onPick={(id) => { setCurrentId(id); localStorage.setItem(CURRENT, id); }} />)
    : boot ? <main className="setup"><section className="card"><Skeleton lines={5} /></section></main>
    : current && !creating ? <Dashboard key={current.id} mandateId={current.id} mandates={mandates} onSelect={select} onNew={() => setCreating(true)} onChanged={load} onReset={() => { load(); }} />
    : <Setup wallet={wallet} onWallet={setWallet} onCancel={current ? () => setCreating(false) : undefined} onSigned={(m) => { setMandates((x) => [m, ...x]); select(m.id); }} />;
  return (
    <div className={`app route-${route}`}>
      <header className="top">
        <div className="row nav-left"><a href="#/" className="home" aria-label="Mandate home"><Wordmark /></a>
          <nav className="tabs" aria-label="Sections">
            <a href="#/" className={route === "agent" ? "on" : ""}>Agent</a>
            <a href="#/shop" className={route === "shop" ? "on" : ""}>Shop</a>
            <a href="#/orders" className={route === "orders" ? "on" : ""}>Orders</a>
            <a href="#/spending" className={route === "spending" ? "on" : ""}>Spending</a>
          </nav>
        </div>
        <div className="row top-right">
          <span className="pill sandbox" title="PayPal sandbox: no real money moves">Sandbox</span>
          <AccountMenu wallet={wallet} onReset={reset} />
        </div>
      </header>
      {page}
      <footer className="foot"><span>Mandate · PayPal sandbox demo{harness && <> · <a href="/harness.html">Developer harness</a></>}</span><CreatedBy /></footer>
    </div>
  );
}
