import { useState } from "react";
import { api, amt, CATEGORIES, dateOf, per, USER_ID, type Category, type Mandate, type MandateInput, type Wallet } from "./api";
import { Icon, MicButton, PayPalButton, Spinner } from "./ui";
import { useSpeech } from "./speech";

const EXAMPLES = [
  "Keep me stocked on coffee beans, filters and brewing gear. No more than $60 a month, and check with me on anything over $25.",
  "Reorder household basics like dish soap from Corner Supply Co. Up to $40 a month, ask me above $15.",
  "Buy one book I'd like this week, under $30 total.",
];

function Steps({ at }: { at: number }) {
  const names = ["Link PayPal", "Describe", "Review & sign"];
  return <ol className="steps" aria-label="Setup progress">{names.map((n, i) => <li key={n} className={i < at ? "done" : i === at ? "now" : ""} aria-current={i === at ? "step" : undefined}><span className="dot">{i < at ? Icon.check(12) : i + 1}</span>{n}</li>)}</ol>;
}

export function Setup({ wallet, onWallet, onSigned, onCancel }: { wallet: Wallet | null; onWallet: (w: Wallet) => void; onSigned: (m: Mandate) => void; onCancel?: () => void }) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<MandateInput | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [busy, setBusy] = useState<"draft" | "sign" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const step = !wallet ? 0 : !draft ? 1 : 2;
  const speech = useSpeech({ onInterim: setText, onFinal: setText, onError: setErr });

  async function makeDraft() {
    setBusy("draft"); setErr(null);
    try { const d = await api<{ mandate: MandateInput; clarifications: string[] }>("/api/mandates/draft", { text, userId: USER_ID, walletRef: wallet!.walletRef }); setDraft(d.mandate); setQuestions(d.clarifications); }
    catch (e: any) { setErr(e.status === 503 ? "The drafting assistant is offline. Try again in a moment." : "Couldn't draft that. Try describing a budget and what to buy."); }
    finally { setBusy(null); }
  }
  async function sign() {
    setBusy("sign"); setErr(null);
    try { onSigned(await api<Mandate>("/api/mandates", draft)); } catch (e: any) { setErr(e.message); setBusy(null); }
  }
  const set = (patch: Partial<MandateInput>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const toggle = (c: Category) => draft && set({ categories: draft.categories.includes(c) ? draft.categories.filter((x) => x !== c).length ? draft.categories.filter((x) => x !== c) : draft.categories : [...draft.categories, c] });

  return (
    <main className="setup">
      <header className="setup-head">
        {onCancel && <button className="link back" onClick={onCancel}>← Back to my mandates</button>}
        <p className="eyebrow">{onCancel ? "New mandate" : "Agent payments, on your terms"}</p>
        <h1>{onCancel ? "What should this agent take care of?" : "Let an AI agent shop for you, only within rules you sign."}</h1>
        <p className="lede">Every charge is checked against your mandate before PayPal moves money. Anything outside it comes back to you for one tap.</p>
      </header>
      <Steps at={step} />

      {step === 0 && (
        <section className="card step-card" aria-labelledby="s1">
          <h2 id="s1">Link PayPal once</h2>
          <p>PayPal saves your account so your agent can pay within your mandate while you're away. PayPal will show a $1.00 authorization; it's voided right away, so nothing is charged. You can unlink anytime.</p>
          <PayPalButton kind="vault" onDone={(w: any) => onWallet({ walletRef: w.walletRef, label: w.label, createdAt: new Date().toISOString() })} onError={setErr} />
          <p className="fine">Sandbox only: sign in with the test buyer from the README. No real money moves.</p>
        </section>
      )}

      {step === 1 && (
        <section className="card step-card" aria-labelledby="s2">
          <div className="linked">{Icon.check(14)} PayPal linked</div>
          <h2 id="s2">What may your agent buy?</h2>
          <p>Say it the way you'd tell a person: a budget, and when it should check with you.</p>
          <label className="sr" htmlFor="intent">Instructions for your agent</label>
          <div className="speak-box">
            <textarea id="intent" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={speech.listening ? "Listening…" : EXAMPLES[0]} />
            <MicButton supported={speech.supported} listening={speech.listening} onClick={speech.toggle} />
          </div>
          {speech.supported && <p className="fine speak-hint">{Icon.mic(13)} Tap the mic and say it out loud. Your browser transcribes it.</p>}
          <div className="chips" aria-label="Examples">{EXAMPLES.map((e, i) => <button key={i} className="chip" onClick={() => setText(e)}>{e.split(".")[0]}</button>)}</div>
          <div className="row end"><button className="btn primary" disabled={text.trim().length < 8 || !!busy} onClick={makeDraft}>{busy === "draft" ? <><Spinner /> Drafting…</> : <>Draft my mandate</>}</button></div>
        </section>
      )}

      {step === 2 && draft && (
        <section className="card step-card doc" aria-labelledby="s3">
          <div className="doc-head"><span className="eyebrow">Intent mandate · draft</span><button className="link" onClick={() => setDraft(null)}>Edit instructions</button></div>
          <h2 id="s3" className="statement">“{draft.summary}”</h2>
          <dl className="terms">
            <div><dt>Budget</dt><dd><span className="money-in">$<input aria-label="Budget amount" inputMode="decimal" value={draft.budget.amount} onChange={(e) => set({ budget: { ...draft.budget, amount: e.target.value.replace(/[^\d.]/g, "") } })} /></span>
              <select aria-label="Budget period" value={draft.budget.period} onChange={(e) => set({ budget: { ...draft.budget, period: e.target.value as any } })}><option value="month">a month</option><option value="week">a week</option><option value="once">in total</option></select></dd></div>
            <div><dt>Ask me above</dt><dd><span className="money-in">$<input aria-label="Approval threshold" inputMode="decimal" value={draft.approvalAbove} onChange={(e) => set({ approvalAbove: e.target.value.replace(/[^\d.]/g, "") })} /></span><span className="muted">per purchase</span></dd></div>
            <div className="wide"><dt>Allowed categories</dt><dd className="cats">{CATEGORIES.map((c) => <button key={c} className={`cat ${draft.categories.includes(c) ? "on" : ""}`} aria-pressed={draft.categories.includes(c)} onClick={() => toggle(c)}>{c}</button>)}</dd></div>
            <div><dt>Shops</dt><dd>{draft.merchants?.length ? draft.merchants.join(", ") : "Any shop"}</dd></div>
            <div><dt>Expires</dt><dd>{dateOf(draft.expiresAt)}</dd></div>
          </dl>
          {questions.length > 0 && <div className="questions"><p className="eyebrow">{Icon.spark(12)} Worth confirming</p><ul>{questions.map((q, i) => <li key={i}>{q}</li>)}</ul></div>}
          <p className="fine">Signing creates an Ed25519-signed mandate. Your agent can spend up to {amt(draft.budget.amount)} {per(draft.budget.period)}; anything above {amt(draft.approvalAbove)} or outside these categories comes back to you.</p>
          <div className="row end"><button className="btn primary" disabled={!!busy} onClick={sign}>{busy === "sign" ? <><Spinner /> Signing…</> : <>{Icon.key(15)} Sign mandate</>}</button></div>
        </section>
      )}
      {err && <p className="toast err" role="alert">{err}</p>}
    </main>
  );
}
