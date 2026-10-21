import { useEffect, useState } from "react";
import { api, USER_ID, type Mandate, type Wallet } from "./api";
import { Dashboard } from "./Dashboard";
import { Setup } from "./Setup";
import { Icon, Pill, Skeleton, Wordmark } from "./ui";

export function App() {
  const [boot, setBoot] = useState(true);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [newMandate, setNewMandate] = useState(false);
  useEffect(() => {
    Promise.all([api<Wallet[]>("/api/wallets"), api<Mandate[]>(`/api/mandates?userId=${USER_ID}`)])
      .then(([w, m]) => { setWallet(w[0] ?? null); setMandate(m.find((x) => x.status === "active") ?? m[0] ?? null); })
      .catch(() => {}).finally(() => setBoot(false));
  }, []);
  const showDash = mandate && !newMandate;
  return (
    <div className="app">
      <header className="top">
        <Wordmark />
        <div className="row">
          <Pill tone="neutral">Sandbox</Pill>
          {wallet && <Pill tone="ink">{Icon.check(12)} PayPal linked</Pill>}
        </div>
      </header>
      {boot ? <main className="setup"><section className="card"><Skeleton lines={5} /></section></main>
        : showDash ? <Dashboard mandateId={mandate!.id} onReset={() => setNewMandate(true)} />
        : <Setup wallet={wallet} onWallet={setWallet} onSigned={(m) => { setMandate(m); setNewMandate(false); }} />}
      <footer className="foot"><span>Mandate · PayPal sandbox demo</span><a href="/harness.html">Developer harness</a></footer>
    </div>
  );
}
